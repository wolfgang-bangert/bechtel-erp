/**
 * onlineprinters-Auflösung: ein portal_order (SKUs + Freitext + PDF-Meta) →
 * `resolve_result` (Stammartikel/Gruppe, Attribute, Materialliste, Blockstärke,
 * Wire-O-Staffel, flux-Template).
 *
 * Eine Quelle für Web (`resolvePortalOrder`, Button „neu auflösen") und Worker
 * (`resolveOpri` in services/sync). Reine Logik in `resolveOne`; das Laden der
 * Referenzdaten (`loadResolveRefData` / `loadGruppenMaps`) nimmt einen
 * SupabaseClient und funktioniert mit Service-Role wie mit Session.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const norm = (s: string) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const normZ = (s: string) => {
  const k = norm(s);
  return k.startsWith("Z") ? k.replace(/X+$/, "") : k;
};
const nnum = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Format-Kürzel aus Freitext (A2..A6, DL, "A4 halb", "A5-Quadrat", "N x N cm"). */
export function decodeFormat(text: string): string | null {
  const cm = text.match(/(\d+[.,]?\d*)\s*[x×]\s*(\d+[.,]?\d*)\s*cm/i);
  if (cm) return `${cm[1].replace(".", ",")} × ${cm[2].replace(".", ",")} cm`;
  const halb = text.match(/\b(A[2-6])[\s-]*halb\b/i);
  if (halb) return `${halb[1].toUpperCase()} halb`;
  const quad = text.match(/\b(A[2-6])[\s-]*Quadrat\b/i);
  if (quad) return `${quad[1].toUpperCase()}-Quadrat`;
  const a = text.match(/\b(?:DIN[\s-]*)?(A[2-6])\b/i);
  if (a) return a[1].toUpperCase();
  if (/\bDL\b/.test(text)) return "DL";
  return null;
}

/** Optionswert → zusätzliche Attribute (Ausrichtung, Bindung/Hänger, Spiralfarbe, Cello …). */
export function applyOptionAttrs(
  attr: Record<string, unknown>,
  typ: string | null,
  wert: string | null,
  sku: string,
): void {
  const t = `${typ ?? ""} ${wert ?? ""}`.toLowerCase();
  const s = norm(sku);

  // Folienkaschierung / Cellophanierung: eigener Arbeitsschritt, NICHT die Papieroberfläche.
  // Ausschluss: „transparent film" (Deckblatt) und „art print/Bilderdruck … glossy" (Papiersorte).
  if (
    /lamination|laminier|kaschier|cellophan|zellophan|folienveredel/.test(t) &&
    !/transparent film|transparente folie|art print|bilderdruck/.test(t)
  ) {
    attr.cello = /matt/.test(t) ? "matt" : /gloss|gl[äa]nz/.test(t) ? "glanz" : (attr.cello ?? "matt");
    attr.cello_seiten = /both sides|beidseit|zweiseit|double/.test(t) ? 2 : 1;
  } else if (/\bfinish\b/.test(t) && /matt|gloss|gl[äa]nz/.test(t)) {
    attr.cello = /matt/.test(t) ? "matt" : "glanz";
  }

  // Spiral-Booklet-Komponenten (für die Preis-Kalkulation)
  if (/umschlag/.test(t)) {
    const g = t.match(/(\d{2,3})\s*g/);
    if (g) attr.umschlag_g = Number(g[1]);
  }
  if (/deckblatt/.test(t)) attr.deckblatt = true;
  if (/schlussblatt/.test(t)) {
    attr.schlussblatt = /grau/.test(t) ? "grau" : /wei[ßs]/.test(t) ? "weiss" : "folie";
  }

  if (/gl[äa]nzend/.test(t)) attr.oberflaeche = "glänzend";
  else if (/matt/.test(t)) attr.oberflaeche = "matt";

  if (/ausrichtung|hoch-?\/?querformat/.test(t) || /XXQ/.test(s)) {
    if (/hochformat|portrait/.test(t) || /Q00/.test(s)) attr.ausrichtung = "Hochformat";
    else if (/querformat|landscape/.test(t) || /Q01/.test(s)) attr.ausrichtung = "Querformat";
  }

  // Bindung: B07 = Wire-O, B09 = Wire-O + Kalenderaufhänger (kein eigener Hänger-SKU von onlineprinters)
  if (/wire-?o/.test(t) || /XX[AB]?B0/.test(s)) {
    attr.bindung = "Wire-O";
    if (/kalenderauf|calendar hanger|kalenderh[äa]nger/.test(t) || /B09/.test(s))
      attr.kalenderaufhaenger = true;
  }

  if (/spiral(en)?farbe/.test(t)) {
    if (/silber|silver/.test(t)) attr.spiralfarbe = "silber";
    else if (/schwarz|black/.test(t)) attr.spiralfarbe = "schwarz";
    else if (/wei[ßs]|white/.test(t)) attr.spiralfarbe = "weiß";
  }

  if (/bindung/.test(t) || /XXXXB[BK]/.test(s)) {
    if (/am kopf|top|BKO/i.test(t) || /BKO/.test(s)) attr.bindeseite = "Kopf";
    else if (/am fu[ßs]|bottom|BFU/i.test(t) || /BFU/.test(s)) attr.bindeseite = "Fuß";
    else if (/links|left|BLI/i.test(t) || /BLI/.test(s)) attr.bindeseite = "links";
    else if (/rechts|right|BRE/i.test(t) || /BRE/.test(s)) attr.bindeseite = "rechts";
  }
}

