import { readFileSync } from "fs";
import { supabase } from "./supabase";

/**
 * Bankzeilen nach einer Vorlage (JSON) zuordnen – für Zahlungsavise mit vielen Rechnungen und Skonto
 * (z. B. Euchner) und für Verrechnungen Eingangs- gegen Ausgangsrechnungen (z. B. Fauss).
 *
 * {
 *   "partner": "13228",                         Debitoren- oder Kreditorennummer der Organisation
 *   "zahlungen": [{
 *     "datum": "2026-02-05", "betrag": 22864.63,  Bankzeile: Betrag genau, Datum ± 5 Tage
 *     "zweck": "2509",                            optional: Verwendungszweck genau (bei mehreren gleichen Beträgen)
 *     "notiz": "Avis 2000103046",
 *     "ersetzen": false,                          true: vorhandene Zuordnungen der Bankzeile vorher löschen
 *     "posten": [
 *       { "rechnung": "26LB01367", "brutto": 187.84, "skonto": 5.64 },   Ausgangsrechnung mit Skonto (8736/8731/8730)
 *       { "rechnung": "251031008", "betrag": 75.15 },                   Ausgangsrechnung (Teil-)Zahlung
 *       { "eingang": "0826-013", "betrag": 4134.06 },                   Eingangsrechnung
 *       { "akonto": -210 }                                              Akonto Partner, Vorzeichen wie die Bankzeile
 *     ]
 *   }]
 * }
 * Die Posten müssen zusammen genau den Bankbetrag ergeben (Ausgangsrechnung +, Eingangsrechnung −), jede
 * Rechnung muss zum Partner gehören und noch so viel offen haben. Bankzeilen mit Zuordnungen werden ohne
 * "ersetzen" übersprungen – ein zweiter Lauf ändert also nichts. Fehlt dem Partner für Eingangsrechnung/
 * Akonto-Ausgang die Kreditorennummer (DATEV), wird eine aus dem Nummernkreis vergeben.
 */
