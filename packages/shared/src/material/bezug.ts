/** Wie viel Ziel-Menge ergibt eine Umbuchung (z.B. 1000 Rohbogen × 4 Nutzen = 4000 Druckbogen). */
export function umbuchungZielMenge(quelleMenge: number, nutzen: number | null): number {
  return quelleMenge * (nutzen ?? 1);
}

export function unterMindestbestand(bestand: number, mindestbestand: number | null): boolean {
  return mindestbestand != null && bestand <= mindestbestand;
}
