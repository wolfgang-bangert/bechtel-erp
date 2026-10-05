import { createClient } from "@/lib/supabase/server";
import {
  berechneUstva,
  type UstvaErgebnis,
  type UstvaErloesKonten,
  type UstvaZeile,
} from "@werk/shared/ustva";

export type UstvaHinweis = { ton: "warn" | "info"; text: string; belege?: { label: string; href: string }[] };
export type UstvaDaten = {
  monat: string;
  von: string;
  bis: string;
  versteuerung: "soll" | "ist";
  ergebnis: UstvaErgebnis;
  hinweise: UstvaHinweis[];
  anzahlAusgang: number;
  anzahlEingang: number;
  stand: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const EU = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "GR", "HU", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/** SKR03: Bezahlte Einfuhrumsatzsteuer (Vorsteuer, UStVA Kz 62). */
const EUST_KONTO = "1588";

export function monatsGrenzen(monat: string): { von: string; bis: string } {
  const [y, m] = monat.split("-").map(Number);
  const von = new Date(Date.UTC(y, m - 1, 1));
  const bis = new Date(Date.UTC(y, m, 0));
  return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10) };
}

type SalesBooking = { ledger_account: string; tax_rate: number | null; net_amount: number; tax_amount: number };
type SalesInv = {
  id: string;
  kind: string;
  invoice_number: string | null;
  invoice_date: string | null;
  paid_at: string | null;
  net_total: number | null;
  tax_total: number | null;
  tax_breakdown: Record<string, number> | null;
  organization: { name: string | null } | null;
  bookings: SalesBooking[];
};

type Item = {
  ledger_account: string | null;
  net_amount: number | null;
  tax_rate: number | null;
  tax_code_id: string | null;
  linked_document_id: string | null;
};
type IncDoc = {
  id: string;
  doc_type: string;
  status: string;
  doc_number: string | null;
  doc_date: string | null;
  currency: string | null;
  ledger_account: string | null;
  net_amount: number | null;
  tax_amount: number | null;
  tax_breakdown: Record<string, number> | null;
  tax_code_id: string | null;
  supplier_name: string | null;
  supplier_vat_id: string | null;
  organization: { tax_country: string | null } | null;
  incoming_document_item: Item[];
};

function dominantRate(tb: Record<string, number> | null, net: number, tax: number): number {
  const keys = Object.keys(tb ?? {});
  if (keys.length) return Math.round(Number(keys.sort((a, b) => (tb![b] ?? 0) - (tb![a] ?? 0))[0]));
  return net > 0 && tax > 0 ? Math.round((tax / net) * 100) : 0;
}

/** Herkunft eines §13b-Lieferanten: USt-IdNr-Präfix, sonst Land der Organisation. */
function rcHerkunft(d: IncDoc): "eu" | "drittland" | "unklar" {
  const pre = (d.supplier_vat_id ?? "").replace(/\s+/g, "").slice(0, 2).toUpperCase();
  if (/^[A-Z]{2}$/.test(pre) && pre !== "DE") return EU.has(pre) || pre === "EL" ? "eu" : "drittland";
  const land = (d.organization?.tax_country ?? "").toUpperCase();
  if (land && land !== "DE") return EU.has(land) ? "eu" : "drittland";
  // Ohne USt-IdNr/Land: eine USD-Rechnung ist ein Anbieter aus dem Drittland (USA).
  if ((d.currency ?? "").toUpperCase() === "USD") return "drittland";
  return "unklar";
}

function istAuslaender(d: IncDoc): boolean {
  const pre = (d.supplier_vat_id ?? "").replace(/\s+/g, "").slice(0, 2).toUpperCase();
  if (/^[A-Z]{2}$/.test(pre)) return pre !== "DE";
  const land = (d.organization?.tax_country ?? "").toUpperCase();
  return !!land && land !== "DE";
}

