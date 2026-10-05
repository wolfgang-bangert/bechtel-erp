import type { UstvaErgebnis } from "@werk/shared/ustva";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Werte wie ELSTER rechnet: Bemessungsgrundlagen als volle Euro (abgerundet), Steuer auf Kz 81/86/89 von ELSTER selbst. */
export function elsterWerte(e: UstvaErgebnis) {
  const kz = new Map(e.kennzahlen.map((k) => [k.kz, k]));
  const basis = (k: string) => Math.trunc(kz.get(k)?.basis ?? 0);
  const steuer = (k: string) => kz.get(k)?.steuer ?? 0;
  const ust = r2(basis("81") * 0.19) + r2(basis("86") * 0.07) + r2(basis("89") * 0.19) + steuer("46 / 47") + steuer("52 / 53");
  const vst = steuer("66") + steuer("61") + steuer("62") + steuer("67");
  return { basis, steuer, ust: r2(ust), vst: r2(vst), zahllast: r2(ust - vst) };
}

/**
 * Steuernummer ins 13-stellige ELSTER-Bundesschema bringen.
 * Baden-Württemberg: FFBBB/UUUUP (10 Ziffern) -> 28 FF 0 BBB UUUUP. Bereits 13 Ziffern bleiben unverändert.
 */
export function steuernummerBundesschema(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 13) return d;
  if (d.length === 10) return `28${d.slice(0, 2)}0${d.slice(2)}`;
  return null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type XmlLieferant = { name: string; strasse: string; plz: string; ort: string };

/**
 * UStVA-Nutzdaten für den Upload in Mein ELSTER ("Formulardaten hochladen"): nur der Block `Anmeldungssteuern`
 * ohne TransferHeader. Namespace/Version = Veranlagungsjahr. Kennzahlen aufsteigend (Schema-Reihenfolge).
 */
export function ustvaXml(opts: {
  monat: string; // YYYY-MM
  steuernummer: string; // 13-stellig
  lieferant: XmlLieferant;
  e: UstvaErgebnis;
  berichtigt: boolean;
  heute?: Date;
}): string {
  const [jahr, mon] = opts.monat.split("-");
  const w = elsterWerte(opts.e);
  const ganz = (n: number) => String(Math.trunc(n));
  const betrag = (n: number) => r2(n).toFixed(2);
  const felder: [string, string][] = [];
  const add = (k: string, v: string | null) => {
    if (v !== null) felder.push([k, v]);
  };
  const ganzWenn = (k: string, bas: number) => (bas !== 0 ? ganz(bas) : null);
  const betragWenn = (n: number) => (Math.abs(n) >= 0.005 ? betrag(n) : null);

  if (opts.berichtigt) add("Kz10", "1");
  add("Kz21", ganzWenn("21", w.basis("21")));
  add("Kz41", ganzWenn("41", w.basis("41")));
  add("Kz43", ganzWenn("43", w.basis("43")));
  add("Kz46", ganzWenn("46", w.basis("46 / 47")));
  add("Kz47", betragWenn(w.steuer("46 / 47")));
  add("Kz52", ganzWenn("52", w.basis("52 / 53")));
  add("Kz53", betragWenn(w.steuer("52 / 53")));
  add("Kz61", betragWenn(w.steuer("61")));
  add("Kz62", betragWenn(w.steuer("62")));
  add("Kz66", betragWenn(w.steuer("66")));
  add("Kz67", betragWenn(w.steuer("67")));
  add("Kz81", ganzWenn("81", w.basis("81")));
  add("Kz83", betrag(w.zahllast));
  add("Kz86", ganzWenn("86", w.basis("86")));
  add("Kz89", ganzWenn("89", w.basis("89")));

  const d = opts.heute ?? new Date();
  const datum = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const l = opts.lieferant;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Anmeldungssteuern xmlns="http://finkonsens.de/elster/elsteranmeldung/ustva/v${jahr}" version="${jahr}">`,
    `  <Erstellungsdatum>${datum}</Erstellungsdatum>`,
    `  <DatenLieferant>`,
    `    <Name>${esc(l.name)}</Name>`,
    `    <Strasse>${esc(l.strasse)}</Strasse>`,
    `    <PLZ>${esc(l.plz)}</PLZ>`,
    `    <Ort>${esc(l.ort)}</Ort>`,
    `  </DatenLieferant>`,
    `  <Steuerfall>`,
    `    <Umsatzsteuervoranmeldung>`,
    `      <Jahr>${jahr}</Jahr>`,
    `      <Zeitraum>${mon}</Zeitraum>`,
    `      <Steuernummer>${opts.steuernummer}</Steuernummer>`,
    ...felder.map(([k, v]) => `      <${k}>${v}</${k}>`),
    `    </Umsatzsteuervoranmeldung>`,
    `  </Steuerfall>`,
    `</Anmeldungssteuern>`,
    ``,
  ].join("\n");
}
