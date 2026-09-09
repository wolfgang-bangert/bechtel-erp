import { createHash } from "node:crypto";
import { env } from "./env";
import { supabase } from "./supabase";
import { putObject, objectExists } from "./storage";

// ---------------------------------------------------------------- Typen
type OpAddress = {
  company?: string | null;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  street?: string | null;
  addition1?: string | null;
  addition2?: string | null;
  postCode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
};
type OpFileNode = {
  id?: string;
  pdfFileName?: string;
  pdfFileSize?: number;
  pdfFileUrl?: string;
  imageName?: string;
  imageSize?: number;
  imageUrl?: string;
};
type OpItem = {
  positionNumber?: string;
  number?: string;
  quantity?: number;
  description?: string;
};
type OpOrder = {
  id: string;
  reference?: string;
  referenceType?: string;
  description?: string;
  quantity?: number;
  currency?: string;
  totalNet?: string;
  totalGross?: string;
  deliverDate?: string;
  state?: { state?: string } | string | null;
  deliveries?: { deliverAddress?: OpAddress; senderAddress?: OpAddress }[];
  items?: OpItem[];
  printData?: OpFileNode | null;
  jobSheet?: OpFileNode | null;
  thumbnail?: OpFileNode | null;
};

type Options = { dryRun?: boolean; limit?: number; withFiles?: boolean; days?: number };

