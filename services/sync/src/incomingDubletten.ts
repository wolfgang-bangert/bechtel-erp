import { supabase } from "./supabase";
import { pagedSelect } from "./db";

/* --------------------------------------------------------------------------
 * Dubletten bei Eingangsbelegen bereinigen. Zwei Belege gelten als dieselbe Rechnung, wenn Rechnungsnummer
 * (normalisiert), Art und Betrag (±0,02) übereinstimmen UND dieselbe Datei (SHA-256) oder derselbe/ähnliche
 * Lieferant vorliegt. Pro Gruppe bleibt EIN Beleg: der am weitesten bearbeitete (gebucht > geprüft > extrahiert),
 * dann der mit KI-Positionen (Mail/Upload vor BB), dann der mit Bankzuordnung, sonst der ältere. Bankzuordnungen
 * der übrigen wandern zum behaltenen Beleg; die übrigen werden "verworfen" (nie gelöscht).
 * Übersprungen (und gemeldet) werden Gruppen, in denen mehrere Belege Bankzuordnungen haben oder ein Verlierer
 * Auftrags-Zuordnungen trägt - das entscheidet der Nutzer.
 * -------------------------------------------------------------------------- */

type Doc = {
  id: string;
  doc_number: string | null;
  doc_type: string;
  status: string;
  gross_amount: number | null;
  supplier_name: string | null;
  supplier_organization_id: string | null;
  file_sha256: string | null;
  dedup_key: string;
  ledger_account: string | null;
  tax_code_id: string | null;
  created_at: string;
};

