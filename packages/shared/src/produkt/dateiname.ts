/**
 * IP-Nummer aus einem Dateinamen wie "IP_91e_Unterregister ..." oder
 * "IP_73 Übersicht ..." (Trenner nach der Nummer ist mal "_", mal Leerzeichen).
 */
export function ipKeyAusDateiname(name: string): string | null {
  return name.match(/^IP_(\d+[a-z]?)[_ ]/i)?.[1]?.toLowerCase() ?? null;
}