// ---------------------------------------------------------------- API
function apiUrl(path: string, params: Record<string, string> = {}) {
  const u = new URL(env.onlineprinters.base() + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.append(k, v);
  return u;
}

async function opGet(url: URL): Promise<Response> {
  const r = await fetch(url, {
    headers: { "X-API-KEY": env.onlineprinters.key(), Accept: "application/ld+json" },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`onlineprinters ${r.status} bei ${url.pathname} — ${body.slice(0, 200)}`);
  }
  return r;
}

/** File-URL: http→https + apiKey anhängen. */
function fileUrl(raw: string): string {
  let u = String(raw || "").trim().replace(/^http:\/\//i, "https://");
  if (u.includes("onlineprinters.info") && !/[?&]apiKey=/.test(u)) {
    u += (u.includes("?") ? "&" : "?") + "apiKey=" + env.onlineprinters.key();
  }
  return u;
}

// ---------------------------------------------------------------- Normalisierung
const s = (v: unknown) => {
  const t = v == null ? "" : String(v).trim();
  return t === "" ? null : t;
};
const num = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** "2026-09-11 16:00:00" → ISO */
const ts = (v: unknown) => {
  const t = s(v);
  if (!t) return null;
  const d = new Date(t.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const addr = (a?: OpAddress | null) =>
  a
    ? {
        company: s(a.company),
        name: [s(a.firstName), s(a.lastName)].filter(Boolean).join(" ") || null,
        street: s(a.street),
        addition1: s(a.addition1),
        addition2: s(a.addition2),
        zip: s(a.postCode),
        city: s(a.city),
        country: s(a.country),
        phone: s(a.phone),
        email: s(a.email),
      }
    : null;

function portalState(o: OpOrder): string | null {
  if (o.state && typeof o.state === "object") return s(o.state.state);
  return s(o.state);
}

/** Aufträge, die bei onlineprinters nicht mehr weiterwandern. */
const TERMINAL_STATES = ["FINISHED"];

/** Portal-Order-Zeile aus einem API-Auftrag bauen (Pull + Status-Refresh teilen sie). */
function buildRow(portalId: string, o: OpOrder) {
  return {
    portal_id: portalId,
    external_id: o.id,
    external_reference: s(o.reference),
    reference_type: s(o.referenceType),
    portal_state: portalState(o),
    description: s(o.description),
    quantity: num(o.quantity),
    deliver_date: ts(o.deliverDate),
    currency: s(o.currency)?.slice(0, 3) ?? null,
    total_net: num(o.totalNet),
    total_gross: num(o.totalGross),
    ship_to: addr(o.deliveries?.[0]?.deliverAddress),
    sender: addr(o.deliveries?.[0]?.senderAddress),
    raw: o as unknown as Record<string, unknown>,
  };
}

/** Positionen eines Auftrags ersetzen. */
async function replaceItems(orderId: string, o: OpOrder) {
  await supabase.from("portal_order_item").delete().eq("portal_order_id", orderId);
  const items = (o.items ?? []).map((it) => ({
    portal_order_id: orderId,
    position: s(it.positionNumber),
    sku: s(it.number),
    quantity: num(it.quantity),
    description: s(it.description),
    raw: it as unknown as Record<string, unknown>,
  }));
  if (items.length) {
    const { error } = await supabase.from("portal_order_item").insert(items);
    if (error) throw new Error(`items: ${error.message}`);
  }
}

// ---------------------------------------------------------------- Pull
export async function pullOnlineprinters(opts: Options = {}) {
  const { dryRun = false, limit, withFiles = true } = opts;

  const { data: portal, error: pErr } = await supabase
    .from("portal")
    .select("id, code, config")
    .eq("code", "onlineprinters")
    .maybeSingle();
  if (pErr || !portal) throw new Error(`portal 'onlineprinters' fehlt (Migration?) — ${pErr?.message ?? ""}`);
  const cfg = (portal.config ?? {}) as { poll_state?: string; s3_prefix?: string };
  const pollState = cfg.poll_state ?? "NEW";
  const s3prefix = (cfg.s3_prefix ?? "portal/onlineprinters").replace(/\/+$/, "");

  const res = await opGet(
    apiUrl("/api/customer-orders", { "state.state[]": pollState, pagination: "0" }),
  );
  const json = (await res.json()) as { "hydra:member"?: OpOrder[]; member?: OpOrder[] } | OpOrder[];
  let orders: OpOrder[] = Array.isArray(json)
    ? json
    : (json["hydra:member"] ?? json.member ?? []);
  orders = orders.filter((o) => o?.id && o?.reference);
  if (limit && limit > 0) orders = orders.slice(0, limit);

  let created = 0;
  let updated = 0;
  let filesFetched = 0;
  const errors: { reference: string; error: string }[] = [];

  for (const o of orders) {
    try {
      const row = buildRow(portal.id, o);

      if (dryRun) {
        created++; // im dry-run nur zählen
        continue;
      }

      const { data: existing } = await supabase
        .from("portal_order")
        .select("id")
        .eq("portal_id", portal.id)
        .eq("external_id", o.id)
        .maybeSingle();

      let orderId: string;
      if (existing) {
        const { error } = await supabase.from("portal_order").update(row).eq("id", existing.id);
        if (error) throw new Error(error.message);
        orderId = existing.id;
        updated++;
      } else {
        const { data, error } = await supabase
          .from("portal_order")
          .insert(row)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        orderId = data.id;
        created++;
      }

      await replaceItems(orderId, o);

      if (withFiles) {
        filesFetched += await syncFiles(orderId, o, s3prefix);
      }
    } catch (err) {
      errors.push({ reference: o.reference ?? o.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    dryRun,
    pollState,
    geladen: orders.length,
    neu: created,
    aktualisiert: updated,
    dateien: filesFetched,
    fehler: errors,
  };
}

// ---------------------------------------------------------------- Status-Refresh
/**
 * Status der noch nicht abgeschlossenen Aufträge bei onlineprinters nachziehen.
 * onlineprinters schickt keine Webhooks und der NEW-Poll sieht Statuswechsel
 * nicht – daher hier jeder offene Auftrag einzeln über /api/customer-orders/{id}.
 */
export async function refreshOpenOnlineprinters(
  opts: { withFiles?: boolean; limit?: number } = {},
) {
  const { withFiles = true, limit } = opts;

  const { data: portal, error: pErr } = await supabase
    .from("portal")
    .select("id, config")
    .eq("code", "onlineprinters")
    .maybeSingle();
  if (pErr || !portal) throw new Error(`portal 'onlineprinters' fehlt — ${pErr?.message ?? ""}`);
  const cfg = (portal.config ?? {}) as { s3_prefix?: string };
  const s3prefix = (cfg.s3_prefix ?? "portal/onlineprinters").replace(/\/+$/, "");

  const { data: open, error: oErr } = await supabase
    .from("portal_order")
    .select("id, external_id, external_reference, portal_state")
    .eq("portal_id", portal.id)
    .not("portal_state", "in", `(${TERMINAL_STATES.join(",")})`);
  if (oErr) throw new Error(oErr.message);
  let liste = open ?? [];
  if (limit && limit > 0) liste = liste.slice(0, limit);

  let geprueft = 0;
  let geaendert = 0;
  let dateien = 0;
  const wurdeFinished: string[] = [];
  const nachStatus: Record<string, number> = {};
  const errors: { reference: string; error: string }[] = [];

  for (const po of liste) {
    const ref = (po.external_reference as string) ?? (po.external_id as string);
    try {
      const res = await opGet(apiUrl(`/api/customer-orders/${po.external_id}`));
      const o = (await res.json()) as OpOrder;
      o.id = (o.id as string) || (po.external_id as string); // Detail-Endpunkt liefert evtl. kein id
      const neuerStatus = portalState(o);

      const { error } = await supabase
        .from("portal_order")
        .update(buildRow(portal.id, o))
        .eq("id", po.id);
      if (error) throw new Error(error.message);
      await replaceItems(po.id as string, o);
      if (withFiles) dateien += await syncFiles(po.id as string, o, s3prefix);

      geprueft++;
      nachStatus[neuerStatus ?? "?"] = (nachStatus[neuerStatus ?? "?"] ?? 0) + 1;
      if (neuerStatus !== po.portal_state) {
        geaendert++;
        if (neuerStatus && TERMINAL_STATES.includes(neuerStatus)) wurdeFinished.push(ref);
      }
    } catch (err) {
      errors.push({ reference: ref, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    geprueft,
    geaendert,
    wurde_finished: wurdeFinished,
    nach_status: nachStatus,
    dateien,
    fehler: errors,
  };
}

// ---------------------------------------------------------------- Dateien
type FileSpec = { typ: string; url: string; filename: string | null; bytes: number | null };

async function syncFiles(orderId: string, o: OpOrder, s3prefix: string): Promise<number> {
  const specs: FileSpec[] = [];
  const base = env.onlineprinters.base();
  // nebenwirkungsfrei: printData, jobSheet, thumbnail. Label-Endpunkte NICHT
  // (die ändern den onlineprinters-Status → Kollision mit n8n).
  // Hinweis: nur printData.pdfFileUrl stimmt; jobSheet/thumbnail brauchen die
  // expliziten fileapi-Pfade (die *Url-Felder im Payload sind veraltet).
  if (o.printData?.pdfFileUrl)
    specs.push({
      typ: "printData",
      url: o.printData.pdfFileUrl,
      filename: s(o.printData.pdfFileName),
      bytes: num(o.printData.pdfFileSize),
    });
  if (o.jobSheet?.id)
    specs.push({
      typ: "jobSheet",
      url: `${base}/fileapi/customer-order/job-sheet/${o.jobSheet.id}`,
      filename: s(o.jobSheet.pdfFileName),
      bytes: num(o.jobSheet.pdfFileSize),
    });
  if (o.thumbnail?.id)
    specs.push({
      typ: "thumbnail",
      url: `${base}/fileapi/customer-order/thumbnail/${o.thumbnail.id}`,
      filename: s(o.thumbnail.imageName),
      bytes: num(o.thumbnail.imageSize),
    });

  const { data: have } = await supabase
    .from("portal_order_file")
    .select("typ, fetched_at")
    .eq("portal_order_id", orderId);
  const done = new Set((have ?? []).filter((h) => h.fetched_at).map((h) => h.typ));

  let n = 0;
  for (const spec of specs) {
    if (done.has(spec.typ)) continue;
    const ref = o.reference ?? o.id;
    const safeName = (spec.filename ?? spec.typ).replace(/[^\w.\-]+/g, "_");
    const key = `${s3prefix}/${ref}/${spec.typ}-${safeName}`;

    let storageKey: string | null = null;
    let isZip = /\.zip$/i.test(spec.filename ?? "");
    let realBytes = spec.bytes;
    try {
      if (!(await objectExists(key))) {
        const r = await fetch(fileUrl(spec.url));
        if (!r.ok) throw new Error(`download ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        realBytes = buf.length;
        // Magic-Bytes: PK = ZIP, %PDF = PDF (onlineprinters liefert manchmal ZIP als *.pdf)
        if (buf.length >= 4) {
          if (buf[0] === 0x50 && buf[1] === 0x4b) isZip = true;
          else if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)
            isZip = false;
        }
        const ct =
          spec.typ === "thumbnail"
            ? "image/jpeg"
            : isZip
              ? "application/zip"
              : "application/pdf";
        await putObject(key, buf, ct);
      }
      storageKey = key;
    } catch (err) {
      // Datei-Fehler nicht den ganzen Auftrag killen — nur Zeile ohne storage_key
      storageKey = null;
      void err;
    }

    const fileRow = {
      portal_order_id: orderId,
      typ: spec.typ,
      source_url: spec.url,
      storage_key: storageKey,
      filename: spec.filename,
      bytes: realBytes,
      is_zip: isZip,
      fetched_at: storageKey ? new Date().toISOString() : null,
    };
    const { data: exRow } = await supabase
      .from("portal_order_file")
      .select("id")
      .eq("portal_order_id", orderId)
      .eq("typ", spec.typ)
      .maybeSingle();
    if (exRow) await supabase.from("portal_order_file").update(fileRow).eq("id", exRow.id);
    else await supabase.from("portal_order_file").insert(fileRow);
    if (storageKey) n++;
  }
  return n;
}

// dedupKey-Helper für spätere Nutzung (z.B. Wiedererkennung ohne external_id)
export function orderDedupKey(o: OpOrder): string {
  return createHash("sha1").update(`${o.referenceType}|${o.reference}`).digest("hex");
}
