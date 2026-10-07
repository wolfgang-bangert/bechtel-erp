import { supabase } from "./supabase";
import { syncMailbox } from "./syncMailbox";
import { extractIncoming } from "./extractIncoming";
import { gutschriftverfahrenPruefen } from "./gutschriftverfahren";

/**
 * Ältere Festool-Konsilagergutschriften (intern weitergeleitet, Betreff "... FESTOOL Konsilagergutschrift ...") aus dem
 * Archivordner holen, auslesen und als Ausgangsrechnungen OHNE Buchhaltung ablegen (nur Auffindbarkeit, keine UStVA/DATEV,
 * nicht in den Offenen Posten). Aussteller ist Festool, auch wenn die KI die eigene Firma als Aussteller erkennt.
 */
export async function festoolArchiv(opts: { dryRun?: boolean; ordner?: string; vor?: string } = {}) {
  const { dryRun = false, ordner = "INBOX.Archive", vor = "2026-01-01" } = opts;
  const mail = await syncMailbox({ dryRun, ordner, betreff: "FESTOOL", all: true });
  if (dryRun) return { mail, dryRun };

  // Auslesen, bis nichts mehr offen ist (20 je Lauf)
  let ausgelesen = 0;
  for (let i = 0; i < 12; i++) {
    const r = await extractIncoming({ limit: 20 });
    ausgelesen += r.docs ?? 0;
    if (!r.docs) break;
  }

  const { data: org } = await supabase.from("organization").select("id, name").ilike("name", "Festool GmbH").eq("gutschriftverfahren", true).maybeSingle();
  if (!org) throw new Error("Organisation Festool GmbH mit Gutschriftverfahren nicht gefunden");
  const { data: docs } = await supabase
    .from("incoming_document")
    .select("id, doc_number, doc_date, status")
    .ilike("email_subject", "%FESTOOL%")
    .in("status", ["extracted", "captured"])
    .lt("doc_date", vor);
  const out = { uebernommen: 0, uebersprungen: [] as string[] };
  for (const d of docs ?? []) {
    await supabase.from("incoming_document").update({ supplier_organization_id: org.id, supplier_name: org.name }).eq("id", d.id);
    const ok = await gutschriftverfahrenPruefen(d.id, { ohneBuchhaltung: true });
    if (ok) out.uebernommen += 1;
    else out.uebersprungen.push(`${d.doc_number ?? d.id.slice(0, 8)} (${d.doc_date ?? "ohne Datum"})`);
  }
  return { mail, ausgelesen, ...out, dryRun };
}
