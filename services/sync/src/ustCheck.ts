import type { Extracted } from "./extractIncoming";
import { supabase } from "./supabase";

/* --------------------------------------------------------------------------
 * Strenge USt-Prüfung für Eingangsbelege.
 *
 * Der Steuerschlüssel wird NUR dann automatisch gesetzt ("sicher"), wenn alles
 * eindeutig ist: deutscher Lieferant, EUR, ausgewiesene USt von 19 %/7 %, keine
 * Hinweise auf Reverse Charge/Steuerbefreiung und die Beträge passen exakt
 * zusammen. In jedem anderen Fall gibt es nur einen Vorschlag ("vorschlag"),
 * den der Nutzer im Beleg mit einem Klick bestätigt - ohne Steuerschlüssel am
 * Beleg, bis er bestätigt ist.
 * -------------------------------------------------------------------------- */

export type UstTaxCode = { id: string; code: string; rate: number; treatment: string };

export type UstVerdict = {
  status: "sicher" | "vorschlag";
  /** tax_code.id des (vorgeschlagenen) Schlüssels, null = keiner ableitbar */
  tax_code_id: string | null;
  tax_code: string | null;
  reason: string;
};

const EU = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "GR", "EL", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

// Hinweis auf steuerfreie innergemeinschaftliche Lieferung (Art. 138 MwStSystRL) in den gängigen Sprachen
const IG_LIEFERUNG = /innergemeinschaftlich|intra[-\s]?community|intracommunautaire|intracomunitari|art(?:ikel|icle|\.)?\s*138|\b138\b.{0,40}(?:2006\/112|mwstsyst|rl|directive)/i;

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return v == null || v === "" || !Number.isFinite(x) ? null : x;
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

