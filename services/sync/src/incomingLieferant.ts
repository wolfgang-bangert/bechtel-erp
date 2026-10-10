import { supabase } from "./supabase";

/**
 * Eingangsrechnungen einem anderen Lieferanten zuordnen (z. B. aus BuchhaltungsButler falsch übernommen):
 *   --nummer=NCMSTRP-%      Rechnungsnummern (SQL-LIKE, % als Platzhalter)
 *   --org=70120             Ziel-Organisation: Kreditorennummer, UUID oder exakter Name
 *   --verschmelzen=<org>    vorher Dubletten (Name oder UUID, mehrfach mit Komma) in die Ziel-Organisation verschmelzen
 *   --vorkontierung=4964    Aufwandskonto an der Ziel-Organisation setzen (nur wenn dort leer) und bei den
 *                           Rechnungen ohne Aufwandskonto eintragen
 * Verworfene Belege bleiben unangetastet. Mit --dry-run nur anzeigen.
 */
type Options = { nummer: string; org: string; verschmelzen?: string; vorkontierung?: string; dryRun?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findeOrg(wert: string): Promise<{ id: string; name: string; supplier_number: string | null; default_expense_account: string | null }> {
  const q = supabase.from("organization").select("id, name, supplier_number, default_expense_account");
  const { data, error } = UUID.test(wert)
    ? await q.eq("id", wert)
    : /^\d{4,6}$/.test(wert)
      ? await q.eq("supplier_number", wert)
      : await q.eq("name", wert);
  if (error) throw new Error(error.message);
  if (!data || data.length !== 1) throw new Error(`Organisation „${wert}“: ${data?.length ?? 0} Treffer (genau 1 nötig)`);
  return data[0];
}

export async function incomingLieferant(opts: Options) {
  const { dryRun = false } = opts;
  const ziel = await findeOrg(opts.org);
  const log: string[] = [`Ziel: ${ziel.name} (Kreditor ${ziel.supplier_number ?? "–"})`];

  for (const w of (opts.verschmelzen ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const weg = await findeOrg(w);
    if (weg.id === ziel.id) continue;
    log.push(`verschmelzen: ${weg.name} → ${ziel.name}`);
    if (!dryRun) {
      const { error } = await supabase.rpc("merge_organization", { p_survivor: ziel.id, p_loser: weg.id, p_merged_by: null });
      if (error) throw new Error(`Verschmelzen ${weg.name}: ${error.message}`);
    }
  }

  const konto = opts.vorkontierung?.trim();
  if (konto && !ziel.default_expense_account) {
    log.push(`Vorkontierung ${ziel.name}: Aufwandskonto ${konto}`);
    if (!dryRun) {
      const { error } = await supabase
        .from("organization")
        .update({ default_expense_account: konto, vorkontierung_source: "manual" })
        .eq("id", ziel.id);
      if (error) throw new Error(`Vorkontierung: ${error.message}`);
    }
  }

  const { data: docs, error } = await supabase
    .from("incoming_document")
    .select("id, doc_number, doc_date, supplier_name, supplier_organization_id, ledger_account")
    .ilike("doc_number", opts.nummer)
    .neq("status", "rejected")
    .order("doc_date");
  if (error) throw new Error(error.message);

  let umgestellt = 0;
  let kontoGesetzt = 0;
  for (const d of docs ?? []) {
    const upd: Record<string, unknown> = {};
    if (d.supplier_organization_id !== ziel.id) upd.supplier_organization_id = ziel.id;
    if (d.supplier_name !== ziel.name) upd.supplier_name = ziel.name;
    if (konto && !d.ledger_account) upd.ledger_account = konto;
    if (!Object.keys(upd).length) continue;
    log.push(`${d.doc_number} (${d.doc_date}): ${d.supplier_name ?? "–"} → ${ziel.name}${upd.ledger_account ? `, Konto ${konto}` : ""}`);
    if (upd.supplier_organization_id || upd.supplier_name) umgestellt++;
    if (upd.ledger_account) kontoGesetzt++;
    if (!dryRun) {
      const { error: e } = await supabase.from("incoming_document").update(upd).eq("id", d.id);
      if (e) throw new Error(`${d.doc_number}: ${e.message}`);
    }
  }
  return { rechnungen: docs?.length ?? 0, umgestellt, kontoGesetzt, log, dryRun };
}
