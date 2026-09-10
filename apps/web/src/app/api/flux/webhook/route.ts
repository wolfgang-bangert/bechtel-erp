/**
 * flux-Status-Webhook.
 *
 *   POST /api/flux/webhook
 *
 * flux ruft diesen Endpoint nach dem Drucken auf und meldet Statuswechsel je
 * Auftrag / orderItem. Absicherung per HMAC `X-Signature` gegen
 * `FLUX_WEBHOOK_SECRET` (hex oder "sha256=<hex>" oder base64). Ist kein Secret
 * gesetzt, wird die Meldung angenommen (Dev) und `signature_ok = null` geloggt.
 *
 * Ablauf: rohen Body loggen -> Events parsen (tolerant ggü. Feldnamen) -> je
 * Event `flux_status_log`-Zeile, `portal_order.flux_status` denormalisieren und
 * getroffene Druckjobs auf den gemappten Status setzen
 * (`setting.flux_status_map`).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// gültige job.status-Werte (Migration 20260907110000)
const JOB_STATES = new Set([
  "offen",
  "in_batch",
  "an_flux",
  "im_druck",
  "gedruckt",
  "cellophaniert",
  "fertig",
  "storniert",
]);

type Ev = {
  orderId: string | null;
  orderItemId: string | null;
  status: string | null;
  workStep: string | null;
  event: string | null;
  message: string | null;
};

const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
};

const pick = (o: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = s(o[k]);
    if (v) return v;
  }
  return null;
};

/** normalisiert einen flux-Status-String für den Map-Lookup */
const normStatus = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/** eine oder mehrere Statusmeldungen aus dem Webhook-Body herausziehen */
function parseEvents(body: unknown): Ev[] {
  const roots: Record<string, unknown>[] = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : body && typeof body === "object"
      ? [body as Record<string, unknown>]
      : [];

  const out: Ev[] = [];
  for (const r of roots) {
    const orderId = pick(r, ["orderId", "order_id", "orderNumber", "id"]);
    const event = pick(r, ["event", "type", "eventType", "topic"]);
    const topStatus = pick(r, [
      "status",
      "state",
      "orderStatus",
      "orderItemStatus",
      "newStatus",
    ]);
    const topStep = pick(r, ["workStep", "work_step", "step", "currentWorkStep"]);
    const message = pick(r, ["message", "msg", "note", "text"]);

    // Liste von orderItems im Body?
    const items = ["orderItems", "items", "orderItemIds"].flatMap((k) => {
      const v = r[k];
      return Array.isArray(v) ? v : [];
    });

    if (items.length) {
      for (const it of items) {
        if (it && typeof it === "object") {
          const io = it as Record<string, unknown>;
          out.push({
            orderId: orderId ?? pick(io, ["orderId", "order_id"]),
            orderItemId: pick(io, [
              "orderItemId",
              "order_item_id",
              "itemId",
              "id",
            ]),
            status: pick(io, ["status", "state", "orderItemStatus"]) ?? topStatus,
            workStep: pick(io, ["workStep", "work_step", "step"]) ?? topStep,
            event,
            message,
          });
        } else {
          out.push({
            orderId,
            orderItemId: s(it),
            status: topStatus,
            workStep: topStep,
            event,
            message,
          });
        }
      }
    } else {
      out.push({
        orderId,
        orderItemId: pick(r, ["orderItemId", "order_item_id", "itemId"]),
        status: topStatus,
        workStep: topStep,
        event,
        message,
      });
    }
  }
  return out.filter((e) => e.orderId || e.orderItemId);
}

/** HMAC-SHA256 des rohen Bodys gegen den X-Signature-Header prüfen */
function verifySignature(raw: string, header: string | null): boolean | null {
  const secret = process.env.FLUX_WEBHOOK_SECRET;
  if (!secret) return null; // Dev: kein Secret -> nicht geprüft
  if (!header) return false;
  const mac = createHmac("sha256", secret).update(raw, "utf8").digest();
  const candidates = [
    header.trim(),
    header.trim().replace(/^sha256=/i, ""),
  ];
  for (const c of candidates) {
    for (const enc of ["hex", "base64"] as const) {
      try {
        const got = Buffer.from(c, enc);
        if (got.length === mac.length && timingSafeEqual(got, mac)) return true;
      } catch {
        /* ungültige Kodierung ignorieren */
      }
    }
  }
  return false;
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "flux status webhook" });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sigOk = verifySignature(
    raw,
    req.headers.get("x-signature") ?? req.headers.get("x-flux-signature"),
  );

  if (sigOk === false) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const events = parseEvents(body);
  const sb = createAdminClient();

  // Status-Map laden (flux-Status -> werk job.status)
  const { data: mapRow } = await sb
    .from("setting")
    .select("value")
    .eq("key", "flux_status_map")
    .maybeSingle();
  const statusMap = (mapRow?.value as Record<string, string | null>) ?? {};

  let matched = 0;

  for (const ev of events) {
    // Auftrag + Jobs zuordnen
    let orderId: string | null = null;
    let jobIds: string[] = [];

    if (ev.orderId) {
      const { data: ord } = await sb
        .from("portal_order")
        .select("id")
        .eq("flux_order_id", ev.orderId)
        .maybeSingle();
      orderId = ord?.id ?? null;
    }

    if (ev.orderItemId) {
      const { data: jrows } = await sb
        .from("job")
        .select("id, portal_order_id")
        .eq("flux_order_item_id", ev.orderItemId);
      jobIds = (jrows ?? []).map((j) => j.id as string);
      if (!orderId && jrows?.length) orderId = jrows[0].portal_order_id as string;
    }
    if (!jobIds.length && ev.orderId) {
      const { data: jrows } = await sb
        .from("job")
        .select("id")
        .eq("flux_order_id", ev.orderId);
      jobIds = (jrows ?? []).map((j) => j.id as string);
    }

    const isMatch = Boolean(orderId || jobIds.length);
    if (isMatch) matched++;

    await sb.from("flux_status_log").insert({
      portal_order_id: orderId,
      job_id: jobIds[0] ?? null,
      flux_order_id: ev.orderId,
      flux_order_item_id: ev.orderItemId,
      event: ev.event,
      status: ev.status,
      work_step: ev.workStep,
      message: ev.message,
      matched: isMatch,
      signature_ok: sigOk,
      raw: (body as object) ?? {},
    });

    const now = new Date().toISOString();

    if (orderId) {
      await sb
        .from("portal_order")
        .update({
          flux_status: ev.status,
          flux_status_at: now,
          flux_work_step: ev.workStep,
        })
        .eq("id", orderId);
    }

    if (jobIds.length) {
      const mapped = ev.status ? statusMap[normStatus(ev.status)] : undefined;
      const patch: Record<string, unknown> = {
        flux_status: ev.status,
        flux_status_at: now,
      };
      if (mapped && JOB_STATES.has(mapped)) patch.status = mapped;
      await sb.from("job").update(patch).in("id", jobIds);
    }
  }

  return NextResponse.json({ ok: true, received: events.length, matched });
}