// --------------------------------------------------------------------- Typen
export type MaterialZeile = {
  regel: string;
  rolle: string | null;
  verwendung: string | null;
  material: string | null;
  material_kurz: string | null;
  grammatur: string | null;
  format: string | null;
  menge: number;
  einheit: string;
  nutzen: number | null;
  netto_bogen: number | null;
  druckbogen: string | null;
  durchmesser: string | null;
  teilung: string | null;
  schlaufen: number | null;
  schlaufen_gesamt: number | null;
  bindeseite: string | null;
  produktionshinweis: string | null;
  zaehlt_zur_blockstaerke: boolean;
  seite: string | null;
  bedruckt: boolean | null;
  cello: "keine" | "matt" | "glanz";
  cello_seiten: number;
  flux_product: string | null;
  flux_paper_type: string | null;
  flux_paper_type_back: string | null;
  flux_printer: string | null;
  flux_signature: string | null;
  flux_services: Record<string, unknown>;
  ungeloest?: string;
};

export type ResolveResult = {
  reference: string | null;
  stammartikel_id: string | null;
  gruppe: string | null;
  druckverfahren: string | null;
  attribute: Record<string, unknown>;
  optionen: { typ: string | null; wert: string | null; sku: string }[];
  blockstaerke_mm: number;
  flux_template: string | null;
  materialliste: MaterialZeile[];
  ungeloest: string[];
  hinweise: string[];
};

type SkuRow = {
  sku_norm: string;
  typ: "hauptartikel" | "option";
  stammartikel_id: string | null;
  gruppe_kuerzel: string | null;
  option_typ_name: string | null;
  wert_name: string | null;
  attribute: Record<string, unknown>;
};
type Regel = {
  id?: string;
  name: string;
  ebene: string;
  gruppe_id: string | null;
  stammartikel_id: string | null;
  option_match: string | null;
  bedingung?: Record<string, unknown>;
  modus: string;
  material_rolle: string | null;
  verwendung: string | null;
  herkunft: string | null;
  material_id: string | null;
  mengen_formel: string;
  grammatur: string | null;
  format: string | null;
  produktionshinweis: string | null;
  zaehlt_zur_blockstaerke: boolean;
  seite: string | null;
  bedruckt: boolean | null;
  prio: number;
  einheit: string;
  vernutzung_format: string | null;
  traegt_cello: boolean;
  flux_template_id: string | null;
};
type Material = {
  id: string;
  name: string;
  name_kurz: string | null;
  rolle_id: string | null;
  attribute: Record<string, unknown>;
  flux_paper_type: string | null;
};
type FluxTpl = {
  id: string;
  name: string;
  flux_product: string;
  signature: string | null;
  paper_type: string | null;
  paper_type_back: string | null;
  services: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
};
type FormatRow = {
  id: string;
  code: string;
  name: string;
  breite_mm: number | null;
  hoehe_mm: number | null;
};
type VernutzungRow = {
  format_id: string;
  druckbogen_id: string;
  nutzen: number;
  ist_standard: boolean;
};
type BogenRow = { id: string; code: string; is_default: boolean };
type StandbogenRow = {
  format: string;
  ausrichtung: "Hochformat" | "Querformat" | null;
  flux_signature: string;
  sortierung: number;
};
type WireRow = {
  blockstaerke_min: number;
  blockstaerke_max: number;
  teilung: string;
  durchmesser_zoll: string | null;
  durchmesser_mm: number | null;
};

