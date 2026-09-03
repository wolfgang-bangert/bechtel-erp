import { supabase } from "./supabase";
import { xanoTables, xanoTableRows } from "./xano";

type Options = { dryRun?: boolean };

const s = (v: unknown) => {
  const t = v == null ? "" : String(v).trim();
  return t === "" ? null : t;
};
const flt = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = flt(v);
  return n == null ? null : Math.round(n);
};

const PAPPAUFSTELLER_REF = "werk:pappaufsteller";
/** Platzhalter/leere Katalogzeilen: kein Name, kein Kurzname, oder "Material 38". */
const isPlaceholderRow = (r: Record<string, unknown>) => {
  const name = s(r.name);
  const kurz = s(r.name_kurz);
  if (!name && !kurz) return true;
  return !!name && /^material\s+\d+$/i.test(name.trim());
};

/**
 * Xano-Feld "Dicke_mikrometer" ist uneinheitlich: Papiere in Zehntel-mm
 * ("1,7" = 0,17 mm), Pappen als echte µm ("1450" = 1,45 mm). Auf mm normalisieren.
 */
function dickeInMm(raw: unknown): number | null {
  const v = flt(raw);
  if (v == null || v <= 0) return null;
  const mm = v >= 50 ? v / 1000 : v / 10;
  return Math.round(mm * 10000) / 10000;
}

/** tags: [{key,value}] → { key: value }, dabei Dicke auf dicke_mm normalisieren. */
function flattenTags(tags: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (Array.isArray(tags)) {
    for (const t of tags as { key?: string; value?: string }[]) {
      if (t?.key && t.value != null && String(t.value).trim() !== "") out[t.key] = String(t.value);
    }
  }
  if (out.Dicke_mikrometer != null) {
    const mm = dickeInMm(out.Dicke_mikrometer);
    if (mm != null) out.dicke_mm = mm;
    delete out.Dicke_mikrometer;
  }
  return out;
}

/**
 * Materialkatalog aus Xano übernehmen:
 *   material_rollen        → material_rolle
 *   material_katalog       → material   (tags flach als attribute)
 *   zz_diameterDoubleWire  → wire_o_durchmesser
 * Abgleich über xano_ref; "Xano gewinnt" bei den Stammfeldern.
 */
export async function importMaterial(opts: Options = {}) {
  const { dryRun = false } = opts;

  const tables = await xanoTables();
  const id = (name: string) => {
    const t = tables.find((x) => x.name === name);
    if (!t) throw new Error(`Xano-Tabelle '${name}' nicht gefunden`);
    return t.id;
  };

  const rollenRaw = await xanoTableRows<Record<string, unknown>>(id("material_rollen"));
  const katalogRaw = await xanoTableRows<Record<string, unknown>>(id("material_katalog"));
  const wireRaw = await xanoTableRows<Record<string, unknown>>(id("zz_diameterDoubleWire"));

  const rollen = rollenRaw.map((r) => ({
    xano_ref: String(r.id),
    name: s(r.name) ?? `Rolle ${r.id}`,
    sort: int(r.sort) ?? 100,
    is_active: r.aktiv !== false,
  }));
  // werk-eigene Rolle (nicht in Xano): Pappaufsteller
  rollen.push({ xano_ref: PAPPAUFSTELLER_REF, name: "Pappaufsteller", sort: 55, is_active: true });
  const wire = wireRaw.map((r) => ({
    xano_ref: String(r.id),
    blockstaerke_min: flt(r.Blockstaerke_Min) ?? 0,
    blockstaerke_max: flt(r.Blockstaerke_Max) ?? 0,
    teilung: s(r.Teilung) === "2:1" ? "2:1" : "3:1",
    durchmesser_zoll: s(r.Durchmesser_in_Zoll),
    durchmesser_mm: flt(r.Durchmesser_in_mm),
    bruch_ganzzahl: int(r.Bruch_Ganzzahl),
    bruch_oben: int(r.Bruch_oben),
    bruch_unten: int(r.Bruch_unten),
    bezeichnung: s(r.Durchmesser_Wire),
  }));

  // Platzhalter/leere Einträge ("Material 38" o.ä.) nicht übernehmen
  const skipRefs = new Set(
    katalogRaw.filter((r) => isPlaceholderRow(r)).map((r) => String(r.id)),
  );
  const keepKatalog = katalogRaw.filter((r) => !skipRefs.has(String(r.id)));

  const summary = {
    dryRun,
    rollen: rollen.length,
    material: keepKatalog.length,
    uebersprungen: skipRefs.size,
    wire_o: wire.length,
  };
  if (dryRun) return summary;

  // --- Rollen
  for (const r of rollen) {
    const { error } = await supabase
      .from("material_rolle")
      .upsert(r, { onConflict: "xano_ref" });
    if (error) throw new Error(`material_rolle: ${error.message}`);
  }
  const { data: rolleRows } = await supabase.from("material_rolle").select("id, xano_ref");
  const rolleByXano = new Map((rolleRows ?? []).map((x) => [x.xano_ref as string, x.id as string]));
  const pappaufstellerId = rolleByXano.get(PAPPAUFSTELLER_REF) ?? null;

  // --- Material
  const material = keepKatalog.map((r) => {
    const attribute = flattenTags(r.tags);
    // Tischaufsteller sind in Xano an einer falschen Rolle → Pappaufsteller
    const rolleId =
      attribute.Funktion === "Tischaufsteller" && pappaufstellerId
        ? pappaufstellerId
        : r.material_rollen_id != null
          ? rolleByXano.get(String(r.material_rollen_id)) ?? null
          : null;
    return {
      xano_ref: String(r.id),
      name: s(r.name) ?? `Material ${r.id}`,
      name_kurz: s(r.name_kurz),
      beschreibung: s(r.beschreibung),
      rolle_id: rolleId,
      attribute,
      is_active: true,
    };
  });
  for (let i = 0; i < material.length; i += 100) {
    const { error } = await supabase
      .from("material")
      .upsert(material.slice(i, i + 100), { onConflict: "xano_ref" });
    if (error) throw new Error(`material: ${error.message}`);
  }
  // übersprungene Platzhalter, die evtl. aus einem früheren Import stammen, entfernen
  if (skipRefs.size) {
    await supabase.from("material").delete().in("xano_ref", [...skipRefs]);
  }

  // --- Wire-O
  for (let i = 0; i < wire.length; i += 100) {
    const { error } = await supabase
      .from("wire_o_durchmesser")
      .upsert(wire.slice(i, i + 100), { onConflict: "xano_ref" });
    if (error) throw new Error(`wire_o_durchmesser: ${error.message}`);
  }

  return summary;
}