type Posten = { rechnung?: string; eingang?: string; brutto?: number; skonto?: number; betrag?: number; akonto?: number };
type Zahlung = { datum: string; betrag: number; zweck?: string; notiz?: string; ersetzen?: boolean; posten: Posten[] };
type Vorlage = { partner: string; zahlungen: Zahlung[] };
type Options = { datei: string; dryRun?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const tagePlus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function skontoKonto(rate: number): string {
  if (Math.abs(rate - 19) < 0.5) return "8736";
  if (Math.abs(rate - 7) < 0.5) return "8731";
  return "8730";
}

export async function bankZuordnen(opts: Options) {
  const { dryRun = false } = opts;
  const vorlage = JSON.parse(readFileSync(opts.datei, "utf8")) as Vorlage;
  const { data: orgs, error: oe } = await supabase
    .from("organization")
    .select("id, name, customer_number, supplier_number")
    .or(`customer_number.eq.${vorlage.partner},supplier_number.eq.${vorlage.partner}`);
  if (oe) throw new Error(oe.message);
  if (orgs?.length !== 1) throw new Error(`Partner ${vorlage.partner}: ${orgs?.length ?? 0} Organisationen (genau 1 nötig)`);
  const org = orgs[0];
  const log: string[] = [`Partner: ${org.name} (Debitor ${org.customer_number ?? "–"}, Kreditor ${org.supplier_number ?? "–"})`];
  const ergebnis = { zahlungen: vorlage.zahlungen.length, gebucht: 0, uebersprungen: 0, zuordnungen: 0, log, fehler: [] as string[], dryRun };

  // in diesem Lauf schon verbrauchte Beträge je Rechnung (damit der Probelauf mehrere Zahlungen richtig prüft)
  const verbraucht = new Map<string, number>();

  for (const z of vorlage.zahlungen) {
    const titel = `${z.datum} ${z.betrag.toFixed(2)}${z.notiz ? ` (${z.notiz})` : ""}`;
    try {
      let q = supabase
        .from("bank_transaction")
        .select("id, booking_date, amount, counterparty_name")
        .eq("amount", z.betrag)
        .gte("booking_date", tagePlus(z.datum, -5))
        .lte("booking_date", tagePlus(z.datum, 5));
      if (z.zweck) q = q.eq("purpose", z.zweck);
      const { data: txs, error } = await q;
      if (error) throw new Error(error.message);
      if (txs?.length !== 1) throw new Error(`${txs?.length ?? 0} Bankzeilen mit diesem Betrag ± 5 Tage (genau 1 nötig)`);
      const tx = txs[0];

      const { data: alt } = await supabase
        .from("bank_transaction_match")
        .select("id, amount, sales_invoice_id, incoming_document_id, ledger_account, kind")
        .eq("bank_transaction_id", tx.id);
      if (alt?.length && !z.ersetzen) {
        log.push(`${titel}: schon zugeordnet (${alt.length}) – übersprungen`);
        ergebnis.uebersprungen++;
        continue;
      }
      // Was die zu ersetzenden Zuordnungen an Rechnungen bezahlt haben, wird beim Prüfen wieder frei
      const frei = new Map<string, number>();
      for (const m of alt ?? []) {
        const id = m.sales_invoice_id ?? m.incoming_document_id;
        if (id) frei.set(id, r2((frei.get(id) ?? 0) + Math.abs(Number(m.amount))));
      }

      const zeilen: Record<string, unknown>[] = [];
      let summe = 0;
      for (const p of z.posten) {
        if (p.rechnung) {
          const { data: inv } = await supabase
            .from("sales_invoice")
            .select("id, invoice_number, organization_id, open_amount, net_total, tax_total")
            .eq("invoice_number", p.rechnung)
            .maybeSingle();
          if (!inv) throw new Error(`Rechnung ${p.rechnung} nicht gefunden`);
          if (inv.organization_id !== org.id) throw new Error(`Rechnung ${p.rechnung} gehört nicht zu ${org.name}`);
          const skonto = r2(p.skonto ?? 0);
          const bar = p.brutto != null ? r2(p.brutto - skonto) : r2(p.betrag ?? 0);
          const offen = r2(Number(inv.open_amount) + (frei.get(inv.id) ?? 0) - (verbraucht.get(inv.id) ?? 0));
          if (bar + skonto > offen + 0.005) throw new Error(`Rechnung ${p.rechnung}: offen ${offen.toFixed(2)}, gebucht würden ${(bar + skonto).toFixed(2)}`);
          if (p.brutto != null && Math.abs(p.brutto - offen) > 0.005) throw new Error(`Rechnung ${p.rechnung}: offen ${offen.toFixed(2)}, laut Avis ${p.brutto.toFixed(2)}`);
          verbraucht.set(inv.id, r2((verbraucht.get(inv.id) ?? 0) + bar + skonto));
          zeilen.push({ bank_transaction_id: tx.id, sales_invoice_id: inv.id, amount: bar, auto: false, note: z.notiz ?? null });
          if (skonto > 0) {
            const rate = Number(inv.net_total) ? r2((Number(inv.tax_total) / Number(inv.net_total)) * 100) : 0;
            const net = r2(skonto / (1 + rate / 100));
            zeilen.push({
              bank_transaction_id: tx.id,
              sales_invoice_id: inv.id,
              ledger_account: skontoKonto(rate),
              kind: "skonto",
              amount: skonto,
              net_amount: net,
              tax_rate: rate,
              tax_amount: r2(skonto - net),
              auto: false,
            });
          }
          summe = r2(summe + bar);
        } else if (p.eingang) {
          const { data: docs } = await supabase
            .from("incoming_document")
            .select("id, doc_number, open_amount")
            .eq("doc_number", p.eingang)
            .eq("supplier_organization_id", org.id)
            .neq("status", "rejected");
          if (docs?.length !== 1) throw new Error(`Eingangsrechnung ${p.eingang} von ${org.name}: ${docs?.length ?? 0} Treffer`);
          const doc = docs[0];
          const betrag = r2(p.betrag ?? 0);
          const offen = r2(Number(doc.open_amount) + (frei.get(doc.id) ?? 0) - (verbraucht.get(doc.id) ?? 0));
          if (betrag > offen + 0.005) throw new Error(`Eingangsrechnung ${p.eingang}: offen ${offen.toFixed(2)}, gebucht würden ${betrag.toFixed(2)}`);
          verbraucht.set(doc.id, r2((verbraucht.get(doc.id) ?? 0) + betrag));
          zeilen.push({ bank_transaction_id: tx.id, incoming_document_id: doc.id, amount: tx.amount < 0 ? -betrag : betrag, auto: false, note: z.notiz ?? null });
          summe = r2(summe - betrag);
        } else if (p.akonto != null) {
          zeilen.push({ bank_transaction_id: tx.id, organization_id: org.id, kind: "akonto", amount: r2(p.akonto), auto: false, note: z.notiz ?? "Akonto" });
          summe = r2(summe + p.akonto);
        } else throw new Error(`Posten ohne rechnung/eingang/akonto: ${JSON.stringify(p)}`);
      }
      if (Math.abs(summe - tx.amount) > 0.005) throw new Error(`Posten ergeben ${summe.toFixed(2)}, Bankzeile ${tx.amount.toFixed(2)}`);

      const brauchtKreditor = z.posten.some((p) => p.eingang || (p.akonto ?? 0) < 0) && tx.amount < 0;
      if (brauchtKreditor && !org.supplier_number) {
        if (dryRun) log.push(`${org.name}: bekommt eine Kreditorennummer`);
        else {
          const { data: nr, error: ne } = await supabase.rpc("next_number", { p_key: "supplier_number" });
          if (ne || !nr) throw new Error(`Kreditorennummer: ${ne?.message ?? "leer"}`);
          const { error: ue } = await supabase.from("organization").update({ supplier_number: String(nr) }).eq("id", org.id);
          if (ue) throw new Error(`Kreditorennummer: ${ue.message}`);
          org.supplier_number = String(nr);
          log.push(`${org.name}: Kreditorennummer ${nr} vergeben`);
        }
      }

      log.push(
        `${titel} → Bankzeile ${tx.booking_date} ${tx.counterparty_name ?? ""}: ${zeilen.length} Zuordnungen` +
          (alt?.length ? `, ersetzt ${alt.length} alte (${alt.map((m) => `${m.ledger_account ?? m.kind ?? "Beleg"} ${m.amount}`).join(", ")})` : ""),
      );
      ergebnis.zuordnungen += zeilen.length;
      ergebnis.gebucht++;
      if (dryRun) continue;
      if (alt?.length) {
        const { error: de } = await supabase.from("bank_transaction_match").delete().in("id", alt.map((m) => m.id));
        if (de) throw new Error(`Löschen: ${de.message}`);
      }
      const { error: ie } = await supabase.from("bank_transaction_match").insert(zeilen);
      if (ie) throw new Error(`Einfügen: ${ie.message}`);
      await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", tx.id);
    } catch (e) {
      ergebnis.fehler.push(`${titel}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return ergebnis;
}