const nm = (x: string | null | undefined) => (x ?? "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
const RANK: Record<string, number> = { booked: 5, exported: 5, reviewed: 4, extracted: 3, captured: 2 };

export async function incomingDubletten({ dryRun }: { dryRun: boolean }) {
  const alle = (
    await pagedSelect<Doc>(
      "incoming_document",
      "id, doc_number, doc_type, status, gross_amount, supplier_name, supplier_organization_id, file_sha256, dedup_key, ledger_account, tax_code_id, created_at",
    )
  ).filter((d) => d.status !== "rejected" && ["invoice", "credit_note", "receipt", "payment_advice", "unknown"].includes(d.doc_type));
  // Nummernbasierte Paare: nur Rechnungen/Gutschriften/Quittungen mit Nummer
  const docs = alle.filter((d) => ["invoice", "credit_note", "receipt"].includes(d.doc_type) && d.doc_number?.trim());

  // Union-Find über Paare
  const parent = new Map<string, string>(alle.map((d) => [d.id, d.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const byNr = new Map<string, Doc[]>();
  for (const d of docs) byNr.set(nm(d.doc_number), [...(byNr.get(nm(d.doc_number)) ?? []), d]);
  for (const g of byNr.values()) {
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const a = g[i], b = g[j];
        // Rechnung und Quittung (Receipt) derselben Rechnung zählen als Paar; sonst muss die Art übereinstimmen
        const paar = new Set([a.doc_type, b.doc_type]);
        if (a.doc_type !== b.doc_type && !(paar.has("invoice") && paar.has("receipt"))) continue;
        if (Math.abs(Math.abs(a.gross_amount ?? 0) - Math.abs(b.gross_amount ?? 0)) > 0.02) continue;
        const sameFile = !!a.file_sha256 && a.file_sha256 === b.file_sha256;
        const sameOrg = !!a.supplier_organization_id && a.supplier_organization_id === b.supplier_organization_id;
        const na = nm(a.supplier_name), nb = nm(b.supplier_name);
        const similar = na.length >= 4 && nb.length >= 4 && (na.startsWith(nb.slice(0, 6)) || nb.startsWith(na.slice(0, 6)));
        if (sameFile || sameOrg || similar) parent.set(find(a.id), find(b.id));
      }
  }
  // Dieselbe Datei (SHA-256) unter anderer Nummer/Art (z.B. BB-Int-… neben Mail-Beleg, Avis als Rechnung importiert)
  // ist derselbe Beleg, wenn der Betrag zusammenpasst.
  const bySha = new Map<string, Doc[]>();
  for (const d of alle) if (d.file_sha256) bySha.set(d.file_sha256, [...(bySha.get(d.file_sha256) ?? []), d]);
  for (const g of bySha.values())
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const a = g[i], b = g[j];
        const ga = a.gross_amount, gb = b.gross_amount;
        if (ga != null && gb != null && Math.abs(Math.abs(ga) - Math.abs(gb)) > 0.02) continue;
        parent.set(find(a.id), find(b.id));
      }
  const groups = new Map<string, Doc[]>();
  for (const d of alle) groups.set(find(d.id), [...(groups.get(find(d.id)) ?? []), d]);
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);

  const ids = dupGroups.flat().map((d) => d.id);
  const matchCount = new Map<string, number>();
  const allocCount = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const { data: m } = await supabase.from("bank_transaction_match").select("incoming_document_id").in("incoming_document_id", chunk);
    for (const r of m ?? []) matchCount.set(r.incoming_document_id as string, (matchCount.get(r.incoming_document_id as string) ?? 0) + 1);
    const { data: items } = await supabase.from("incoming_document_item").select("id, incoming_document_id").in("incoming_document_id", chunk);
    const itemDoc = new Map((items ?? []).map((x) => [x.id as string, x.incoming_document_id as string]));
    const itemIds = [...itemDoc.keys()];
    for (let k = 0; k < itemIds.length; k += 80) {
      const { data: al } = await supabase.from("incoming_document_allocation").select("incoming_document_item_id").in("incoming_document_item_id", itemIds.slice(k, k + 80));
      for (const r of al ?? []) {
        const did = itemDoc.get(r.incoming_document_item_id as string);
        if (did) allocCount.set(did, (allocCount.get(did) ?? 0) + 1);
      }
    }
  }

  const out = { dryRun, gruppen: dupGroups.length, verworfen: 0, uebersprungen: [] as string[], liste: [] as string[] };
  for (const g of dupGroups) {
    const label = `${g[0].doc_number ?? g[1].doc_number} · ${g[0].supplier_name} · ${g[0].gross_amount}`;
    const withMatch = g.filter((d) => (matchCount.get(d.id) ?? 0) > 0);
    if (withMatch.length > 1) {
      out.uebersprungen.push(`${label}: mehrere Belege mit Bankzuordnung`);
      continue;
    }
    const score = (d: Doc) => [
      d.doc_type === "payment_advice" ? 1 : 0, // ein erkanntes Zahlungsavis bleibt gegenüber einer als Rechnung importierten Kopie
      RANK[d.status] ?? 0,
      d.doc_type === "invoice" ? 1 : 0,
      d.dedup_key.startsWith("bb:") ? 0 : 1,
      matchCount.get(d.id) ?? 0,
      d.ledger_account ? 1 : 0,
      d.tax_code_id ? 1 : 0,
    ];
    const sorted = [...g].sort((a, b) => {
      const sa = score(a), sb = score(b);
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
      return a.created_at.localeCompare(b.created_at);
    });
    const keeper = sorted[0];
    const losers = sorted.slice(1);
    const allocLoser = losers.filter((d) => (allocCount.get(d.id) ?? 0) > 0 && (allocCount.get(keeper.id) ?? 0) === 0);
    if (allocLoser.length) {
      out.uebersprungen.push(`${label}: Verlierer-Beleg mit Auftrags-Zuordnung`);
      continue;
    }
    out.liste.push(`${label}: behalte ${keeper.dedup_key.split(":")[0]}/${keeper.status}, verwerfe ${losers.map((d) => `${d.dedup_key.split(":")[0]}/${d.status}`).join(", ")}`);
    if (dryRun) continue;
    for (const l of losers) {
      // Bankzuordnungen (Zahlungen/Skonto) zum behaltenen Beleg umhängen
      if ((matchCount.get(l.id) ?? 0) > 0) {
        const { error: me } = await supabase.from("bank_transaction_match").update({ incoming_document_id: keeper.id }).eq("incoming_document_id", l.id);
        if (me) {
          out.uebersprungen.push(`${label}: Bankzuordnung nicht umhängbar (${me.message})`);
          continue;
        }
        await supabase.rpc("recalc_incoming_payment", { p_id: keeper.id });
        await supabase.rpc("recalc_incoming_payment", { p_id: l.id });
      }
      const { error } = await supabase
        .from("incoming_document")
        .update({ status: "rejected", notes: `Dublette von Beleg ${keeper.id} (gleiche Rechnungsnummer/Datei und Betrag) - automatisch bereinigt` })
        .eq("id", l.id);
      if (error) out.uebersprungen.push(`${label}: ${error.message}`);
      else out.verworfen++;
    }
  }
  return out;
}