export async function ladeUstva(monat: string, versteuerung: "soll" | "ist"): Promise<UstvaDaten> {
  const supabase = await createClient();
  const { von, bis } = monatsGrenzen(monat);
  const dateCol = versteuerung === "ist" ? "paid_at" : "invoice_date";

  const [{ data: salesRaw }, { data: incRaw }, { data: tcs }, { data: settings }, { data: skontoRaw }] = await Promise.all([
    supabase
      .from("sales_invoice")
      .select(
        "id, kind, invoice_number, invoice_date, paid_at, net_total, tax_total, tax_breakdown, " +
          "organization:organization ( name ), " +
          "bookings:sales_invoice_booking ( ledger_account, tax_rate, net_amount, tax_amount )",
      )
      .gte(dateCol, von)
      .lte(dateCol, bis)
      .in("kind", ["invoice", "credit_note"]),
    supabase
      .from("incoming_document")
      .select(
        "id, doc_type, status, doc_number, doc_date, currency, ledger_account, net_amount, tax_amount, tax_breakdown, tax_code_id, " +
          "supplier_name, supplier_vat_id, organization:supplier_organization_id ( tax_country ), " +
          "incoming_document_item!incoming_document_item_incoming_document_id_fkey ( ledger_account, net_amount, tax_rate, tax_code_id, linked_document_id )",
      )
      // Zeitraum: Vorsteuer-Zeitraum (vat_period_date), sonst Belegdatum
      .or(
        `and(vat_period_date.gte.${von},vat_period_date.lte.${bis}),and(vat_period_date.is.null,doc_date.gte.${von},doc_date.lte.${bis})`,
      )
      .in("doc_type", ["invoice", "credit_note"])
      .in("status", ["extracted", "reviewed", "booked", "exported"]),
    supabase.from("tax_code").select("id, datev_tax_key, treatment, direction"),
    supabase.from("setting").select("key, value").eq("key", "datev.revenue_accounts"),
    // Skonto-Ausbuchungen (Buchungszeilen auf den Skonto-Konten) im Monat der Zahlung: mindern Umsatz bzw. Vorsteuer
    supabase
      .from("bank_transaction_match")
      .select(
        "amount, ledger_account, sales_invoice_id, incoming_document_id, bank_transaction!inner ( booking_date ), " +
          "sales_invoice ( invoice_number, net_total, tax_total, organization:organization ( name ) ), " +
          "incoming_document ( doc_number, supplier_name, net_amount, tax_amount )",
      )
      .in("ledger_account", ["8736", "8731", "8730", "3736", "3731", "3730"])
      .gte("bank_transaction.booking_date", von)
      .lte("bank_transaction.booking_date", bis),
  ]);

  const rcCode = new Set(
    (tcs ?? [])
      .filter((t) => t.direction === "input" && (t.datev_tax_key?.trim() === "94" || t.treatment === "reverse_charge_eu"))
      .map((t) => t.id),
  );
  const igeCode = new Set(
    (tcs ?? []).filter((t) => t.direction === "input" && t.treatment === "intra_community_acquisition").map((t) => t.id),
  );
  const konten = ((settings ?? [])[0]?.value ?? {}) as UstvaErloesKonten;

  const zeilen: UstvaZeile[] = [];
  const hinweise: UstvaHinweis[] = [];

  // ---- Ausgang -------------------------------------------------------------
  const ohneBuchung: { label: string; href: string }[] = [];
  const sales = ((salesRaw ?? []) as unknown as SalesInv[]).filter((i) => i.invoice_number?.trim());
  for (const inv of sales) {
    const base = {
      richtung: "ausgang" as const,
      belegId: inv.id,
      belegNr: inv.invoice_number,
      partner: inv.organization?.name ?? "?",
      datum: versteuerung === "ist" ? inv.paid_at : inv.invoice_date,
      href: `/rechnungen/${inv.id}`,
      vorzeichen: (inv.kind === "credit_note" ? -1 : 1) as 1 | -1,
    };
    if (inv.bookings.length) {
      for (const b of inv.bookings) {
        const netto = Math.abs(b.net_amount);
        if (netto < 0.005) continue;
        zeilen.push({ ...base, netto, satz: Number(b.tax_rate ?? 0), konto: b.ledger_account });
      }
      continue;
    }
    // Näherung aus dem Rechnungskopf (keine Buchungszeilen vorhanden)
    ohneBuchung.push({ label: `${inv.invoice_number} · ${base.partner}`, href: base.href });
    let rest = Math.abs(inv.net_total ?? 0);
    for (const [rate, tax] of Object.entries(inv.tax_breakdown ?? {})) {
      const satz = Number(rate);
      if (satz <= 0 || !tax) continue;
      const netto = r2(Math.abs(Number(tax)) / (satz / 100));
      rest = r2(rest - netto);
      zeilen.push({ ...base, netto, satz, konto: null });
    }
    if (rest > 0.5) zeilen.push({ ...base, netto: rest, satz: 0, konto: null });
  }
  if (ohneBuchung.length)
    hinweise.push({
      ton: "warn",
      text: `${ohneBuchung.length} Ausgangsrechnung(en) ohne Buchungszeilen - Werte aus dem Rechnungskopf genähert (steuerfreie Anteile ggf. unzugeordnet).`,
      belege: ohneBuchung,
    });

  // ---- Eingang -------------------------------------------------------------
  const nichtGeprueft: { label: string; href: string }[] = [];
  let nichtGeprueftVst = 0;
  const auslandOhneRc: { label: string; href: string }[] = [];
  const rcUnklar: { label: string; href: string }[] = [];
  const ohneDatum: { label: string; href: string }[] = [];

  for (const d of (incRaw ?? []) as unknown as IncDoc[]) {
    const href = `/eingangsrechnungen/${d.id}`;
    const partner = d.supplier_name ?? "?";
    const label = `${d.doc_number ?? d.id.slice(0, 8)} · ${partner}`;
    const sign: 1 | -1 = d.doc_type === "credit_note" ? -1 : 1;

    if (d.status === "extracted") {
      nichtGeprueft.push({ label, href });
      nichtGeprueftVst = r2(nichtGeprueftVst + sign * (d.tax_amount ?? 0));
      continue;
    }

    const dRate = dominantRate(d.tax_breakdown, d.net_amount ?? 0, d.tax_amount ?? 0);
    const dRc = d.tax_code_id ? rcCode.has(d.tax_code_id) : false;
    // Mit einem anderen Beleg verknüpfte Positionen (z.B. Kreditkartenzeile) zählen hier nicht.
    const items = (d.incoming_document_item ?? []).filter((it) => !it.linked_document_id);
    const dIge = d.tax_code_id ? igeCode.has(d.tax_code_id) : false;
    const units: { net: number; rate: number; rc: boolean; ige: boolean; eust: boolean; konto: string | null }[] = [];
    if ((d.incoming_document_item ?? []).length) {
      for (const it of items) {
        units.push({
          net: it.net_amount ?? 0,
          rate: it.tax_rate != null ? Math.round(Number(it.tax_rate)) : dRate,
          rc: it.tax_code_id ? rcCode.has(it.tax_code_id) : dRc,
          ige: it.tax_code_id ? igeCode.has(it.tax_code_id) : dIge,
          eust: (it.ledger_account ?? d.ledger_account) === EUST_KONTO,
          konto: it.ledger_account ?? d.ledger_account,
        });
      }
    } else {
      units.push({ net: d.net_amount ?? 0, rate: dRate, rc: dRc, ige: dIge, eust: d.ledger_account === EUST_KONTO, konto: d.ledger_account });
    }

    const herkunft = rcHerkunft(d);
    let hatRc = false;
    let hatIge = false;
    for (const u of units) {
      if (Math.abs(u.net) < 0.005) continue;
      if (!u.eust && u.konto?.startsWith("8")) {
        // Erlöskonto (SKR03 8xxx) auf einem Eingangsbeleg, z.B. Gutschrift des Lieferanten für verwertetes
        // Altpapier (8520): das ist Umsatz, kein Vorsteuerabzug - Gutschrift = Erlös (+), Rechnung auf ein
        // Erlöskonto = Erlösschmälerung (-).
        zeilen.push({
          richtung: "ausgang", belegId: d.id, belegNr: d.doc_number, partner, datum: d.doc_date, href,
          netto: Math.abs(u.net), satz: u.rate, konto: u.konto, vorzeichen: (sign === -1 ? 1 : -1) as 1 | -1,
        });
      } else if (u.eust) {
        // Einfuhrumsatzsteuer (SKR03 1588 "Bezahlte Einfuhrumsatzsteuer"): Betrag = Vorsteuer, Kz 62
        zeilen.push({
          richtung: "eingang", belegId: d.id, belegNr: d.doc_number, partner, datum: d.doc_date, href,
          netto: Math.abs(u.net), satz: 0, rc: "eust", vorzeichen: sign,
        });
      } else if (u.ige) {
        hatIge = true;
        zeilen.push({
          richtung: "eingang", belegId: d.id, belegNr: d.doc_number, partner, datum: d.doc_date, href,
          netto: Math.abs(u.net), satz: 0, rc: "ige", vorzeichen: sign,
        });
      } else if (u.rc) {
        hatRc = true;
        zeilen.push({
          richtung: "eingang", belegId: d.id, belegNr: d.doc_number, partner, datum: d.doc_date, href,
          netto: Math.abs(u.net), satz: 0, rc: herkunft, vorzeichen: sign,
        });
      } else {
        zeilen.push({
          richtung: "eingang", belegId: d.id, belegNr: d.doc_number, partner, datum: d.doc_date, href,
          netto: Math.abs(u.net), satz: u.rate, vorzeichen: sign,
        });
      }
    }
    if (hatRc && herkunft === "unklar") rcUnklar.push({ label, href });
    if (!hatRc && !hatIge && istAuslaender(d) && (d.tax_amount ?? 0) < 0.005 && Math.abs(d.net_amount ?? 0) >= 0.005)
      auslandOhneRc.push({ label, href });
    if (!d.doc_date) ohneDatum.push({ label, href });
  }

  if (nichtGeprueft.length)
    hinweise.push({
      ton: "warn",
      text: `${nichtGeprueft.length} Eingangsbeleg(e) noch nicht geprüft - nicht enthalten (Vorsteuer laut Beleg zusammen ca. ${nichtGeprueftVst.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €).`,
      belege: nichtGeprueft,
    });
  if (auslandOhneRc.length)
    hinweise.push({
      ton: "warn",
      text: `${auslandOhneRc.length} Beleg(e) ausländischer Lieferanten ohne USt und ohne §13b-Steuerschlüssel (VST13B) - mögliche Reverse-Charge-Fälle.`,
      belege: auslandOhneRc,
    });
  if (rcUnklar.length)
    hinweise.push({
      ton: "warn",
      text: `${rcUnklar.length} §13b-Beleg(e) mit unklarem Lieferantenland (keine USt-IdNr, Land DE) - als Drittland (Kz 52/53) gezählt. EU-Lieferanten bitte Kz 46/47 zuordnen (USt-IdNr am Beleg/Organisation ergänzen).`,
      belege: rcUnklar,
    });

  // ---- Skonto ------------------------------------------------------------
  type SkontoRow = {
    amount: number;
    ledger_account: string;
    sales_invoice_id: string | null;
    incoming_document_id: string | null;
    bank_transaction: { booking_date: string } | { booking_date: string }[] | null;
    sales_invoice: { invoice_number: string | null; net_total: number | null; tax_total: number | null; organization: { name: string | null } | { name: string | null }[] | null } | null;
    incoming_document: { doc_number: string | null; supplier_name: string | null; net_amount: number | null; tax_amount: number | null } | null;
  };
  let skontoAnzahl = 0;
  let skontoUst = 0;
  let skontoVst = 0;
  for (const m of (skontoRaw ?? []) as unknown as SkontoRow[]) {
    const gross = Math.abs(Number(m.amount));
    const bt = Array.isArray(m.bank_transaction) ? m.bank_transaction[0] : m.bank_transaction;
    const acc = m.ledger_account;
    const ausgang = acc.startsWith("8") && !!m.sales_invoice_id;
    const eingang = acc.startsWith("3") && !!m.incoming_document_id;
    if (!ausgang && !eingang) continue;
    let rate = acc.endsWith("36") ? 19 : acc.endsWith("31") ? 7 : 0;
    if (rate === 0) {
      // "wählbarer" Skonto-Satz: Satz des Belegs
      const net = ausgang ? (m.sales_invoice?.net_total ?? 0) : (m.incoming_document?.net_amount ?? 0);
      const tax = ausgang ? (m.sales_invoice?.tax_total ?? 0) : (m.incoming_document?.tax_amount ?? 0);
      rate = net > 0 && tax > 0 ? Math.round((tax / net) * 100) : 0;
    }
    if (rate === 0 || gross < 0.005) continue;
    const netto = r2(gross / (1 + rate / 100));
    const org = m.sales_invoice?.organization;
    const partner = ausgang
      ? (Array.isArray(org) ? org[0]?.name : org?.name) ?? "?"
      : m.incoming_document?.supplier_name ?? "?";
    const nr = ausgang ? m.sales_invoice?.invoice_number : m.incoming_document?.doc_number;
    zeilen.push({
      richtung: ausgang ? "ausgang" : "eingang",
      belegId: (ausgang ? m.sales_invoice_id : m.incoming_document_id) as string,
      belegNr: `Skonto ${nr ?? ""}`.trim(),
      partner,
      datum: bt?.booking_date ?? null,
      href: ausgang ? `/rechnungen/${m.sales_invoice_id}` : `/eingangsrechnungen/${m.incoming_document_id}`,
      netto,
      satz: rate,
      konto: null,
      vorzeichen: -1,
    });
    skontoAnzahl += 1;
    if (ausgang) skontoUst = r2(skontoUst + r2((netto * rate) / 100));
    else skontoVst = r2(skontoVst + r2((netto * rate) / 100));
  }
  if (skontoAnzahl)
    hinweise.push({
      ton: "info",
      text: `${skontoAnzahl} Skonto-Ausbuchung(en) im Monat der Zahlung berücksichtigt: Umsatzsteuer −${skontoUst.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €, Vorsteuer −${skontoVst.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €.`,
    });

  const ergebnis = berechneUstva(zeilen, konten);
  if (ergebnis.unzugeordnet.length)
    hinweise.push({
      ton: "warn",
      text: `${ergebnis.unzugeordnet.length} steuerfreie Ausgangszeile(n) ohne Kennzahl-Zuordnung (Erlöskonto nicht in den Erlöskonten-Einstellungen für igL/EU/Drittland) - nicht enthalten.`,
      belege: ergebnis.unzugeordnet.map((z) => ({ label: `${z.belegNr} · ${z.partner}`, href: z.href })),
    });
  if (versteuerung === "ist")
    hinweise.push({
      ton: "info",
      text: "Ist-Versteuerung: Ausgangsrechnungen nach Zahlungsdatum (paid_at), bei Teilzahlungen die volle Rechnung im Monat der Zahlung.",
    });
  hinweise.push({
    ton: "info",
    text: "Vorsteuer nach Rechnungsdatum der geprüften Eingangsbelege; Cent-Abweichungen zu DATEV/Rechnung durch Rundung je Position möglich.",
  });

  return {
    monat, von, bis, versteuerung, ergebnis, hinweise,
    anzahlAusgang: new Set(zeilen.filter((z) => z.richtung === "ausgang").map((z) => z.belegId)).size,
    anzahlEingang: new Set(zeilen.filter((z) => z.richtung === "eingang").map((z) => z.belegId)).size,
    stand: new Date().toISOString(),
  };
}
