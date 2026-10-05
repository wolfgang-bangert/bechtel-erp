import { readFileSync } from "node:fs";
import { supabase } from "./supabase";

/**
 * Sammelüberweisungen zuordnen: eine Bankzeile bezahlt mehrere Belege (Rechnungen/Eingangsrechnungen),
 * ggf. mit Skonto. Der Plan (`data/sammel-plan.json`) wurde aus den BuchhaltungsButler-Ausgleichsbuchungen
 * abgeleitet und nur mit eindeutigen Treffern befüllt (Summe = Bankbetrag, Beleg eindeutig und unbezahlt).
 *
 * Vor dem Schreiben wird jede Gruppe gegen den aktuellen Stand geprüft; bei jeder Abweichung wird die
 * GANZE Gruppe übersprungen (nie halb zugeordnet). Ohne `--apply` ist es ein reiner Probelauf.
 */

type PlanBeleg = { id: string; nr: string; brutto: number; skonto: number; satz: number };
type PlanGruppe = { datum: string; txId: string; richtung: "zahlung" | "eingang"; text: string; belege: PlanBeleg[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const NOTIZ = "Sammelzahlung (aus BuchhaltungsButler abgeleitet)";

function skontoKonto(richtung: "zahlung" | "eingang", satz: number): string {
  if (Math.abs(satz - 7) < 0.5) return richtung === "zahlung" ? "3731" : "8731";
  return richtung === "zahlung" ? "3736" : "8736";
}

export async function sammelZuordnen(opts: { apply?: boolean } = {}) {
  const apply = !!opts.apply;
  const plan = JSON.parse(readFileSync(new URL("../data/sammel-plan.json", import.meta.url), "utf8")) as PlanGruppe[];

  const ergebnis = { gruppen: plan.length, zugeordnet: 0, belege: 0, uebersprungen: [] as string[], fehler: [] as string[] };

  for (const g of plan) {
    const label = `${g.datum} ${g.text.slice(0, 40)} (${g.belege.length} Belege)`;
    const zahlung = g.richtung === "zahlung";

    const { data: tx } = await supabase.from("bank_transaction").select("id, amount, booking_date").eq("id", g.txId).maybeSingle();
    if (!tx) { ergebnis.uebersprungen.push(`${label}: Bankzeile nicht gefunden`); continue; }
    if ((tx.amount < 0) !== zahlung) { ergebnis.uebersprungen.push(`${label}: Vorzeichen der Bankzeile passt nicht`); continue; }
    const summe = r2(g.belege.reduce((s, b) => s + b.brutto - b.skonto, 0));
    if (Math.abs(summe - Math.abs(tx.amount)) > 0.02) {
      ergebnis.uebersprungen.push(`${label}: Summe ${summe} ≠ Bankbetrag ${Math.abs(tx.amount)}`);
      continue;
    }
    const { count: vorhanden } = await supabase
      .from("bank_transaction_match").select("id", { count: "exact", head: true }).eq("bank_transaction_id", g.txId);
    if (vorhanden) { ergebnis.uebersprungen.push(`${label}: Bankzeile hat schon ${vorhanden} Zuordnung(en)`); continue; }

    let grundFehler: string | null = null;
    for (const b of g.belege) {
      const tabelle = zahlung ? "incoming_document" : "sales_invoice";
      const sel = zahlung ? "id, status, doc_type, gross_amount" : "id, kind, gross_total";
      const { data: beleg } = await supabase.from(tabelle).select(sel).eq("id", b.id).maybeSingle();
      const rec = beleg as unknown as Record<string, unknown> | null;
      if (!rec) { grundFehler = `Beleg ${b.nr} nicht gefunden`; break; }
      if (zahlung && (rec.status === "rejected" || rec.doc_type !== "invoice")) { grundFehler = `Beleg ${b.nr} ist verworfen/keine Rechnung`; break; }
      if (!zahlung && rec.kind !== "invoice") { grundFehler = `Beleg ${b.nr} ist keine Rechnung`; break; }
      const brutto = Number(zahlung ? rec.gross_amount : rec.gross_total);
      if (Math.abs(brutto - b.brutto) > 0.02) { grundFehler = `Beleg ${b.nr}: Betrag ${brutto} ≠ Plan ${b.brutto}`; break; }
      const spalte = zahlung ? "incoming_document_id" : "sales_invoice_id";
      const { data: bezahlt } = await supabase.from("bank_transaction_match").select("id").eq(spalte, b.id).is("kind", null).limit(1);
      if (bezahlt?.length) { grundFehler = `Beleg ${b.nr} ist schon (teil)bezahlt`; break; }
    }
    if (grundFehler) { ergebnis.uebersprungen.push(`${label}: ${grundFehler}`); continue; }

    if (!apply) {
      ergebnis.zugeordnet += 1;
      ergebnis.belege += g.belege.length;
      continue;
    }

    const angelegt: string[] = [];
    let fehler: string | null = null;
    for (const b of g.belege) {
      const bezug = zahlung ? { incoming_document_id: b.id } : { sales_invoice_id: b.id };
      const zahl = r2(b.brutto - b.skonto);
      const { data, error } = await supabase
        .from("bank_transaction_match")
        .insert({ bank_transaction_id: g.txId, ...bezug, amount: zahlung ? -zahl : zahl, auto: false, note: NOTIZ })
        .select("id").single();
      if (error || !data) { fehler = error?.message ?? "Insert ohne Ergebnis"; break; }
      angelegt.push(data.id);
      if (b.skonto > 0.005) {
        const net = r2(b.skonto / (1 + b.satz / 100));
        const { data: sk, error: e2 } = await supabase
          .from("bank_transaction_match")
          .insert({
            bank_transaction_id: g.txId, ...bezug, kind: "skonto", ledger_account: skontoKonto(g.richtung, b.satz),
            amount: b.skonto, net_amount: net, tax_rate: b.satz, tax_amount: r2(b.skonto - net), auto: false, note: NOTIZ,
          })
          .select("id").single();
        if (e2 || !sk) { fehler = e2?.message ?? "Skonto-Insert ohne Ergebnis"; break; }
        angelegt.push(sk.id);
      }
    }
    if (fehler) {
      if (angelegt.length) await supabase.from("bank_transaction_match").delete().in("id", angelegt);
      ergebnis.fehler.push(`${label}: ${fehler} (Gruppe zurückgenommen)`);
      continue;
    }
    await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", g.txId);
    ergebnis.zugeordnet += 1;
    ergebnis.belege += g.belege.length;
  }
  return ergebnis;
}
