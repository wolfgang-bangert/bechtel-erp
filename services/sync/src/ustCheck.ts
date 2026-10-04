import type { Extracted } from "./extractIncoming";

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
  },
): UstVerdict {
  const std = (rate: number) =>
    opts.codes.find((c) => c.treatment === "standard_de" && Math.round(Number(c.rate)) === Math.round(rate)) ?? null;
  const rc = opts.codes.find((c) => c.treatment === "reverse_charge_eu") ?? null;
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
  const vat = (e.supplier?.vat_id ?? "").replace(/\s/g, "").toUpperCase();
  let country = /^[A-Z]{2}/.test(vat) ? vat.slice(0, 2) : (opts.supplierCountry ?? "").toUpperCase();
  if (country === "EL") country = "GR";
  const bd = Object.entries(e.tax_breakdown ?? {})
    .map(([r, amt]) => ({ rate: Number(r), amount: n(amt) ?? 0 }))
    .filter((x) => Number.isFinite(x.rate));
  const dominant = [...bd].sort((a, b) => b.amount - a.amount)[0]?.rate ?? null;
  const rcNote = e.vat_check?.reverse_charge === true;
  const freeReason = e.vat_check?.tax_free_reason?.trim() || null;
  const noTax = tax == null || tax === 0 || bd.length === 0;

  // --- Einstellung an der Organisation hat Vorrang vor der Standardregel ---------------------
  if (noTax && country !== "DE") {
    if (opts.supplierKind === "goods") {
      return verdict("vorschlag", null, "Lieferant ist als Warenlieferant aus dem Ausland markiert - kein §13b, ggf. Einfuhr: bitte Schlüssel festlegen");
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
    return verdict(
      "vorschlag",
      null,
      freeReason
        ? `Keine USt ausgewiesen — Beleg: ${freeReason}`
        : "Beleg weist keine USt aus - bitte Schlüssel festlegen",
    );
  }

  // --- USt ausgewiesen: auf 19 %/7 % deutscher Lieferant mit stimmenden Beträgen prüfen ---
  const problems: string[] = [];
  if (!country) problems.push("Land des Lieferanten unbekannt (keine USt-IdNr.)");
  else if (country !== "DE") problems.push(`Lieferant aus ${country}, weist aber deutsche USt aus`);
  if (currency !== "EUR") problems.push(`Währung ${currency}`);
  if (freeReason) problems.push(`Beleg nennt: ${freeReason}`);
  if (bd.some((x) => !std(x.rate) || ![7, 19].includes(Math.round(x.rate)))) {
    problems.push(`ungewöhnlicher Steuersatz (${bd.map((x) => x.rate).join("/")} %)`);
  }
  if (net == null || gross == null) problems.push("Netto/Brutto nicht erkannt");
  else {
    if (!near(net + (tax ?? 0), gross, 0.02)) problems.push("Netto + USt ≠ Brutto");
    if (!near(bd.reduce((s, x) => s + x.amount, 0), tax ?? 0, 0.02)) problems.push("USt-Zeilen ≠ USt gesamt");
    if (bd.length === 1 && !near(net * (bd[0].rate / 100), tax ?? 0, Math.max(0.03, net * 0.001))) {
      problems.push(`USt ${tax} passt nicht zu ${bd[0].rate} % von ${net}`);
    }
    if (bd.length > 1) {
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
    return verdict("sicher", code, `deutscher Lieferant, ${bd.map((x) => x.rate).join("/")} % USt ausgewiesen, Beträge stimmig`);
  }
  return verdict("vorschlag", code, problems.join("; ") || "Steuerschlüssel nicht ableitbar");
}
