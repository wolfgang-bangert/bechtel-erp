import { readFileSync } from "node:fs";

/** Rechnungsnummern der zum 31.12.2025 offenen Ausgangsrechnungen (aus den BB-Buchungen). */
export function opForderungsNummern(): Set<string> {
  const l = JSON.parse(readFileSync(new URL("../data/bb-op-forderungen-2025.json", import.meta.url), "utf8")) as { nr: string }[];
  return new Set(l.map((o) => o.nr));
}
