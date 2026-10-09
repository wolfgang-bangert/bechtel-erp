/**
 * Vorschlag für den Buchungstext einer beleglosen Bankbuchung (Versicherung, Leasing, Gebühren …):
 * Gegenseite + Verwendungszweck ohne Bank-Füllsel ("DATUM … UHR", "SecureGo plus IBAN: …", Mandats-/
 * Gläubiger-IDs), auf 60 Zeichen gekürzt (DATEV-Buchungstext).
 */
export function buchungstextVorschlag(gegenseite: string | null | undefined, zweck: string | null | undefined): string {
  const z = (zweck ?? "")
    .replace(/DATUM\s+\d{2}\.\d{2}\.\d{4},?\s*\d{2}\.\d{2}\s*UHR/gi, " ")
    .replace(/SecureGo plus.*$/i, " ")
    .replace(/\b(IBAN|BIC|EREF|MREF|CRED|KREF|SVWZ|ABWA|ABWE)[:+]\s*\S+/gi, " ")
    .replace(/\bEnd-?to-?End-?Ref\.?:?\s*\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Gegenseite kurz halten (ohne Rechtsform), damit vom Zweck genug übrig bleibt (Vertrags-Nr., Kennzeichen …)
  const g = (gegenseite ?? "")
    .replace(/\b(GmbH|mbH|AG|KG|KGaA|OHG|GbR|e\.?\s?K\.?|e\.?\s?V\.?|S\.A\.?|S\.?A\.?R\.?L\.?|SE|Ltd\.?|Inc\.?|Gruppe|Group|Aktiengesellschaft)\b\.?/gi, " ")
    .replace(/[+&]\s*Co\.?/gi, " ")
    .replace(/\s+[A-Z]$/, "")
    .replace(/[-,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25)
    .trim();
  // Gegenseite nicht doppeln, wenn der Zweck schon mit ihr beginnt
  const text = g && !z.toLowerCase().startsWith(g.toLowerCase().slice(0, 12)) ? `${g} ${z}` : z || g;
  return text.replace(/[";]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 60);
}
