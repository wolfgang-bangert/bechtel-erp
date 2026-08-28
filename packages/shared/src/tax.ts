// Steuerlogik – Entwurf, wird in Slice 3 (Fakturierung) verbindlich.
// Regeln mit dem Steuerberater bestätigen.

export type TaxTreatment =
  | "standard_de" // Inland 19 % / 7 %
  | "reverse_charge_eu" // EU B2B, Steuerschuld beim Empfänger
  | "intra_community_supply" // innergem. Warenlieferung, steuerfrei
  | "export_third_country" // Ausfuhr Drittland (CH), steuerfrei
  | "tax_free_other";

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

export interface PartyTaxInfo {
  /** ISO-3166-1 alpha-2, z. B. "DE", "CH", "FR" */
  country: string;
  /** USt-IdNr vorhanden und via VIES bestätigt */
  vatIdValid: boolean;
  /** true = Geschäftskunde (B2B) */
  isBusiness: boolean;
}

/**
 * Ermittelt die Steuerbehandlung für eine Leistung/Lieferung an `customer`,
 * ausgehend vom eigenen Sitz in Deutschland.
 *
 * Vereinfachte Regeln für den Druckerei-Fall (Leistung + Warenlieferung):
 *  - DE  -> standard_de
 *  - EU + B2B + gültige USt-IdNr -> reverse_charge_eu (bzw. intra_community_supply für reine Ware)
 *  - EU ohne gültige USt-IdNr / B2C -> standard_de (deutsche USt; OSS gesondert prüfen)
 *  - Drittland (CH) -> export_third_country
 */
export function resolveTaxTreatment(
  customer: PartyTaxInfo,
  opts: { pureGoods?: boolean } = {},
): TaxTreatment {
  const country = customer.country.toUpperCase();

  if (country === "DE") return "standard_de";

  if (EU_COUNTRIES.has(country)) {
    if (customer.isBusiness && customer.vatIdValid) {
      return opts.pureGoods ? "intra_community_supply" : "reverse_charge_eu";
    }
    return "standard_de"; // B2C / ohne USt-IdNr – ggf. OSS gesondert behandeln
  }

  return "export_third_country"; // inkl. CH
}

/** Rechnungshinweis-Text je Behandlung (Platzhalter, final in Slice 3). */
export const TAX_TREATMENT_NOTE: Record<TaxTreatment, string> = {
  standard_de: "",
  reverse_charge_eu:
    "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).",
  intra_community_supply: "Steuerfreie innergemeinschaftliche Lieferung.",
  export_third_country: "Steuerfreie Ausfuhrlieferung.",
  tax_free_other: "Steuerfreier Umsatz.",
};

export function isEuCountry(country: string): boolean {
  return EU_COUNTRIES.has(country.toUpperCase());
}
