/**
 * onlineprinters-Auflösung für die Web-App (Button „neu auflösen").
 * Logik gespiegelt aus services/sync/src/opriResolve.ts — bei Änderungen beide
 * anpassen. Kandidat für ein gemeinsames Package, sobald es sich einschwingt.
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

function decodeFormat(text: string): string | null {
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

function applyOptionAttrs(
  attr: Record<string, unknown>,
  typ: string | null,
  wert: string | null,
  sku: string,
): void {
  const t = `${typ ?? ""} ${wert ?? ""}`.toLowerCase();
  const s = norm(sku);
  if (/gl[äa]nzend/.test(t)) attr.oberflaeche = "glänzend";
  else if (/matt/.test(t)) attr.oberflaeche = "matt";
  if (/ausrichtung|hoch-?\/?querformat/.test(t) || /XXQ/.test(s)) {
    if (/hochformat|portrait/.test(t) || /Q00/.test(s)) attr.ausrichtung = "Hochformat";
    else if (/querformat|landscape/.test(t) || /Q01/.test(s)) attr.ausrichtung = "Querformat";
  }
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
}

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
  produktionshinweis: string | null;
  zaehlt_zur_blockstaerke: boolean;
  seite: string | null;
  bedruckt: boolean | null;
  ungeloest?: string;
};
export type ResolveResult = {
  reference: string | null;
  stammartikel_id: string | null;
  gruppe: string | null;
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
  name: string;
  ebene: string;
  gruppe_id: string | null;
  stammartikel_id: string | null;
  option_match: string | null;
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
};
type Material = {
  id: string;
  name: string;
  name_kurz: string | null;
  rolle_id: string | null;
  attribute: Record<string, unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function mengeFormel(formel: string, auflage: number): number {
  const f = (formel || "auflage").toLowerCase().replace(/\s/g, "");
  if (f === "auflage" || f === "auflage*1") return auflage;
  if (f === "1") return 1;
  const m = f.match(/^auflage([+*])(\d+(?:\.\d+)?)$/);
  if (m) return m[1] === "+" ? auflage + Number(m[2]) : auflage * Number(m[2]);
  return auflage;
}

export async function resolvePortalOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient,
  portalOrderId: string,
): Promise<ResolveResult> {
  const { data: order, error } = await sb
    .from("portal_order")
    .select("id, external_reference, description, quantity, items:portal_order_item(sku, description)")
    .eq("id", portalOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) throw new Error("Auftrag nicht gefunden");

  const [skus, regeln, material, rollen, wire, grp, st, formate, vern, boegen] = await Promise.all([
    pagedAll<SkuRow>(
      sb,
      "opri_sku",
      "sku_norm, typ, stammartikel_id, gruppe_kuerzel, option_typ_name, wert_name, attribute",
    ),
    sb.from("opri_material_regel").select("*").eq("is_active", true).then((r) => (r.data ?? []) as Regel[]),
    sb
      .from("material")
      .select("id, name, name_kurz, rolle_id, attribute")
      .eq("is_active", true)
      .then((r) => (r.data ?? []) as Material[]),
    sb.from("material_rolle").select("id, name").then((r) => r.data ?? []),
    sb
      .from("wire_o_durchmesser")
      .select("blockstaerke_min, blockstaerke_max, teilung, durchmesser_zoll, durchmesser_mm")
      .then((r) => (r.data ?? []) as {
        blockstaerke_min: number;
        blockstaerke_max: number;
        teilung: string;
        durchmesser_zoll: string | null;
        durchmesser_mm: number | null;
      }[]),
    sb
      .from("opri_produkt_gruppe")
      .select("id, kuerzel, flux_template")
      .then((r) => r.data ?? []),
    sb.from("opri_stammartikel").select("id, flux_template").then((r) => r.data ?? []),
    sb
      .from("format")
      .select("id, code, name, breite_mm, hoehe_mm")
      .then((r) => (r.data ?? []) as { id: string; code: string; name: string; breite_mm: number | null; hoehe_mm: number | null }[]),
    sb
      .from("vernutzung")
      .select("format_id, druckbogen_id, nutzen, ist_standard")
      .then((r) => (r.data ?? []) as { format_id: string; druckbogen_id: string; nutzen: number; ist_standard: boolean }[]),
    sb
      .from("druckbogen")
      .select("id, code, is_default")
      .then((r) => (r.data ?? []) as { id: string; code: string; is_default: boolean }[]),
  ]);

  const fmtKey = (x: string) =>
    (x ?? "").toLowerCase().replace(/cm|mm/g, "").replace(/[\s×x,._-]/g, "");
  const nutzenFor = (fmtStr: string | null): { nutzen: number; bogen: string | null } | null => {
    if (!fmtStr) return null;
    const k = fmtKey(fmtStr);
    const f = formate.find(
      (x) => fmtKey(x.code) === k || fmtKey(x.name) === k || fmtKey(x.name).includes(k),
    );
    if (!f) return null;
    const rows = vern.filter((v) => v.format_id === f.id);
    if (!rows.length) return null;
    const chosen =
      rows.find((v) => v.ist_standard) ??
      rows.find((v) => boegen.find((b) => b.id === v.druckbogen_id)?.is_default) ??
      rows.reduce((a, b) => (b.nutzen > a.nutzen ? b : a));
    return {
      nutzen: chosen.nutzen || 1,
      bogen: boegen.find((b) => b.id === chosen.druckbogen_id)?.code ?? null,
    };
  };

  const skuByNorm = new Map<string, SkuRow>();
  for (const s of skus) {
    skuByNorm.set(s.sku_norm, s);
    if (s.typ === "option") skuByNorm.set(normZ(s.sku_norm), s);
  }
  const rolleName = new Map(rollen.map((r) => [r.id as string, r.name as string]));
  const gruppen = new Map(
    grp.map((g) => [g.kuerzel as string, { id: g.id as string, flux_template: g.flux_template as string | null }]),
  );
  const stammFlux = new Map(st.map((s) => [s.id as string, s.flux_template as string | null]));

  const auflage = Number(order.quantity) || 1;
  const ungeloest: string[] = [];
  const hinweise: string[] = [];
  let stammartikelId: string | null = null;
  let gruppeKuerzel: string | null = null;
  const attr: Record<string, unknown> = {};
  const optionen: { typ: string | null; wert: string | null; sku: string }[] = [];

  for (const it of (order.items ?? []) as { sku: string | null; description: string | null }[]) {
    if (!it.sku) continue;
    const hit = skuByNorm.get(norm(it.sku)) ?? skuByNorm.get(normZ(it.sku));
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

  const desc = `${order.description ?? ""} ${((order.items ?? []) as { description: string | null }[])
    .map((i) => i.description ?? "")
    .join(" ")}`;
  const gG = desc.match(/(\d+)\s*g\s*\/?\s*m²|(\d+)\s*gsm/i);
  if (!attr.grammatur_g && gG) attr.grammatur_g = Number(gG[1] ?? gG[2]);
  const bl = desc.match(/(\d+)\s*(?:sheets|Blatt)/i);
  if (!attr.blatt && bl) attr.blatt = Number(bl[1]);
  if (!attr.oberflaeche && /coated|gestrichen/i.test(desc)) attr.oberflaeche = "glänzend";
  if (!attr.format) attr.format = decodeFormat(desc);

  const grp0 = gruppeKuerzel ? gruppen.get(gruppeKuerzel) : undefined;
  const fluxTemplate =
    (stammartikelId ? stammFlux.get(stammartikelId) ?? null : null) ?? grp0?.flux_template ?? null;
  if (!fluxTemplate) hinweise.push("kein flux_template (Regel fehlt)");

  const matchRegel = (r: Regel): boolean => {
    if (r.ebene === "gruppe") return !!grp0 && r.gruppe_id === grp0.id;
    if (r.ebene === "stammartikel") return !!stammartikelId && r.stammartikel_id === stammartikelId;
    if (r.ebene === "option") {
      if (!r.option_match) return false;
      const needle = r.option_match.toLowerCase();
      return optionen.some(
        (o) => (o.typ ?? "").toLowerCase().includes(needle) || norm(o.sku).startsWith(norm(r.option_match!)),
      );
    }
    return false;
  };
  const applicable = regeln.filter(matchRegel).sort((a, b) => a.prio - b.prio);

  const findPapier = (): Material | null => {
    const g = nnum(attr.grammatur_g);
    const ober = String(attr.oberflaeche ?? "");
    const sorte = String(attr.sorte ?? "");
    return (
      material.find((m) => {
        const ma = m.attribute ?? {};
        if (g != null && nnum(ma.Grammatur_g) !== g) return false;
        if (sorte && String(ma.Sorte ?? "").toLowerCase() !== sorte.toLowerCase()) return false;
        if (ober) {
          const mo = String(ma.Oberfläche ?? "").toLowerCase();
          if (ober === "glänzend" && !mo.includes("glänz")) return false;
          if (ober === "matt" && !mo.includes("matt")) return false;
        }
        return true;
      }) ?? null
    );
  };

  const build = (r: Regel, mat: Material | null, note?: string): MaterialZeile => {
    const m = mengeFormel(r.mengen_formel, auflage);
    let nutzen: number | null = null;
    let netto_bogen: number | null = null;
    let druckbogen: string | null = null;
    let n2 = note;
    if (r.einheit === "bogen" || r.einheit === "blatt") {
      const v = nutzenFor(r.vernutzung_format || (attr.format as string | null));
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
      produktionshinweis: r.produktionshinweis,
      zaehlt_zur_blockstaerke: r.zaehlt_zur_blockstaerke,
      seite: r.seite,
      bedruckt: r.bedruckt,
      ...(n2 ? { ungeloest: n2 } : {}),
    };
  };

  const zeilen: MaterialZeile[] = [];
  const suppressed = new Set<string>();

  for (const r of applicable.filter((x) => x.herkunft !== "wire_o_blockstaerke")) {
    if (r.modus === "entfernen") {
      if (r.material_rolle) suppressed.add(r.material_rolle);
      continue;
    }
    let mat: Material | null = null;
    let note: string | undefined;
    if (r.herkunft === "katalog_fix") {
      mat = r.material_id ? material.find((m) => m.id === r.material_id) ?? null : null;
      if (!mat) note = "material_id nicht gesetzt/gefunden";
    } else if (r.herkunft === "aus_grammatur_oberflaeche") {
      mat = findPapier();
      if (!mat) note = `kein Papier für ${attr.grammatur_g ?? "?"}g / ${attr.oberflaeche ?? "?"}`;
    } else if (r.herkunft) {
      note = `Herkunft '${r.herkunft}' noch nicht implementiert`;
    }
    zeilen.push(build(r, mat, note));
  }

  const papier = findPapier();
  const papierDicke = nnum(papier?.attribute?.dicke_mm) ?? 0;
  const blatt = nnum(attr.blatt) ?? 0;
  let block = blatt * papierDicke;
  for (const z of zeilen) {
    if (!z.zaehlt_zur_blockstaerke) continue;
    const m = material.find((x) => x.name === z.material);
    block += nnum(m?.attribute?.dicke_mm) ?? 0;
  }
  block = Math.round(block * 100) / 100;

  for (const r of applicable.filter((x) => x.herkunft === "wire_o_blockstaerke")) {
    if (r.modus === "entfernen") continue;
    const w =
      block > 0
        ? wire.find(
            (x) => x.teilung === "3:1" && block >= x.blockstaerke_min && block <= x.blockstaerke_max,
          ) ?? null
        : null;
    let mat: Material | null = null;
    let note: string | undefined;
    if (w) {
      const farbe = String(attr.spiralfarbe ?? attr.farbe ?? "").toLowerCase();
      mat =
        material.find((m) => {
          const rn = rolleName.get(m.rolle_id ?? "") ?? "";
          if (!/Drahtbinder/i.test(rn)) return false;
          const zoll = String(m.attribute?.Durchmesser ?? "");
          const okZoll = w.durchmesser_zoll
            ? zoll.includes(w.durchmesser_zoll.trim().replace("1/4", "¼"))
            : true;
          const okFarbe = farbe ? m.name.toLowerCase().includes(farbe) : true;
          return okZoll && okFarbe;
        }) ?? null;
      if (!mat) note = `Draht ${w.durchmesser_zoll ?? w.durchmesser_mm} nicht im Katalog`;
    } else {
      note = block > 0 ? `keine Wire-O-Staffel für ${block} mm` : "Blockstärke = 0 (Blatt/Papier fehlt)";
    }
    const z = build(r, mat, note);
    z.produktionshinweis = z.produktionshinweis ?? `Blockstärke ${block} mm → ${w?.durchmesser_zoll ?? "?"}`;
    zeilen.push(z);
  }

  return {
    reference: order.external_reference,
    stammartikel_id: stammartikelId,
    gruppe: gruppeKuerzel,
    attribute: attr,
    optionen,
    blockstaerke_mm: block,
    flux_template: fluxTemplate,
    materialliste: zeilen.filter((z) => !(z.rolle && suppressed.has(z.rolle))),
    ungeloest,
    hinweise,
  };
}
