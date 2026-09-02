import { fetchNinoxRecords, type NinoxRecord } from "./ninox";
import { supabase } from "./supabase";

type Options = { dryRun?: boolean };

const s = (v: unknown) => (v == null ? null : String(v).trim() || null);
const int = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
};
const flt = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const refNum = (v: unknown): number | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return x == null || x === "" ? null : Number(x);
};

/**
 * Ninox ZG "Vepackungen" -> packmittel, XG "Grundprodukt Kartoneinheiten" -> packregel.
 * produkt_tag = Grundprodukt-Bezeichnung (aus H), lose Textzuordnung — kein starrer Schlüssel.
 * Alles nur Startbestand: in werk frei editier- und ergänzbar.
 */
export async function importPackmittel(opts: Options = {}) {
  const { dryRun = false } = opts;

  // --- H Grundprodukt: id -> Bezeichnung
  const grundName = new Map<number, string>();
  await fetchNinoxRecords("H", async (rows: NinoxRecord[]) => {
    for (const r of rows) {
      const name = s(r.fields["Grundprodukt Bezeichnung"]);
      if (name) grundName.set(r.id, name);
    }
  });

  // --- ZG Vepackungen -> packmittel
  const packmittel: Record<string, unknown>[] = [];
  await fetchNinoxRecords("ZG", async (rows: NinoxRecord[]) => {
    for (const r of rows) {
      const f = r.fields;
      const bez = s(f["Bezeichnung"]) ?? s(f["Bechtel interne Bezeichnung"]) ?? `ZG-${r.id}`;
      packmittel.push({
        ninox_ref: `ZG:${r.id}`,
        bezeichnung: bez,
        interne_bezeichnung: s(f["Bechtel interne Bezeichnung"]),
        kategorie: s(f["Kategorie"]),
        laenge_mm: int(f["Länge"]),
        breite_mm: int(f["Breite"]),
        hoehe_mm: int(f["Höhe"]),
        leergewicht_kg: flt(f["Gewicht in kg"]) ?? 0,
        material: s(f["Material"]),
        fefco: null,
        volumen_m3: flt(f["Volumen"]),
        preis_kalk: flt(f["Preis für Kalkulation"]),
        bestellnummer: s(f["Bestellnummer beim Lieferant"]),
        lagerplatz: s(f["Lagerplatz"]),
        notiz: s(f["Beschreibung zum Karton"]),
        is_active: (s(f["Status"]) ?? "").toLowerCase() !== "inaktiv",
      });
    }
  });

  // --- XG Grundprodukt Kartoneinheiten -> packregel
  const regeln: {
    ninox_ref: string;
    produkt_tag: string | null;
    stueck_von: number;
    stueck_bis: number;
    zg_ref: number | null;
    spedition_erlaubt: boolean;
  }[] = [];
  await fetchNinoxRecords("XG", async (rows: NinoxRecord[]) => {
    for (const r of rows) {
      const f = r.fields;
      const bis = int(f["Stück bis"]);
      if (bis == null) continue;
      const gp = refNum(f["Grundprodukt"]);
      regeln.push({
        ninox_ref: `XG:${r.id}`,
        produkt_tag: gp != null ? grundName.get(gp) ?? null : null,
        stueck_von: int(f["Stück von"]) ?? 0,
        stueck_bis: bis,
        zg_ref: refNum(f["Vepackungen"]),
        spedition_erlaubt: Boolean(f["bei Speditionsversand und kleinere Päckchen erlaubt"]),
      });
    }
  });

  const summary = {
    dryRun,
    grundprodukte: grundName.size,
    packmittel: packmittel.length,
    packregeln: regeln.length,
    regeln_mit_tag: regeln.filter((x) => x.produkt_tag).length,
  };
  if (dryRun) return summary;

  // upsert packmittel
  for (let i = 0; i < packmittel.length; i += 200) {
    const { error } = await supabase
      .from("packmittel")
      .upsert(packmittel.slice(i, i + 200), { onConflict: "ninox_ref" });
    if (error) throw new Error(`packmittel: ${error.message}`);
  }

  // id-Map ZG-Ref -> packmittel.id
  const { data: pm } = await supabase.from("packmittel").select("id, ninox_ref");
  const pmByRef = new Map((pm ?? []).map((x) => [x.ninox_ref as string, x.id as string]));

  const regelRows = regeln.map((r) => ({
    ninox_ref: r.ninox_ref,
    produkt_tag: r.produkt_tag,
    stueck_von: r.stueck_von,
    stueck_bis: r.stueck_bis,
    packmittel_id: r.zg_ref != null ? pmByRef.get(`ZG:${r.zg_ref}`) ?? null : null,
    spedition_erlaubt: r.spedition_erlaubt,
    prio: 100,
    is_active: true,
  }));
  for (let i = 0; i < regelRows.length; i += 200) {
    const { error } = await supabase
      .from("packregel")
      .upsert(regelRows.slice(i, i + 200), { onConflict: "ninox_ref" });
    if (error) throw new Error(`packregel: ${error.message}`);
  }

  return { ...summary, regeln_mit_karton: regelRows.filter((r) => r.packmittel_id).length };
}
