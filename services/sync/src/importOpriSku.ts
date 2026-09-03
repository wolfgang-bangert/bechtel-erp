import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { supabase } from "./supabase";

const svc = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const PY = svc(".fints-venv/bin/python");
const SCRIPT = svc("py/sortiment_dump.py");
const XLSX = root("imports/online-printers/Sortiment_Bechtel_Gesamt.xlsx");

type Options = { dryRun?: boolean };
type Row = { sheet: string; h4: string | null; h5: string | null; h6: string | null; node: string | null; name: string | null };

const norm = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const isOpt = (s: string | null) => !!s && /^Z/i.test(s);

/** Attribute aus dem Artikel-Beschreibungstext ableiten (best effort). */
function decode(text: string): Record<string, string | number> {
  const a: Record<string, string | number> = {};
  const g = text.match(/(\d+)\s*g\s*\/?\s*m²/i);
  if (g) a.grammatur_g = Number(g[1]);
  const blatt = text.match(/(\d+)[\s-]*Blatt/i);
  if (blatt) a.blatt = Number(blatt[1]);
  const seiten = text.match(/(\d+)[\s-]*(?:seitig|pages|Seiten)/i);
  if (seiten) a.seiten = Number(seiten[1]);
  // Booklet: 1 Blatt = 2 Seiten
  if (a.seiten != null && a.blatt == null) a.blatt = Math.round(Number(a.seiten) / 2);
  if (/Offset/i.test(text)) a.sorte = "Offset";
  else if (/Recycling/i.test(text)) a.sorte = "Recycling";
  else if (/Multiloft/i.test(text)) a.sorte = "Multiloft";
  else if (/Bilderdruck/i.test(text)) a.sorte = "Bilderdruck";
  const fbg = text.match(/([14]\/[04])[\s-]*(?:farb|fbg|farbig)/i);
  if (fbg) a.farbigkeit = fbg[1];
  const farbe = text.match(
    /\b(gelb|blau|t[üu]rkis|hellgr[üu]n|dunkelgr[üu]n|schwarz|magenta|rot|rosa|violett|orange|wei[ßs]|silber)\b/i,
  );
  if (farbe) a.farbe = farbe[1].toLowerCase();
  return a;
}

/**
 * Sortiment_Bechtel_Gesamt.xlsx → opri_produkt_gruppe / opri_stammartikel / opri_sku.
 * Abgleich über kuerzel bzw. sku_norm (Reimport-sicher).
 */
