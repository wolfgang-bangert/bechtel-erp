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

/** tags: [{key,value}] → { key: value } */
function flattenTags(tags: unknown): Record<string, string> {
  if (!Array.isArray(tags)) return {};
  const out: Record<string, string> = {};
  for (const t of tags as { key?: string; value?: string }[]) {
    if (t?.key && t.value != null && String(t.value).trim() !== "") out[t.key] = String(t.value);
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

  const summary = {
    dryRun,
    rollen: rollen.length,
    material: katalogRaw.length,
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

  // --- Material
  const material = katalogRaw.map((r) => ({
    xano_ref: String(r.id),
    name: s(r.name) ?? `Material ${r.id}`,
    name_kurz: s(r.name_kurz),
    beschreibung: s(r.beschreibung),
    rolle_id: r.material_rollen_id != null ? rolleByXano.get(String(r.material_rollen_id)) ?? null : null,
    attribute: flattenTags(r.tags),
    is_active: true,
  }));
  for (let i = 0; i < material.length; i += 100) {
    const { error } = await supabase
      .from("material")
      .upsert(material.slice(i, i + 100), { onConflict: "xano_ref" });
    if (error) throw new Error(`material: ${error.message}`);
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