export type GruppeInfo = {
  id: string;
  flux_template: string | null;
  flux_template_id: string | null;
  druckverfahren: string | null;
};
export type GruppenMaps = {
  gruppen: Map<string, GruppeInfo>;
  stammFlux: Map<string, string | null>;
  stammTplId: Map<string, string | null>;
};

export type OrderInput = {
  id: string;
  external_reference: string | null;
  description: string | null;
  quantity: number | null;
  pdf_meta?: { ausrichtung?: string } | null;
  items: { sku: string | null; description: string | null }[];
} & Partial<GruppenMaps>;

// ----------------------------------------------------------------- Laden
async function pagedAll<T>(sb: SupabaseClient, table: string, sel: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(sel).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadResolveRefData(sb: SupabaseClient) {
  const [skus, regeln, material, rollen, wire, formate, vern, boegen, fluxTpls, standboegen] =
    await Promise.all([
    pagedAll<SkuRow>(
      sb,
      "opri_sku",
      "sku_norm, typ, stammartikel_id, gruppe_kuerzel, option_typ_name, wert_name, attribute",
    ),
    sb.from("opri_material_regel").select("*").eq("is_active", true).then((r) => (r.data ?? []) as Regel[]),
    sb
      .from("material")
      .select("id, name, name_kurz, rolle_id, attribute, flux_paper_type")
      .eq("is_active", true)
      .then((r) => (r.data ?? []) as Material[]),
    sb.from("material_rolle").select("id, name").then((r) => r.data ?? []),
    sb
      .from("wire_o_durchmesser")
      .select("blockstaerke_min, blockstaerke_max, teilung, durchmesser_zoll, durchmesser_mm")
      .then((r) => (r.data ?? []) as WireRow[]),
    sb
      .from("format")
      .select("id, code, name, breite_mm, hoehe_mm")
      .then((r) => (r.data ?? []) as FormatRow[]),
    sb
      .from("vernutzung")
      .select("format_id, druckbogen_id, nutzen, ist_standard")
      .then((r) => (r.data ?? []) as VernutzungRow[]),
    sb
      .from("druckbogen")
      .select("id, code, is_default")
      .then((r) => (r.data ?? []) as BogenRow[]),
    sb
      .from("flux_template")
      .select("id, name, flux_product, signature, paper_type, paper_type_back, services, extra")
      .then((r) => (r.data ?? []) as FluxTpl[]),
    sb
      .from("standbogen")
      .select("format, ausrichtung, flux_signature, sortierung")
      .eq("aktiv", true)
      .then((r) => (r.data ?? []) as StandbogenRow[]),
  ]);

  const skuByNorm = new Map<string, SkuRow>();
  for (const s of skus) {
    skuByNorm.set(s.sku_norm, s);
    if (s.typ === "option") skuByNorm.set(normZ(s.sku_norm), s);
  }
  const rolleName = new Map(
    (rollen as { id: string; name: string }[]).map((r) => [r.id, r.name]),
  );
  return {
    skuByNorm,
    regeln,
    material,
    rolleName,
    wire,
    formate,
    vern,
    boegen,
    tplById: new Map<string, FluxTpl>(fluxTpls.map((t) => [t.id, t])),
    standboegen,
  };
}

export type RefData = Awaited<ReturnType<typeof loadResolveRefData>>;

export async function loadGruppenMaps(sb: SupabaseClient): Promise<GruppenMaps> {
  const [{ data: grp }, { data: st }] = await Promise.all([
    sb.from("opri_produkt_gruppe").select("id, kuerzel, flux_template, flux_template_id, druckverfahren"),
    sb.from("opri_stammartikel").select("id, flux_template, flux_template_id"),
  ]);
  const gruppen = new Map<string, GruppeInfo>(
    (grp ?? []).map((g) => [
      g.kuerzel as string,
      {
        id: g.id as string,
        flux_template: (g.flux_template as string | null) ?? null,
        flux_template_id: (g as { flux_template_id?: string | null }).flux_template_id ?? null,
        druckverfahren: (g as { druckverfahren?: string | null }).druckverfahren ?? null,
      },
    ]),
  );
  const stammFlux = new Map<string, string | null>(
    (st ?? []).map((s) => [s.id as string, (s.flux_template as string | null) ?? null]),
  );
  const stammTplId = new Map<string, string | null>(
    (st ?? []).map((s) => [s.id as string, (s as { flux_template_id?: string | null }).flux_template_id ?? null]),
  );
  return { gruppen, stammFlux, stammTplId };
}

// --------------------------------------------------------------- Hilfen
const fmtKey = (s: string) =>
  (s ?? "").toLowerCase().replace(/cm|mm/g, "").replace(/[\s×x,._-]/g, "");

function findFmt(ref: RefData, fmtStr: string | null): FormatRow | null {
  if (!fmtStr) return null;
  const k = fmtKey(fmtStr);
  return (
    ref.formate.find(
      (x) => fmtKey(x.code) === k || fmtKey(x.name) === k || fmtKey(x.name).includes(k),
    ) ?? null
  );
}

function nutzenFor(
  ref: RefData,
  fmtStr: string | null,
): { nutzen: number; bogen: string | null } | null {
  const f = findFmt(ref, fmtStr);
  if (!f) return null;
  const rows = ref.vern.filter((v) => v.format_id === f.id);
  if (!rows.length) return null;
  const chosen =
    rows.find((v) => v.ist_standard) ??
    rows.find((v) => ref.boegen.find((b) => b.id === v.druckbogen_id)?.is_default) ??
    rows.reduce((a, b) => (b.nutzen > a.nutzen ? b : a));
  return {
    nutzen: chosen.nutzen || 1,
    bogen: ref.boegen.find((b) => b.id === chosen.druckbogen_id)?.code ?? null,
  };
}

/** Standbogen (flux-Signature) über Format + Ausrichtung. Zeile mit passender
 *  Ausrichtung schlägt die „gilt für beide"-Zeile (ausrichtung = null). */
function matchStandbogen(
  ref: RefData,
  format: string | null,
  ausrichtung: string | null,
): string | null {
  if (!format) return null;
  const k = fmtKey(format);
  const cand = ref.standboegen
    .filter((s) => fmtKey(s.format) === k)
    .sort((a, b) => a.sortierung - b.sortierung);
  if (!cand.length) return null;
  return (
    cand.find((s) => s.ausrichtung && s.ausrichtung === ausrichtung)?.flux_signature ??
    cand.find((s) => !s.ausrichtung)?.flux_signature ??
    null
  );
}

function wireOFromBlock(ref: RefData, blockMm: number, teilung = "3:1"): WireRow | null {
  const inRange = (w: WireRow) => blockMm >= w.blockstaerke_min && blockMm <= w.blockstaerke_max;
  return ref.wire.find((w) => w.teilung === teilung && inRange(w)) ?? ref.wire.find(inRange) ?? null;
}

/** kleiner Arithmetik-Parser (+ - * /, Klammern) ohne eval */
function evalArith(s: string): number {
  let i = 0;
  const atom = (): number => {
    if (s[i] === "(") {
      i++;
      const v = add();
      i++;
      return v;
    }
    const j = i;
    while (i < s.length && /[\d.]/.test(s[i])) i++;
    return Number(s.slice(j, i));
  };
  const mul = (): number => {
    let v = atom();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const r = atom();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  return add();
}

/** Mengenformel mit Variablen: auflage, blatt, seiten. Ergebnis aufgerundet. */
function mengeFormel(formel: string, vars: Record<string, number>): number {
  let f = (formel || "auflage").toLowerCase().replace(/\s/g, "");
  for (const [k, v] of Object.entries(vars)) f = f.split(k).join(String(v || 0));
  if (!/^[\d.+\-*/()]+$/.test(f)) return vars.auflage ?? 1;
  try {
    const val = evalArith(f);
    return Number.isFinite(val) && val > 0 ? Math.ceil(val) : vars.auflage ?? 1;
  } catch {
    return vars.auflage ?? 1;
  }
}

// ------------------------------------------------------------- Auflösung
export function resolveOne(ref: RefData, order: OrderInput): ResolveResult {
  const auflage = Number(order.quantity) || 1;
  const ungeloest: string[] = [];
  const hinweise: string[] = [];

  let stammartikelId: string | null = null;
  let gruppeKuerzel: string | null = null;
  const attr: Record<string, unknown> = {};
  const optionen: { typ: string | null; wert: string | null; sku: string }[] = [];

  for (const it of order.items) {
    if (!it.sku) continue;
    const hit = ref.skuByNorm.get(norm(it.sku)) ?? ref.skuByNorm.get(normZ(it.sku));
    if (!hit) {
      ungeloest.push(it.sku);
      continue;
    }
    if (hit.typ === "hauptartikel") {
      stammartikelId = hit.stammartikel_id;
      gruppeKuerzel = hit.gruppe_kuerzel;
      Object.assign(attr, hit.attribute ?? {});
    } else {
      optionen.push({ typ: hit.option_typ_name, wert: hit.wert_name, sku: it.sku });
      applyOptionAttrs(attr, hit.option_typ_name, hit.wert_name, it.sku);
    }
  }

  // Attribute aus Freitext (description) nachziehen
  const desc = `${order.description ?? ""} ${order.items.map((i) => i.description ?? "").join(" ")}`;
  const gG = desc.match(/(\d+)\s*g\s*\/?\s*m²|(\d+)\s*gsm/i);
  if (!attr.grammatur_g && gG) attr.grammatur_g = Number(gG[1] ?? gG[2]);
  const bl = desc.match(/(\d+)\s*(?:sheets|Blatt)/i);
  if (!attr.blatt && bl) attr.blatt = Number(bl[1]);
  if (!attr.oberflaeche && /coated|gestrichen/i.test(desc)) attr.oberflaeche = "glänzend";
  if (!attr.format) attr.format = decodeFormat(desc);
  const seitenM = desc.match(/(\d+)\s*(?:pages|Seiten|seitig)/i);
  if (!attr.seiten && seitenM) attr.seiten = Number(seitenM[1]);
  if (!attr.blatt && attr.seiten) attr.blatt = Math.round(Number(attr.seiten) / 2);

  // Ausrichtung fehlt in den Portal-Attributen? → aus der PDF-Analyse
  if (!attr.ausrichtung) {
    const pm = order.pdf_meta;
    if (pm?.ausrichtung) {
      attr.ausrichtung = pm.ausrichtung;
      attr.ausrichtung_quelle = "pdf";
    }
  }

  // flux_template: Stammartikel überschreibt Gruppe
  const grp = gruppeKuerzel ? order.gruppen?.get(gruppeKuerzel) : undefined;
  const fluxStamm = stammartikelId ? order.stammFlux?.get(stammartikelId) ?? null : null;
  const fluxTemplate = fluxStamm ?? grp?.flux_template ?? null;
  if (!fluxTemplate) hinweise.push("kein flux_template (Regel fehlt)");

  const bedingungOk = (r: Regel): boolean => {
    const b = r.bedingung;
    if (!b || typeof b !== "object" || !Object.keys(b).length) return true;
    for (const [k, v] of Object.entries(b)) {
      if (k.endsWith("_min")) {
        const n = nnum(attr[k.slice(0, -4)]);
        if (n == null || n < Number(v)) return false;
      } else if (k.endsWith("_max")) {
        const n = nnum(attr[k.slice(0, -4)]);
        if (n == null || n > Number(v)) return false;
      } else if (String(attr[k] ?? "").toLowerCase() !== String(v).toLowerCase()) {
        return false;
      }
    }
    return true;
  };
  const ebeneOk = (r: Regel): boolean => {
    if (r.ebene === "gruppe") return !!grp && r.gruppe_id === grp.id;
    if (r.ebene === "stammartikel") return !!stammartikelId && r.stammartikel_id === stammartikelId;
    if (r.ebene === "option") {
      if (!r.option_match) return false;
      const needle = r.option_match.toLowerCase();
      return optionen.some(
        (o) =>
          (o.typ ?? "").toLowerCase().includes(needle) ||
          (o.wert ?? "").toLowerCase().includes(needle) ||
          norm(o.sku).startsWith(norm(r.option_match!)),
      );
    }
    return false;
  };
  const matchRegel = (r: Regel): boolean => ebeneOk(r) && bedingungOk(r);
  const applicable = ref.regeln.filter(matchRegel).sort((a, b) => a.prio - b.prio);

  const findPapier = (): Material | null => {
    const g = nnum(attr.grammatur_g);
    const ober = String(attr.oberflaeche ?? "");
    const sorte = String(attr.sorte ?? "");
    return (
      ref.material.find((m) => {
        const ma = m.attribute ?? {};
        if (g != null && nnum(ma.Grammatur_g) !== g) return false;
        if (sorte && String(ma.Sorte ?? "").toLowerCase() !== sorte.toLowerCase()) return false;
        // Offset/Recycling sind ungestrichen – ein „glänzend" stammt dann vom Umschlag,
        // nicht vom Inhaltspapier (siehe Spiral-Booklet). Oberfläche nur bei gestrichenen Sorten prüfen.
        if (ober && !/offset|recycling/i.test(sorte)) {
          const mo = String(ma.Oberfläche ?? "").toLowerCase();
          if (ober === "glänzend" && !mo.includes("glänz")) return false;
          if (ober === "matt" && !mo.includes("matt")) return false;
        }
        return true;
      }) ?? null
    );
  };

  const mVars = { auflage, blatt: nnum(attr.blatt) ?? 0, seiten: nnum(attr.seiten) ?? 0 };
  const grpTplId = grp?.flux_template_id ?? null;
  const stTplId = stammartikelId ? order.stammTplId?.get(stammartikelId) ?? null : null;

  const standbogenSig = matchStandbogen(
    ref,
    (attr.format as string | null) ?? null,
    (attr.ausrichtung as string | null) ?? null,
  );

  const build = (r: Regel, mat: Material | null, note?: string): MaterialZeile => {
    const m = mengeFormel(r.mengen_formel, mVars);
    const tplId = r.flux_template_id ?? stTplId ?? grpTplId;
    const tpl = tplId ? ref.tplById.get(tplId) ?? null : null;
    const flux_paper_type = tpl?.paper_type ?? mat?.flux_paper_type ?? null;
    let nutzen: number | null = null;
    let netto_bogen: number | null = null;
    let druckbogen: string | null = null;
    let n2 = note;
    if (r.einheit === "bogen" || r.einheit === "blatt") {
      const v = nutzenFor(ref, r.vernutzung_format || (attr.format as string | null));
      if (v) {
        nutzen = v.nutzen;
        druckbogen = v.bogen;
        netto_bogen = Math.ceil(m / Math.max(1, v.nutzen));
      } else if (!n2) {
        n2 = `keine Vernutzung für Format '${r.vernutzung_format || attr.format || "?"}'`;
      }
    }
    return {
      regel: r.name,
      rolle: r.material_rolle,
      verwendung: r.verwendung,
      material: mat?.name ?? null,
      material_kurz: mat?.name_kurz ?? null,
      grammatur: r.grammatur,
      format: r.format,
      menge: m,
      einheit: r.einheit ?? "stück",
      nutzen,
      netto_bogen,
      druckbogen,
      durchmesser: null,
      teilung: null,
      schlaufen: null,
      schlaufen_gesamt: null,
      bindeseite: null,
      produktionshinweis: r.produktionshinweis,
      zaehlt_zur_blockstaerke: r.zaehlt_zur_blockstaerke,
      seite: r.seite,
      bedruckt: r.bedruckt,
      cello: r.traegt_cello ? ((attr.cello as "matt" | "glanz" | undefined) ?? "matt") : "keine",
      cello_seiten: r.traegt_cello ? (nnum(attr.cello_seiten) ?? 1) : 1,
      flux_product: tpl?.flux_product ?? null,
      flux_paper_type,
      flux_paper_type_back: tpl?.paper_type_back ?? null,
      flux_printer: null, // Drucker wird erst beim Batch (zugeordnete Maschine) gesetzt
      // Standbogen: Format+Ausrichtung-Tabelle vor Template-Signature
      flux_signature: standbogenSig ?? tpl?.signature ?? null,
      flux_services: (tpl?.services as Record<string, unknown> | null) ?? {},
      ...(n2 ? { ungeloest: n2 } : {}),
    };
  };

  const zeilen: MaterialZeile[] = [];
  const suppressed = new Set<string>();

  // Pass 1: alles außer Wire-O (damit Blockstärke steht)
  for (const r of applicable.filter((x) => x.herkunft !== "wire_o_blockstaerke")) {
    if (r.modus === "entfernen") {
      if (r.material_rolle) suppressed.add(r.material_rolle);
      continue;
    }
    let mat: Material | null = null;
    let note: string | undefined;
    if (r.herkunft === "katalog_fix") {
      mat = r.material_id ? ref.material.find((m) => m.id === r.material_id) ?? null : null;
      if (!mat) note = "material_id nicht gesetzt/gefunden";
    } else if (r.herkunft === "aus_grammatur_oberflaeche") {
      mat = findPapier();
      if (!mat) note = `kein Papier für ${attr.grammatur_g ?? "?"}g / ${attr.oberflaeche ?? "?"}`;
    } else if (r.herkunft === "aus_format") {
      const want = fmtKey(((attr.format as string | null) ?? "").toString());
      mat =
        (want &&
          ref.material.find((m) => {
            if (r.material_rolle && ref.rolleName.get(m.rolle_id ?? "") !== r.material_rolle) return false;
            const mf = (m.attribute?.Format ?? m.attribute?.format) as string | undefined;
            return !!mf && fmtKey(mf.toString()) === want;
          })) ||
        null;
      if (!mat) note = `kein ${r.material_rolle ?? "Material"} für Format '${attr.format ?? "?"}'`;
    } else if (r.herkunft === "aus_farbe_text") {
      const want = String(attr.farbe ?? "").toLowerCase().trim();
      mat =
        (want &&
          ref.material.find((m) => {
            if (r.material_rolle && ref.rolleName.get(m.rolle_id ?? "") !== r.material_rolle) return false;
            const mf = String(m.attribute?.Farbe ?? m.attribute?.farbe ?? "").toLowerCase();
            return !!mf && mf === want;
          })) ||
        null;
      if (!mat) note = `kein ${r.material_rolle ?? "Material"} für Farbe '${attr.farbe ?? "?"}'`;
    } else if (r.herkunft) {
      note = `Herkunft '${r.herkunft}' noch nicht implementiert`;
    }
    zeilen.push(build(r, mat, note));
  }

  // Blockstärke pro Exemplar = Σ (Blatt-pro-Exemplar × Materialdicke) über Zeilen mit Flag.
  const auflDiv = Math.max(1, auflage);
  let block = 0;
  for (const z of zeilen) {
    if (!z.zaehlt_zur_blockstaerke) continue;
    const m = ref.material.find((x) => x.name === z.material);
    const d = nnum(m?.attribute?.dicke_mm) ?? 0;
    const proExpl =
      z.einheit === "bogen" || z.einheit === "blatt" ? (z.menge > 0 ? z.menge / auflDiv : 0) : 1;
    block += d * proExpl;
  }
  if (block === 0) {
    const papier = findPapier();
    block = (nnum(attr.blatt) ?? 0) * (nnum(papier?.attribute?.dicke_mm) ?? 0);
  }
  block = Math.round(block * 100) / 100;

  // Pass 2: Wire-O
  for (const r of applicable.filter((x) => x.herkunft === "wire_o_blockstaerke")) {
    if (r.modus === "entfernen") continue;
    const w = block > 0 ? wireOFromBlock(ref, block) : null;
    let mat: Material | null = null;
    let note: string | undefined;
    if (w) {
      const farbe = String(attr.spiralfarbe ?? attr.farbe ?? "").toLowerCase();
      mat =
        ref.material.find((m) => {
          const rn = ref.rolleName.get(m.rolle_id ?? "") ?? "";
          if (!/Drahtbinder/i.test(rn)) return false;
          const zoll = String(m.attribute?.Durchmesser ?? "");
          const okZoll = w.durchmesser_zoll
            ? zoll.includes(w.durchmesser_zoll.trim().replace("1/4", "¼"))
            : true;
          const okFarbe = farbe ? m.name.toLowerCase().includes(farbe) : true;
          return okZoll && okFarbe;
        }) ?? null;
      if (!mat) note = `Draht ${w.durchmesser_zoll ?? w.durchmesser_mm}mm nicht im Katalog`;
    } else {
      note = block > 0 ? `keine Wire-O-Staffel für ${block} mm` : "Blockstärke = 0 (Blatt/Papier fehlt)";
    }
    const z = build(r, mat, note);
    if (w) {
      z.durchmesser =
        `${(w.durchmesser_zoll ?? "").trim()}${w.durchmesser_mm ? ` (${w.durchmesser_mm} mm)` : ""}`.trim() ||
        null;
      z.teilung = w.teilung;
      // Bindekante: Kopf/Fuß = kurze Kante, links/rechts = lange Kante (Hochformat-Konvention);
      // bei Querformat getauscht.
      const f = findFmt(ref, (attr.format as string | null) ?? null);
      if (f && f.breite_mm && f.hoehe_mm) {
        let kurz = Math.min(f.breite_mm, f.hoehe_mm);
        let lang = Math.max(f.breite_mm, f.hoehe_mm);
        if (String(attr.ausrichtung) === "Querformat") [kurz, lang] = [lang, kurz];
        const seite = String(attr.bindeseite ?? "Kopf");
        const kante = /links|rechts/i.test(seite) ? lang : kurz;
        const pitch = w.teilung === "2:1" ? 25.4 / 2 : 25.4 / 3;
        const haenger = attr.kalenderaufhaenger === true;
        const proStk = Math.max(0, Math.round(kante / pitch) - (haenger ? 3 : 0));
        z.schlaufen = proStk;
        z.schlaufen_gesamt = proStk * auflage;
        z.bindeseite = seite;
        z.produktionshinweis =
          z.produktionshinweis ??
          `Blockstärke ${block} mm → ${z.durchmesser} ${w.teilung} · ${proStk} Schlaufen/Expl.` +
            `${haenger ? " (−3 für Kalenderaufhänger)" : ""} · ${z.schlaufen_gesamt} gesamt` +
            ` (Bindeseite ${seite}, ${kante} mm)`;
      }
    }
    z.produktionshinweis = z.produktionshinweis ?? `Blockstärke ${block} mm → ${w?.durchmesser_zoll ?? "?"}`;
    zeilen.push(z);
  }

  return {
    reference: order.external_reference,
    stammartikel_id: stammartikelId,
    gruppe: gruppeKuerzel,
    druckverfahren: grp?.druckverfahren ?? null,
    attribute: attr,
    optionen,
    blockstaerke_mm: block,
    flux_template: fluxTemplate,
    materialliste: zeilen.filter((z) => !(z.rolle && suppressed.has(z.rolle))),
    ungeloest,
    hinweise,
  };
}

const ORDER_SELECT =
  "id, external_reference, description, quantity, pdf_meta, items:portal_order_item(sku, description)";

/** Einen Auftrag laden + auflösen (Web-Button „neu auflösen"). Schreibt NICHT zurück. */
export async function resolvePortalOrder(
  sb: SupabaseClient,
  portalOrderId: string,
): Promise<ResolveResult> {
  const { data: order, error } = await sb
    .from("portal_order")
    .select(ORDER_SELECT)
    .eq("id", portalOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) throw new Error("Auftrag nicht gefunden");

  const [ref, maps] = await Promise.all([loadResolveRefData(sb), loadGruppenMaps(sb)]);
  return resolveOne(ref, {
    id: order.id as string,
    external_reference: (order.external_reference as string | null) ?? null,
    description: (order.description as string | null) ?? null,
    quantity: (order.quantity as number | null) ?? null,
    pdf_meta: (order as { pdf_meta?: { ausrichtung?: string } | null }).pdf_meta ?? null,
    items: ((order.items ?? []) as { sku: string | null; description: string | null }[]),
    ...maps,
  });
}

export { ORDER_SELECT as PORTAL_ORDER_RESOLVE_SELECT };