export async function importOpriSku(opts: Options = {}) {
  const { dryRun = false } = opts;
  if (!existsSync(PY)) throw new Error(`Python-venv fehlt (${PY})`);
  if (!existsSync(XLSX)) throw new Error(`Excel fehlt: ${XLSX}`);

  const res = spawnSync(PY, [SCRIPT, XLSX], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`sortiment_dump.py: ${res.stderr?.slice(0, 300)}`);
  const rows = JSON.parse(res.stdout) as Row[];

  const gruppen = new Map<string, { kuerzel: string; name: string; sheet: string }>();
  const stamm: { sku: string; sku_norm: string; name: string; gruppe: string }[] = [];
  const skus: {
    sku: string;
    sku_norm: string;
    typ: "hauptartikel" | "option";
    stamm_sku: string | null;
    gruppe_kuerzel: string | null;
    option_typ_sku: string | null;
    option_typ_name: string | null;
    wert_name: string | null;
    bezeichnung: string | null;
    attribute: Record<string, string | number>;
    sheet: string;
  }[] = [];

  let curGruppe: string | null = null;
  let curStamm: string | null = null;
  let curOptTyp: { sku: string; name: string } | null = null;

  for (const r of rows) {
    const name = r.name ?? "";
    if (r.h4 && (r.node ?? "").toLowerCase().includes("artikelhierarchie")) {
      curGruppe = r.h4;
      curStamm = null;
      curOptTyp = null;
      if (!gruppen.has(r.h4)) gruppen.set(r.h4, { kuerzel: r.h4, name, sheet: r.sheet });
      continue;
    }
    if (r.h5 && !r.h6) {
      if (isOpt(r.h5)) {
        curOptTyp = { sku: r.h5, name };
      } else {
        curStamm = r.h5;
        curOptTyp = null;
        stamm.push({ sku: r.h5, sku_norm: norm(r.h5), name, gruppe: curGruppe ?? r.h4 ?? "?" });
      }
      continue;
    }
    if (r.h6) {
      if (isOpt(r.h6)) {
        const typSku = curOptTyp?.sku ?? r.h6.slice(0, 8);
        skus.push({
          sku: r.h6,
          sku_norm: norm(r.h6),
          typ: "option",
          stamm_sku: null,
          gruppe_kuerzel: curGruppe,
          option_typ_sku: typSku,
          option_typ_name: curOptTyp?.name ?? null,
          wert_name: name,
          bezeichnung: name,
          attribute: {},
          sheet: r.sheet,
        });
      } else {
        skus.push({
          sku: r.h6,
          sku_norm: norm(r.h6),
          typ: "hauptartikel",
          stamm_sku: curStamm,
          gruppe_kuerzel: curGruppe,
          option_typ_sku: null,
          option_typ_name: null,
          wert_name: null,
          bezeichnung: name,
          attribute: decode(name),
          sheet: r.sheet,
        });
      }
    }
  }

  // Duplikate über sku_norm zusammenfassen (erste Definition gewinnt)
  const seenS = new Set<string>();
  const stammU = stamm.filter((x) => (seenS.has(x.sku_norm) ? false : seenS.add(x.sku_norm)));
  const seenK = new Set<string>();
  const skusU = skus.filter((x) => (seenK.has(x.sku_norm) ? false : seenK.add(x.sku_norm)));

  const summary = {
    dryRun,
    gruppen: gruppen.size,
    stammartikel: stammU.length,
    sku_hauptartikel: skusU.filter((x) => x.typ === "hauptartikel").length,
    sku_option: skusU.filter((x) => x.typ === "option").length,
  };
  if (dryRun) return summary;

  // --- Gruppen
  for (const gr of gruppen.values()) {
    const { error } = await supabase
      .from("opri_produkt_gruppe")
      .upsert({ kuerzel: gr.kuerzel, name: gr.name }, { onConflict: "kuerzel" });
    if (error) throw new Error(`opri_produkt_gruppe: ${error.message}`);
  }
  const { data: grRows } = await supabase.from("opri_produkt_gruppe").select("id, kuerzel");
  const grId = new Map((grRows ?? []).map((g) => [g.kuerzel as string, g.id as string]));

  // --- Stammartikel
  for (let i = 0; i < stammU.length; i += 200) {
    const batch = stammU.slice(i, i + 200).map((x) => ({
      sku: x.sku,
      sku_norm: x.sku_norm,
      name: x.name,
      gruppe_id: grId.get(x.gruppe) ?? null,
    }));
    const { error } = await supabase.from("opri_stammartikel").upsert(batch, { onConflict: "sku_norm" });
    if (error) throw new Error(`opri_stammartikel: ${error.message}`);
  }
  const { data: stRows } = await supabase.from("opri_stammartikel").select("id, sku_norm");
  const stId = new Map((stRows ?? []).map((s) => [s.sku_norm as string, s.id as string]));

  // --- SKUs
  for (let i = 0; i < skusU.length; i += 200) {
    const batch = skusU.slice(i, i + 200).map((x) => ({
      sku: x.sku,
      sku_norm: x.sku_norm,
      typ: x.typ,
      stammartikel_id: x.stamm_sku ? stId.get(norm(x.stamm_sku)) ?? null : null,
      gruppe_kuerzel: x.gruppe_kuerzel,
      option_typ_sku: x.option_typ_sku,
      option_typ_name: x.option_typ_name,
      wert_name: x.wert_name,
      bezeichnung: x.bezeichnung,
      attribute: x.attribute,
      sheet: x.sheet,
    }));
    const { error } = await supabase.from("opri_sku").upsert(batch, { onConflict: "sku_norm" });
    if (error) throw new Error(`opri_sku: ${error.message}`);
  }

  return summary;
}
