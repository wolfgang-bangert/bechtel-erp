import { supabase } from "./supabase";

/**
 * Sammelbuchungen aus Zahlungsläufen zuordnen: Bucht die Bank einen Zahlungslauf (payment_batch, SEPA-Datei aus
 * /zahlungen) als eine Summe ab ("ANZAHL nn"), wird die Bankzeile auf alle Eingangsrechnungen des Laufs verteilt,
 * mit Skonto-Zeile (3736/3731/3730), wo der Lauf Skonto abgezogen hat.
 * Gesucht wird eine noch völlig unzugeordnete Ausgangszeile auf dem Konto des Laufs mit genau der Laufsumme,
 * Buchungsdatum Ausführungsdatum − 3 bis + 10 Tage. Passt sie nicht eindeutig oder ist eine Rechnung schon
 * anderweitig bezahlt, bleibt der Lauf liegen (Meldung) – dann von Hand in /bank.
 * Ab Läufen mit Einzelbuchung (BtchBookg=false) kommen die Zahlungen einzeln und laufen über bank:match.
 */
type Options = { dryRun?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const tagePlus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function skontoKonto(rate: number): string {
  if (Math.abs(rate - 19) < 0.5) return "3736";
  if (Math.abs(rate - 7) < 0.5) return "3731";
  return "3730";
}

export async function bankZahlungslauf(opts: Options = {}) {
  const { dryRun = false } = opts;
  const ab = tagePlus(new Date().toISOString().slice(0, 10), -120);
  const { data: laeufe, error } = await supabase
    .from("payment_batch")
    .select("id, msg_id, debtor_iban, execution_date, item_count, total")
    .neq("status", "verworfen")
    .gte("execution_date", ab)
    .order("execution_date");
  if (error) throw new Error(error.message);

  const ergebnis = { laeufe: laeufe?.length ?? 0, zugeordnet: [] as string[], offen: [] as string[], fehler: [] as string[], dryRun };
  for (const l of laeufe ?? []) {
    const titel = `Lauf ${l.execution_date} ${Number(l.total).toFixed(2)} (${l.item_count} Zahlungen)`;
    try {
      const { data: konto } = await supabase.from("bank_account").select("id").eq("iban", l.debtor_iban.replace(/\s+/g, "").toUpperCase()).maybeSingle();
      if (!konto) continue;
      const { data: txs, error: te } = await supabase
        .from("bank_transaction")
        .select("id, booking_date, amount")
        .eq("bank_account_id", konto.id)
        .eq("amount", -Number(l.total))
        .gte("booking_date", tagePlus(l.execution_date, -3))
        .lte("booking_date", tagePlus(l.execution_date, 10));
      if (te) throw new Error(te.message);
      // schon zugeordnete Zeilen (auch von Hand) zählen als erledigt
      const frei: typeof txs = [];
      let erledigt = false;
      for (const t of txs ?? []) {
        const { count } = await supabase.from("bank_transaction_match").select("id", { count: "exact", head: true }).eq("bank_transaction_id", t.id);
        if (count) erledigt = true;
        else frei.push(t);
      }
      if (erledigt || !frei.length) continue;
      if (frei.length > 1) {
        ergebnis.offen.push(`${titel}: ${frei.length} passende Bankzeilen – von Hand zuordnen`);
        continue;
      }
      const tx = frei[0];

      const { data: items, error: ie } = await supabase
        .from("payment_batch_item")
        .select("incoming_document_id, creditor_name, amount, skonto_amount, remittance")
        .eq("batch_id", l.id);
      if (ie) throw new Error(ie.message);
      const zeilen: Record<string, unknown>[] = [];
      let problem = "";
      for (const it of items ?? []) {
        if (!it.incoming_document_id) {
          problem = `${it.creditor_name} ${it.amount}: keine Eingangsrechnung am Lauf`;
          break;
        }
        const { data: doc } = await supabase
          .from("incoming_document")
          .select("id, doc_number, open_amount, net_amount, tax_amount")
          .eq("id", it.incoming_document_id)
          .maybeSingle();
        const betrag = r2(Number(it.amount));
        const skonto = r2(Number(it.skonto_amount ?? 0));
        if (!doc || Number(doc.open_amount) + 0.005 < betrag + skonto) {
          problem = `${it.creditor_name} ${doc?.doc_number ?? ""}: offen ${Number(doc?.open_amount ?? 0).toFixed(2)}, Lauf ${(betrag + skonto).toFixed(2)}`;
          break;
        }
        zeilen.push({ bank_transaction_id: tx.id, incoming_document_id: doc.id, amount: -betrag, auto: true, note: `Zahlungslauf ${l.execution_date}` });
        if (skonto > 0) {
          const rate = Number(doc.net_amount) ? r2((Number(doc.tax_amount) / Number(doc.net_amount)) * 100) : 0;
          const net = r2(skonto / (1 + rate / 100));
          zeilen.push({
            bank_transaction_id: tx.id,
            incoming_document_id: doc.id,
            ledger_account: skontoKonto(rate),
            kind: "skonto",
            amount: skonto,
            net_amount: net,
            tax_rate: rate,
            tax_amount: r2(skonto - net),
            auto: true,
          });
        }
      }
      const summe = r2((items ?? []).reduce((s, it) => s + Number(it.amount), 0));
      if (!problem && Math.abs(summe - Number(l.total)) > 0.005) problem = `Positionen ${summe.toFixed(2)} ≠ Laufsumme`;
      if (problem) {
        ergebnis.offen.push(`${titel} → Bankzeile ${tx.booking_date}: ${problem} – von Hand zuordnen`);
        continue;
      }
      ergebnis.zugeordnet.push(`${titel} → Bankzeile ${tx.booking_date}: ${zeilen.length} Zuordnungen`);
      if (dryRun) continue;
      const { error: me } = await supabase.from("bank_transaction_match").insert(zeilen);
      if (me) throw new Error(me.message);
      await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", tx.id);
    } catch (e) {
      ergebnis.fehler.push(`${titel}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return ergebnis;
}