export function pruefeUst(
  e: Extracted,
  opts: {
    codes: UstTaxCode[];
    supplierCountry?: string | null;
    /** Einstellung an der Organisation: 'service' = Dienstleister (Reverse Charge), 'goods' = Warenlieferant. */
    supplierKind?: "service" | "goods" | null;
    /** Eigene USt-IdNr. (Firmenprofil) - steht beim Rechnungsempfänger, ist nie die des Lieferanten. */
    ownVatId?: string | null;
  },
): UstVerdict {
  const std = (rate: number) =>
    opts.codes.find((c) => c.treatment === "standard_de" && Math.round(Number(c.rate)) === Math.round(rate)) ?? null;
  const rc = opts.codes.find((c) => c.treatment === "reverse_charge_eu") ?? null;
  const ige = opts.codes.find((c) => c.treatment === "intra_community_acquisition") ?? null;
  const vst0 = opts.codes.find((c) => c.treatment === "tax_free_other" && Math.round(Number(c.rate)) === 0) ?? null;
  const verdict = (status: UstVerdict["status"], code: UstTaxCode | null, reason: string): UstVerdict => ({
    status,
    tax_code_id: code?.id ?? null,
    tax_code: code?.code ?? null,
    reason,
  });

  const net = n(e.net_amount);
  const tax = n(e.tax_amount);
  const gross = n(e.gross_amount);
  const currency = (e.currency ?? "EUR").toUpperCase();
  const own = (opts.ownVatId ?? "").replace(/\s/g, "").toUpperCase();
  let vat = (e.supplier?.vat_id ?? "").replace(/\s/g, "").toUpperCase();
  if (own && vat === own) vat = "";
  let country = /^[A-Z]{2}/.test(vat) ? vat.slice(0, 2) : (opts.supplierCountry ?? "").toUpperCase();
  if (country === "EL") country = "GR";
  const bd = Object.entries(e.tax_breakdown ?? {})
    .map(([r, amt]) => ({ rate: Number(r), amount: n(amt) ?? 0 }))
    .filter((x) => Number.isFinite(x.rate));
  const dominant = [...bd].filter((x) => x.rate > 0).sort((a, b) => b.amount - a.amount)[0]?.rate ?? null;
  const rcNote = e.vat_check?.reverse_charge === true;
  const freeReason = e.vat_check?.tax_free_reason?.trim() || null;
  const noTax = tax == null || tax === 0 || bd.length === 0;

  // --- Einstellung an der Organisation hat Vorrang vor der Standardregel ---------------------
  if (noTax && country !== "DE") {
    if (opts.supplierKind === "goods") {
      if (EU.has(country) && ige) {
        return verdict("vorschlag", ige, "Warenlieferant aus der EU ohne USt - vermutlich innergemeinschaftlicher Erwerb");
      }
      return verdict("vorschlag", null, "Lieferant ist als Warenlieferant aus dem Ausland markiert - kein §13b, ggf. Einfuhr: bitte Schlüssel festlegen");
    }
    // Beleg weist ausdrücklich eine steuerfreie innergemeinschaftliche Lieferung aus (Art. 138) und der Lieferant
    // sitzt in der EU (gültige Lieferanten-USt-IdNr. eines EU-Landes) -> innergemeinschaftlicher Erwerb, automatisch.
    if (opts.supplierKind !== "service" && ige && EU.has(country) && freeReason && IG_LIEFERUNG.test(freeReason)) {
      return verdict("sicher", ige, `Beleg weist steuerfreie innergemeinschaftliche Lieferung aus (${freeReason.slice(0, 80)}), Lieferant aus ${country} - Erwerbsteuer beim Empfänger`);
    }
    if (opts.supplierKind === "service" && rc) {
      return verdict("sicher", rc, "Lieferant ist als Auslands-Dienstleister markiert - Reverse Charge (§ 13b)");
    }
    // Standardregel (Nutzer): USD-Rechnung ohne ausgewiesene USt = Dienstleistung eines Anbieters aus
    // dem Drittland -> Reverse Charge §13b, automatisch (nicht nur Vorschlag).
    if (currency === "USD" && rc) {
      return verdict("sicher", rc, "USD-Rechnung ohne USt - Reverse Charge (§ 13b), Standardregel");
    }
  }

  // --- Reverse Charge / ausländische Leistung ohne USt -> Vorschlag §13b -------
  if (rcNote) return verdict("vorschlag", rc, "Beleg nennt Reverse Charge / Steuerschuldnerschaft des Leistungsempfängers");
  if (noTax && country && country !== "DE") {
    return verdict(
      "vorschlag",
      rc,
      `Lieferant aus ${country} (${EU.has(country) ? "EU" : "Drittland"}), keine USt ausgewiesen` +
        (freeReason ? ` — Beleg: ${freeReason}` : ""),
    );
  }
  if (noTax && currency !== "EUR") {
    return verdict("vorschlag", rc, `Fremdwährung ${currency}, keine USt ausgewiesen`);
  }
  if (noTax) {
    // Deutscher Lieferant ohne USt (Porto, Versicherung, Kleinunternehmer ...): keine Vorsteuer. Ist die
    // Steuerfreiheit auf dem Beleg erkennbar (0-%-Satz oder Begründung), setzen wir VST0 automatisch.
    if (country === "DE" && currency === "EUR" && vst0) {
      const explicitZero = bd.some((x) => x.rate === 0);
      if (freeReason || explicitZero) {
        return verdict("sicher", vst0, `deutscher Lieferant, keine USt ausgewiesen${freeReason ? ` (${freeReason.slice(0, 80)})` : " (0 %)"} - keine Vorsteuer`);
      }
      return verdict("vorschlag", vst0, "deutscher Lieferant ohne ausgewiesene USt - vermutlich steuerfrei (keine Vorsteuer), bitte bestätigen");
    }
    return verdict(
      "vorschlag",
      vst0,
      freeReason
        ? `Keine USt ausgewiesen — Beleg: ${freeReason}`
        : "Beleg weist keine USt aus - bitte Schlüssel festlegen",
    );
  }

  // --- USt ausgewiesen: auf 19 %/7 % deutscher Lieferant mit stimmenden Beträgen prüfen ---
  // Ein 0-%-Anteil neben 19 %/7 % (z.B. DPD: Europa-Pakete in eigener Steuergruppe mit 0 %) ist erlaubt,
  // solange die Positionen auf die ausgewiesene USt aufgehen.
  const pos = bd.filter((x) => x.rate > 0);
  const zero = bd.filter((x) => x.rate === 0);
  const gemischt = pos.length > 1 || (zero.length > 0 && pos.length > 0);
  const problems: string[] = [];
  // Ohne USt-IdNr. (z.B. Kleinbetragsrechnung/Restaurant): 7 % UND 19 % nebeneinander in EUR ist die deutsche
  // Satzkombination - dann gilt der Lieferant als inländisch.
  const deutscheSaetze = pos.some((x) => Math.round(x.rate) === 7) && pos.some((x) => Math.round(x.rate) === 19);
  const landAusSaetzen = !country && currency === "EUR" && deutscheSaetze;
  if (!country && !landAusSaetzen) problems.push("Land des Lieferanten unbekannt (keine USt-IdNr.)");
  else if (country && country !== "DE") problems.push(`Lieferant aus ${country}, weist aber deutsche USt aus`);
  if (currency !== "EUR") problems.push(`Währung ${currency}`);
  if (freeReason && !(zero.length > 0 && pos.length > 0)) problems.push(`Beleg nennt: ${freeReason}`);
  if (pos.some((x) => !std(x.rate) || ![7, 19].includes(Math.round(x.rate)))) {
    problems.push(`ungewöhnlicher Steuersatz (${bd.map((x) => x.rate).join("/")} %)`);
  }
  if (net == null || gross == null) problems.push("Netto/Brutto nicht erkannt");
  else {
    if (!near(net + (tax ?? 0), gross, 0.02)) problems.push("Netto + USt ≠ Brutto");
    if (!near(bd.reduce((s, x) => s + x.amount, 0), tax ?? 0, 0.02)) problems.push("USt-Zeilen ≠ USt gesamt");
    if (!gemischt && bd.length === 1 && !near(net * (bd[0].rate / 100), tax ?? 0, Math.max(0.03, net * 0.001))) {
      problems.push(`USt ${tax} passt nicht zu ${bd[0].rate} % von ${net}`);
    }
    if (gemischt) {
      const items = e.line_items ?? [];
      const itemsOk =
        items.length > 0 &&
        items.every((li) => n(li.net_amount) != null && n(li.tax_rate) != null) &&
        near(items.reduce((s, li) => s + n(li.net_amount)!, 0), net, 0.05) &&
        near(items.reduce((s, li) => s + (n(li.net_amount)! * n(li.tax_rate)!) / 100, 0), tax ?? 0, 0.05);
      if (!itemsOk) problems.push("gemischte Steuersätze, Positionen rechnen nicht auf die USt");
    }
  }
  const code = dominant != null ? std(dominant) : null;
  if (!problems.length && code) {
    return verdict("sicher", code, `${landAusSaetzen ? "Land unbekannt, aber 7 % und 19 % nebeneinander (deutsche Sätze)" : "deutscher Lieferant"}, ${bd.map((x) => x.rate).join("/")} % USt ausgewiesen, Beträge stimmig${zero.length ? " (0-%-Anteil je Position)" : ""}`);
  }
  return verdict("vorschlag", code, problems.join("; ") || "Steuerschlüssel nicht ableitbar");
}

/** Eigene USt-IdNr. (normalisiert) aus dem Firmenprofil. */
export async function loadOwnVatId(): Promise<string> {
  const { data } = await supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle();
  return String((data?.value as { vat_id?: string } | null)?.vat_id ?? "").replace(/\s/g, "").toUpperCase();
}
