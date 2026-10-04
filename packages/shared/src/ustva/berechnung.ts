/**
 * Umsatzsteuer-Voranmeldung (UStVA) - reine Berechnung aus Buchungszeilen.
 * Die Zeilen werden vom Aufrufer aus der Datenbank geladen (siehe
 * apps/web/src/lib/ustva.ts) - hier nur Zuordnung zu Kennzahlen + Summen,
 * damit dieselbe Logik später auch für den ELSTER-Versand im Worker nutzbar ist.
 *
 * Kennzahlen (Formular 2025/2026):
 *  81 / 86  Umsätze 19 % / 7 %                      Bemessungsgrundlage (ganze €) + Steuer
 *  41       steuerfreie innergemeinschaftliche Lieferungen
 *  21       nicht steuerbare sonstige Leistungen an EU-Unternehmer (§ 18b)
 *  43       steuerfreie Ausfuhrlieferungen / Drittland
 *  46 / 47  Leistungen EU-Unternehmer (§ 13b Abs. 1)  Bemessungsgrundlage / Steuer
 *  52 / 53  Leistungen ausländischer Unternehmer aus Drittländern (§ 13b Abs. 2 Nr. 1)
 *  89       steuerpflichtige innergemeinschaftliche Erwerbe zu 19 % (Eingang: EU-Lieferant liefert steuerfrei, Art. 138)
 *  61       Vorsteuer aus innergemeinschaftlichem Erwerb
 *  62       entrichtete Einfuhrumsatzsteuer (Eingang: Beleg/Position auf Konto 1588, der Betrag selbst ist die Vorsteuer)
 *  66       Vorsteuer aus Rechnungen anderer Unternehmer
 *  67       Vorsteuer aus Leistungen nach § 13b
 *  83       verbleibende Vorauszahlung (+) bzw. Überschuss (-)
 */

export type UstvaRichtung = "ausgang" | "eingang";

export type UstvaZeile = {
  richtung: UstvaRichtung;
  /** Beleg-ID + Anzeige für die Aufstellung */
  belegId: string;
  belegNr: string | null;
  partner: string;
  datum: string | null;
  href: string;
  /** Netto (positiv; Gutschriften über `vorzeichen`). */
  netto: number;
  /** Steuersatz in % (0 bei steuerfrei/§13b-Eingang: dort `rc` setzen). */
  satz: number;
  /** Bei Ausgang: Erlöskonto (zur Einordnung steuerfreier Zeilen). */
  konto?: string | null;
  /** Eingang: §13b-Fall (BU 94) - Steuer wird mit 19 % selbst berechnet. */
  rc?: "eu" | "drittland" | "unklar" | "ige" | "eust";
  vorzeichen: 1 | -1;
};

export type UstvaErloesKonten = {
  intra_community_supply?: string;
  reverse_charge_eu?: string;
  export_third_country?: string;
};

export type KennzahlZeile = {
  kz: string;
  label: string;
  /** Bemessungsgrundlage (exakt, Summe der Nettobeträge) */
  basis: number | null;
  /** Steuerbetrag (exakt) */
  steuer: number | null;
  belege: UstvaZeile[];
};

