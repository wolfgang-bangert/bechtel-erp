/**
 * Lohn-Auswertung aus dem Buchungsstapel des Lohnabrechners (payroll_booking, Konto 1755 an Gegenkonto).
 * Aufwand: Gegenkonto 4xxx bzw. 8590 (Sachbezüge, gegengerechnet). Vorzeichen: "H" auf 1755 heißt
 * Gegenkonto im Soll (Aufwand +), "S" auf 1755 heißt Gegenkonto im Haben (Aufwand −, z. B. Sachbezug).
 */
export type KostenGruppe = { key: string; label: string; konten: (konto: string) => boolean };

/** SKR03-Personalkonten, gruppiert für die Arbeitgeber-Belastung. */
export const KOSTEN_GRUPPEN: KostenGruppe[] = [
  { key: "brutto", label: "Löhne und Gehälter", konten: (k) => /^41[0-2]\d$/.test(k) || /^419[0-3]$/.test(k) },
  { key: "sv", label: "AG-Anteil Sozialversicherung, Umlagen, BG", konten: (k) => /^413\d$/.test(k) },
  { key: "vorsorge", label: "Altersversorgung, VWL, freiwillige Leistungen", konten: (k) => /^41[4-7]\d$/.test(k) && !["4149", "4167", "4175"].includes(k) },
  { key: "fahrt", label: "Fahrtkostenerstattung", konten: (k) => k === "4175" },
  { key: "pauschal", label: "Pauschale Lohnsteuer", konten: (k) => ["4149", "4167", "4194", "4199"].includes(k) },
  { key: "sachbezug", label: "Sachbezüge (gegengerechnet)", konten: (k) => /^859\d$/.test(k) },
  // U1/U2-Erstattungen der Krankenkassen (z. B. Mutterschaftsgeld-Zuschuss) mindern die AG-Belastung
  { key: "erstattung", label: "Erstattungen U1/U2 (Aufwendungsausgleichsgesetz)", konten: (k) => k === "2749" },
  { key: "sonst", label: "Sonstige Personalkosten", konten: () => true },
];

/**
 * Erfolgskonto (Aufwand/Ertrag) statt Bestandskonto: in SKR03 alles außer Klasse 0 und 1. Erfolgskonten
 * gehören in die Lohnkosten, Bestandskonten (Verbindlichkeiten 17xx, Forderungen 15xx …) in den Abgleich.
 */
export const istPersonalaufwand = (k: string) => /^\d{4}$/.test(k) && !/^[01]/.test(k);

export function gruppeVon(konto: string): string | null {
  if (!istPersonalaufwand(konto)) return null;
  return KOSTEN_GRUPPEN.find((g) => g.konten(konto))?.key ?? "sonst";
}

/** Betrag aus Sicht des Gegenkontos (Soll positiv). */
export const gegenkontoSoll = (b: { amount: number; soll_haben: "S" | "H" }) => (b.soll_haben === "H" ? Math.abs(b.amount) : -Math.abs(b.amount));

/** Gegenpartei-Namen, die nach Lohnzahlung aussehen (offene Bankzeilen-Vorschläge). */
export const LOHN_PARTNER =
  /krankenkasse|aok|barmer|\bdak\b|\bikk\b|\bbkk\b|\bsbk\b|knappschaft|techniker|\bhkk\b|finanzamt|versorgungswerk|presse-versorgung|minijob|berufsgenossenschaft|\bbg\b|sozialversicherung|soka|zusatzversorgung|direktversicherung/i;
export const LOHN_ZWECK = /lohn|gehalt|loehne|löhne|sv-beitr|beitragsnachweis|lohnsteuer|lst-anm/i;
