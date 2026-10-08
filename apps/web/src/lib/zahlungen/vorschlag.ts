/** Zahlungsvorschläge: offene Eingangsrechnungen mit Skonto-Betrag, Dringlichkeit und IBAN-Hinweisen. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { istIbanGueltig } from "@werk/shared/zahlung/sepa";

export type Dringlichkeit = "ueberfaellig" | "skonto" | "faellig" | "spaeter";

export type Vorschlag = {
  id: string;
  doc_number: string | null;
  supplier_name: string;
  doc_date: string | null;
  faellig: string | null;
  skonto_bis: string | null;
  skonto_prozent: number | null;
  brutto: number;
  offen: number;
  betrag: number; // Vorschlag (mit Skonto, wenn Frist noch läuft)
  skonto_betrag: number;
  mit_skonto: boolean;
  dringlichkeit: Dringlichkeit;
  iban: string | null;
  iban_gueltig: boolean;
  iban_warnung: string | null;
  iban_quelle: "beleg" | "zahlung" | null;
  letzte_zahlung: { datum: string; betrag: number } | null;
  empfaenger: string;
  status: string;
  bereits_im_lauf: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const tag = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export async function ladeVorschlaege(
  sb: SupabaseClient,
  opts: { ausfuehrung: string; auchUngebucht: boolean },
): Promise<Vorschlag[]> {
  const q = sb
    .from("incoming_document")
    .select(
      "id, doc_number, doc_date, due_date, net_due_date, discount_date, discount_percent, discount_amount, open_amount, gross_amount, " +
        "status, payment_method, supplier_name, supplier_iban, payee_iban, payee_differs, payee_name, supplier_organization_id",
    )
    .eq("doc_type", "invoice")
    .eq("currency", "EUR")
    .neq("status", "rejected")
    .gt("open_amount", 0.005)
    .limit(1500);
  const { data } = opts.auchUngebucht ? await q : await q.eq("status", "booked");
  const docs = (data ?? []) as unknown as Record<string, unknown>[];
  const rows = docs.filter((d) => !["card", "paypal", "direct_debit"].includes(String(d.payment_method ?? "")));

  // Rechnungen, die schon in einem (nicht verworfenen) Zahlungslauf stecken
  const { data: lauf } = await sb
    .from("payment_batch_item")
    .select("incoming_document_id, batch:batch_id(status)")
    .not("incoming_document_id", "is", null);
  const imLauf = new Set(
    ((lauf ?? []) as unknown as { incoming_document_id: string; batch: { status: string } | { status: string }[] | null }[])
      .filter((i) => {
        const b = Array.isArray(i.batch) ? i.batch[0] : i.batch;
        return b && b.status !== "verworfen";
      })
      .map((i) => i.incoming_document_id),
  );

  // bisher bekannte IBANs je Lieferant (Erkennung abweichender IBAN)
  const orgIds = [...new Set(rows.map((r) => r.supplier_organization_id).filter(Boolean))] as string[];
  const bekannt = new Map<string, Map<string, number>>();
  const docOrg = new Map<string, string>();
  for (let i = 0; i < orgIds.length; i += 150) {
    const { data: alle } = await sb
      .from("incoming_document")
      .select("id, supplier_organization_id, supplier_iban, payee_iban")
      .in("supplier_organization_id", orgIds.slice(i, i + 150))
      .neq("status", "rejected");
    for (const a of (alle ?? []) as { id: string; supplier_organization_id: string; supplier_iban: string | null; payee_iban: string | null }[]) {
      docOrg.set(a.id, a.supplier_organization_id);
      const s = bekannt.get(a.supplier_organization_id) ?? new Map<string, number>();
      const v = (a.payee_iban || a.supplier_iban)?.replace(/\s+/g, "").toUpperCase();
      if (v) s.set(v, (s.get(v) ?? 0) + 1);
      bekannt.set(a.supplier_organization_id, s);
    }
  }

  // IBANs und letzte Zahlung je Lieferant aus früheren Bankzahlungen (zugeordnete Belege)
  const eigene = new Set(
    ((await sb.from("bank_account").select("iban")).data ?? []).map((b: { iban: string }) => b.iban.replace(/\s+/g, "").toUpperCase()),
  );
  const zahlIban = new Map<string, Map<string, number>>();
  const letzte = new Map<string, { datum: string; betrag: number }>();
  const docIds = [...docOrg.keys()];
  for (let i = 0; i < docIds.length; i += 150) {
    const { data: zm } = await sb
      .from("bank_transaction_match")
      .select("incoming_document_id, amount, bank_transaction:bank_transaction_id(counterparty_iban, booking_date)")
      .in("incoming_document_id", docIds.slice(i, i + 150));
    for (const m of (zm ?? []) as unknown as { incoming_document_id: string; amount: number; bank_transaction: { counterparty_iban: string | null; booking_date: string } | { counterparty_iban: string | null; booking_date: string }[] | null }[]) {
      const bt = Array.isArray(m.bank_transaction) ? m.bank_transaction[0] : m.bank_transaction;
      const org = docOrg.get(m.incoming_document_id);
      if (!bt || !org) continue;
      const iban = bt.counterparty_iban?.replace(/\s+/g, "").toUpperCase();
      if (iban && !eigene.has(iban) && istIbanGueltig(iban)) {
        const s = zahlIban.get(org) ?? new Map<string, number>();
        s.set(iban, (s.get(iban) ?? 0) + 1);
        zahlIban.set(org, s);
      }
      const l = letzte.get(org);
      if (!l || bt.booking_date > l.datum) letzte.set(org, { datum: bt.booking_date, betrag: Math.abs(Number(m.amount)) });
    }
  }

  const heute = opts.ausfuehrung;
  const in7 = tag(new Date(new Date(heute + "T12:00:00Z").getTime() + 7 * 86400000));

  const out: Vorschlag[] = rows.map((d) => {
    const offen = Number(d.open_amount);
    const brutto = Number(d.gross_amount ?? offen);
    const faellig = ((d.net_due_date ?? d.due_date) as string | null) ?? null;
    const skontoBis = (d.discount_date as string | null) ?? null;
    const prozent = d.discount_percent != null ? Number(d.discount_percent) : null;
    const skontoLaeuft = !!skontoBis && skontoBis >= heute && (Number(d.discount_amount) > 0 || (prozent ?? 0) > 0);
    let skonto = 0;
    if (skontoLaeuft) {
      skonto = Math.abs(offen - brutto) < 0.005 && Number(d.discount_amount) > 0 ? Number(d.discount_amount) : r2((offen * (prozent ?? 0)) / 100);
    }
    const ibanBeleg = String((d.payee_differs ? d.payee_iban : null) ?? d.supplier_iban ?? "").replace(/\s+/g, "").toUpperCase() || null;
    const zIbans = d.supplier_organization_id ? zahlIban.get(d.supplier_organization_id as string) : undefined;
    const ibanZahlung = zIbans ? [...zIbans.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
    const ibanRoh = ibanBeleg ?? ibanZahlung;
    const known = d.supplier_organization_id ? bekannt.get(d.supplier_organization_id as string) : undefined;
    let warnung: string | null = null;
    if (d.payee_differs) warnung = "abweichender Zahlungsempfänger";
    else if (ibanBeleg && known && (known.get(ibanBeleg) ?? 0) <= 1 && [...known.entries()].some(([iban, n]) => iban !== ibanBeleg && n >= 2)) {
      // diese IBAN kommt beim Lieferanten nur einmal vor, eine andere dagegen mehrfach -> prüfen
      warnung = "IBAN weicht von den bisherigen Rechnungen des Lieferanten ab";
    }
    const dringlich: Dringlichkeit =
      faellig && faellig < heute ? "ueberfaellig" : skontoLaeuft && skontoBis! <= in7 ? "skonto" : faellig && faellig <= in7 ? "faellig" : "spaeter";
    return {
      id: d.id as string,
      doc_number: d.doc_number as string | null,
      supplier_name: String(d.supplier_name ?? "?"),
      doc_date: d.doc_date as string | null,
      faellig,
      skonto_bis: skontoBis,
      skonto_prozent: prozent,
      brutto,
      offen,
      betrag: r2(offen - skonto),
      skonto_betrag: skonto,
      mit_skonto: skonto > 0,
      dringlichkeit: dringlich,
      iban: ibanRoh,
      iban_gueltig: !!ibanRoh && istIbanGueltig(ibanRoh),
      iban_warnung: warnung,
      iban_quelle: ibanBeleg ? "beleg" : ibanZahlung ? "zahlung" : null,
      letzte_zahlung: d.supplier_organization_id ? (letzte.get(d.supplier_organization_id as string) ?? null) : null,
      empfaenger: String((d.payee_differs ? d.payee_name : null) ?? d.supplier_name ?? "?"),
      status: String(d.status),
      bereits_im_lauf: imLauf.has(d.id as string),
    };
  });

  const rang: Record<Dringlichkeit, number> = { ueberfaellig: 0, skonto: 1, faellig: 2, spaeter: 3 };
  return out.sort((a, b) => rang[a.dringlichkeit] - rang[b.dringlichkeit] || (a.faellig ?? "9").localeCompare(b.faellig ?? "9"));
}
