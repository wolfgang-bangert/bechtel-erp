/**
 * Historische onlineprinters-Aufträge aus einem JSON-Dump in portal_order /
 * portal_order_item laden – zum Testen der SKU-Auflösung über mehr Produktgruppen.
 * Keine Dateien (printData etc.), nur Auftrags- und Positionsdaten.
 *
 * Erwartet ein Array von Objekten im Xano-Export-Format (Felder onlineprinters_id,
 * reference, current_state, items[].number …). Idempotent über (portal_id, external_id).
 */
import { readFileSync } from "node:fs";
import { supabase } from "./supabase";

type Options = { limit?: number; groups?: string[]; dryRun?: boolean; skipExisting?: boolean };

type RawAddr = Record<string, unknown> | null | undefined;
const s = (v: unknown) => {
  const t = v == null ? "" : String(v).trim();
  return t === "" ? null : t;
};
const num = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const tsFrom = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v).toISOString();
  const t = String(v);
  const d = new Date(/^\d+$/.test(t) ? Number(t) : t.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const addr = (a: RawAddr) =>
  a
    ? {
        company: s(a.company),
        name: [s(a.firstName), s(a.lastName)].filter(Boolean).join(" ") || null,
        street: s(a.street),
        addition1: s(a.addition1),
        addition2: s(a.addition2),
        zip: s(a.postCode ?? a.postcode ?? a.zip),
        city: s(a.city),
        country: s(a.country),
        phone: s(a.phone),
        email: s(a.email),
      }
    : null;

const mainGroup = (skus: string[]) => {
  const hit = skus.find((k) => k && !/^[ZIW-]/.test(k));
  return hit ? hit.split(/[._]/)[0].slice(0, 4) : "?";
};

export async function importOnlineprintersFile(path: string, opts: Options = {}) {
  const { limit, groups, dryRun = false, skipExisting = false } = opts;

  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const all: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed
    : (parsed.member ?? parsed["hydra:member"] ?? parsed.data ?? parsed.items ?? []);

  const { data: portal, error: pErr } = await supabase
    .from("portal")
    .select("id")
    .eq("code", "onlineprinters")
    .maybeSingle();
  if (pErr || !portal) throw new Error(`portal 'onlineprinters' fehlt — ${pErr?.message ?? ""}`);

  let orders = all.filter((o) => o && (o.onlineprinters_id || o.reference));
  if (groups?.length) {
    const want = new Set(groups.map((g) => g.toUpperCase()));
    orders = orders.filter((o) => {
      const skus = ((o.items as Record<string, unknown>[]) ?? []).map((i) => String(i.number ?? ""));
      return want.has(mainGroup(skus));
    });
  }
  if (limit && limit > 0) orders = orders.slice(0, limit);

  const gruppen: Record<string, number> = {};
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let itemCount = 0;
  const errors: { reference: string; error: string }[] = [];

  for (const o of orders) {
    const reference = s(o.reference) ?? s(o.reference_key);
    const externalId = s(o.onlineprinters_id) ?? (o.id != null ? `xano-${o.id}` : reference);
    if (!externalId) continue;

    const items = ((o.items as Record<string, unknown>[]) ?? []).filter((i) => i && i.number);
    const g = mainGroup(items.map((i) => String(i.number ?? "")));

    if (!dryRun && skipExisting) {
      const { data: ex } = await supabase
        .from("portal_order")
        .select("id")
        .eq("portal_id", portal.id)
        .eq("external_id", externalId)
        .maybeSingle();
      if (ex) {
        skipped++;
        continue;
      }
    }

    gruppen[g] = (gruppen[g] ?? 0) + 1;

    if (dryRun) {
      created++;
      itemCount += items.length;
      continue;
    }

    const deliveries = (o.deliveries as Record<string, unknown>[]) ?? [];
    const d0 = deliveries[0] ?? {};
    const stateObj = o.state as { state?: unknown } | undefined;

    const row = {
      portal_id: portal.id,
      external_id: externalId,
      external_reference: reference,
      reference_type: s(o.referenceType),
      portal_state: s(o.current_state) ?? s(stateObj?.state),
      description: s(o.description),
      quantity: num(o.quantity),
      deliver_date: tsFrom(o.deliverDate ?? o.deliverDate_raw),
      currency: s(o.currency)?.slice(0, 3) ?? null,
      total_net: num(o.totalNet ?? o.totalNetEur),
      total_gross: num(o.totalGross ?? o.totalGrossEur),
      ship_to: addr(d0.deliverAddress as RawAddr),
      sender: addr(d0.senderAddress as RawAddr),
      raw: o as unknown as Record<string, unknown>,
    };

    try {
      const { data: existing } = await supabase
        .from("portal_order")
        .select("id")
        .eq("portal_id", portal.id)
        .eq("external_id", externalId)
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

      await supabase.from("portal_order_item").delete().eq("portal_order_id", orderId);
      const rows = items.map((it) => ({
        portal_order_id: orderId,
        position: s(it.positionNumber),
        sku: s(it.number),
        quantity: num(it.quantity),
        description: s(it.description) ?? s(it.bezeichnung_de),
        raw: it as unknown as Record<string, unknown>,
      }));
      if (rows.length) {
        const { error } = await supabase.from("portal_order_item").insert(rows);
        if (error) throw new Error(`items: ${error.message}`);
        itemCount += rows.length;
      }
    } catch (err) {
      errors.push({
        reference: reference ?? externalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { dryRun, quelle: path, gelesen: orders.length, neu: created, aktualisiert: updated, uebersprungen: skipped, positionen: itemCount, gruppen, fehler: errors };
}