export type UstvaErgebnis = {
  kennzahlen: KennzahlZeile[];
  umsatzsteuer: number;
  vorsteuer: number;
  /** Kz 83: positiv = Zahllast, negativ = Erstattung */
  zahllast: number;
  /** nicht eindeutig zuordenbare Zeilen (steuerfreie Ausgangszeilen ohne Konto-Zuordnung) */
  unzugeordnet: UstvaZeile[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const RC_SATZ = 19;

const LABEL: Record<string, string> = {
  "81": "Umsätze zu 19 %",
  "86": "Umsätze zu 7 %",
  "41": "Steuerfreie innergemeinschaftliche Lieferungen",
  "21": "Nicht steuerbare sonstige Leistungen an EU-Unternehmer (§ 18b)",
  "43": "Steuerfreie Ausfuhrlieferungen / Drittland",
  "89": "Innergemeinschaftliche Erwerbe zu 19 % (steuerfreie Lieferung des EU-Lieferanten, Art. 138)",
  "61": "Abziehbare Vorsteuer aus innergemeinschaftlichem Erwerb",
  "62": "Entrichtete Einfuhrumsatzsteuer (Vorsteuer, Konto 1588)",
  "46": "Leistungen EU-Unternehmer (§ 13b Abs. 1) - Steuerschuld beim Empfänger",
  "52": "Leistungen ausländischer Unternehmer, Drittland (§ 13b Abs. 2 Nr. 1)",
  "66": "Abziehbare Vorsteuer aus Rechnungen anderer Unternehmer",
  "67": "Abziehbare Vorsteuer aus Leistungen nach § 13b",
};

/** Steuerbetrag einer Zeile (vorzeichenbehaftet). */
export function zeilenSteuer(z: UstvaZeile): number {
  // Einfuhrumsatzsteuer: der gebuchte Betrag (Konto 1588) ist bereits die Steuer, kein Satz anzuwenden.
  if (z.rc === "eust") return r2(z.vorzeichen * z.netto);
  const satz = z.rc ? RC_SATZ : z.satz;
  return r2(z.vorzeichen * z.netto * (satz / 100));
}

export function berechneUstva(zeilen: UstvaZeile[], konten: UstvaErloesKonten): UstvaErgebnis {
  const buckets = new Map<string, UstvaZeile[]>();
  const add = (kz: string, z: UstvaZeile) => {
    const l = buckets.get(kz) ?? [];
    l.push(z);
    buckets.set(kz, l);
  };
  const unzugeordnet: UstvaZeile[] = [];

  for (const z of zeilen) {
    if (z.richtung === "ausgang") {
      if (z.satz >= 18) add("81", z);
      else if (z.satz >= 6 && z.satz < 8) add("86", z);
      else if (konten.intra_community_supply && z.konto === konten.intra_community_supply) add("41", z);
      else if (konten.reverse_charge_eu && z.konto === konten.reverse_charge_eu) add("21", z);
      else if (konten.export_third_country && z.konto === konten.export_third_country) add("43", z);
      else unzugeordnet.push(z);
    } else if (z.rc === "eust") {
      add("62", z);
    } else if (z.rc === "ige") {
      add("89", z);
      add("61", z);
    } else if (z.rc) {
      add(z.rc === "eu" ? "46" : "52", z);
      add("67", z);
    } else {
      add("66", z);
    }
  }

  const sum = (kz: string, f: (z: UstvaZeile) => number) =>
    r2((buckets.get(kz) ?? []).reduce((s, z) => s + f(z), 0));
  const netto = (z: UstvaZeile) => r2(z.vorzeichen * z.netto);
  const steuer = (z: UstvaZeile) => zeilenSteuer(z);

  const row = (kz: string, mitSteuer: boolean, steuerKz?: string): KennzahlZeile => ({
    kz: steuerKz ? `${kz} / ${steuerKz}` : kz,
    label: LABEL[kz] ?? kz,
    basis: kz === "66" || kz === "67" || kz === "61" || kz === "62" ? null : sum(kz, netto),
    steuer: mitSteuer ? sum(kz, steuer) : null,
    belege: buckets.get(kz) ?? [],
  });

  // Vorsteuer-Kennzahlen: Basis wird nicht ausgewiesen, nur der Steuerbetrag.
  const kennzahlen: KennzahlZeile[] = [
    row("81", true),
    row("86", true),
    row("41", false),
    row("21", false),
    row("43", false),
    row("46", true, "47"),
    row("52", true, "53"),
    row("89", true),
    row("61", true),
    row("62", true),
    row("66", true),
    row("67", true),
  ];

  const umsatzsteuer = r2(sum("81", steuer) + sum("86", steuer) + sum("46", steuer) + sum("52", steuer) + sum("89", steuer));
  const vorsteuer = r2(sum("66", steuer) + sum("67", steuer) + sum("61", steuer) + sum("62", steuer));
  return { kennzahlen, umsatzsteuer, vorsteuer, zahllast: r2(umsatzsteuer - vorsteuer), unzugeordnet };
}
