import { supabase } from "./supabase";

type Options = { ref?: string; all?: boolean; dryRun?: boolean };

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

type SkuRow = {
  sku_norm: string;
  typ: "hauptartikel" | "option";
  stammartikel_id: string | null;
  gruppe_kuerzel: string | null;
  option_typ_name: string | null;
  option_typ_sku: string | null;
  wert_name: string | null;
  bezeichnung: string | null;
  attribute: Record<string, unknown>;
};
type Regel = {
  id: string;
  name: string;
  ebene: string;
  gruppe_id: string | null;
  stammartikel_id: string | null;
  option_match: string | null;
  bedingung: Record<string, unknown>;
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
};
type Material = {
  id: string;
  name: string;
  name_kurz: string | null;
  rolle_id: string | null;
  attribute: Record<string, unknown>;
};

async function allRows<T>(table: string, sel: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(sel).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadRefData() {
  const [skus, { data: regeln }, { data: material }, { data: rollen }, { data: wire }] =
    await Promise.all([
      allRows<SkuRow>(
        "opri_sku",
        "sku_norm, typ, stammartikel_id, gruppe_kuerzel, option_typ_name, option_typ_sku, wert_name, bezeichnung, attribute",
      ),
      supabase.from("opri_material_regel").select("*").eq("is_active", true),
      supabase.from("material").select("id, name, name_kurz, rolle_id, attribute").eq("is_active", true),
      supabase.from("material_rolle").select("id, name"),
      supabase
        .from("wire_o_durchmesser")
        .select("blockstaerke_min, blockstaerke_max, teilung, durchmesser_zoll, durchmesser_mm"),
    ]);
  const skuByNorm = new Map<string, SkuRow>();
  for (const s of skus) {
    skuByNorm.set(s.sku_norm, s);
    if (s.typ === "option") skuByNorm.set(normZ(s.sku_norm), s); // toleranter Options-Key
  }
  const rolleName = new Map((rollen ?? []).map((r) => [r.id as string, r.name as string]));
  return {
    skuByNorm,
    regeln: (regeln ?? []) as Regel[],
    material: (material ?? []) as Material[],
    rolleName,
    wire: (wire ?? []) as {
      blockstaerke_min: number;
      blockstaerke_max: number;
      teilung: string;
      durchmesser_zoll: string | null;
      durchmesser_mm: number | null;
    }[],
  };
}

type Ref = Awaited<ReturnType<typeof loadRefData>>;

function wireOFromBlock(ref: Ref, blockMm: number, teilung = "3:1") {
  return (
    ref.wire.find(
      (w) => w.teilung === teilung && blockMm >= w.blockstaerke_min && blockMm <= w.blockstaerke_max,
    ) ?? null
  );
}

function menge(formel: string, auflage: number): number {
  const f = (formel || "auflage").toLowerCase().replace(/\s/g, "");
  if (f === "auflage" || f === "auflage*1") return auflage;
  if (f === "1") return 1;
  const m = f.match(/^auflage([+*])(\d+(?:\.\d+)?)$/);
  if (m) return m[1] === "+" ? auflage + Number(m[2]) : auflage * Number(m[2]);
  return auflage;
}

function resolveOne(
  ref: Ref,
  order: {
    id: string;
    external_reference: string | null;
    description: string | null;
    quantity: number | null;
    items: { sku: string | null; description: string | null }[];
    gruppen?: Map<string, { id: string; flux_template: string | null; druckverfahren: string | null }>;
    stammFlux?: Map<string, string | null>;
  },
) {
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
      // Oberfläche / Farbe aus Optionstext ziehen
      const t = `${hit.option_typ_name ?? ""} ${hit.wert_name ?? ""}`.toLowerCase();
      if (/gl[äa]nzend/.test(t)) attr.oberflaeche = "glänzend";
      else if (/matt/.test(t)) attr.oberflaeche = "matt";
      if (/wire-?o/.test(t)) attr.bindung = "Wire-O";
    }
  }

  // Attribute aus Freitext (description) nachziehen
  const desc = `${order.description ?? ""} ${order.items.map((i) => i.description ?? "").join(" ")}`;
  const gG = desc.match(/(\d+)\s*g\s*\/?\s*m²|(\d+)\s*gsm/i);
  if (!attr.grammatur_g && gG) attr.grammatur_g = Number(gG[1] ?? gG[2]);
  const bl = desc.match(/(\d+)\s*(?:sheets|Blatt)/i);
  if (!attr.blatt && bl) attr.blatt = Number(bl[1]);
  if (!attr.oberflaeche && /coated|gestrichen/i.test(desc)) attr.oberflaeche = "glänzend";

  // flux_template: Stammartikel überschreibt Gruppe
  const grp = gruppeKuerzel ? order.gruppen?.get(gruppeKuerzel) : undefined;
  const fluxStamm = stammartikelId ? order.stammFlux?.get(stammartikelId) ?? null : null;
  const fluxTemplate = fluxStamm ?? grp?.flux_template ?? null;
  if (!fluxTemplate) hinweise.push("kein flux_template (Regel fehlt)");

  // --- Materialregeln anwenden
  const matchRegel = (r: Regel): boolean => {
    if (r.ebene === "gruppe") return !!grp && r.gruppe_id === grp.id;
    if (r.ebene === "stammartikel") return !!stammartikelId && r.stammartikel_id === stammartikelId;
    if (r.ebene === "option") {
      if (!r.option_match) return false;
      const needle = r.option_match.toLowerCase();
      return optionen.some(
        (o) =>
          (o.typ ?? "").toLowerCase().includes(needle) ||
          norm(o.sku).startsWith(norm(r.option_match!)),
      );
    }
    return false;
  };

  const applicable = ref.regeln.filter(matchRegel).sort((a, b) => a.prio - b.prio);

  type Zeile = {
    regel: string;
    rolle: string | null;
    verwendung: string | null;
    material: string | null;
    material_kurz: string | null;
    grammatur: string | null;
    format: string | null;
    menge: number;
    produktionshinweis: string | null;
    zaehlt_zur_blockstaerke: boolean;
    seite: string | null;
    bedruckt: boolean | null;
    ungeloest?: string;
  };
  const zeilen: Zeile[] = [];
  const suppressed = new Set<string>();

  const findPapier = (): Material | null => {
    const g = nnum(attr.grammatur_g);
    const ober = String(attr.oberflaeche ?? "");
    const sorte = String(attr.sorte ?? "");
    const cand = ref.material.filter((m) => {
      const ma = m.attribute ?? {};
      if (g != null && nnum(ma.Grammatur_g) !== g) return false;
      if (sorte && String(ma.Sorte ?? "").toLowerCase() !== sorte.toLowerCase()) return false;
      if (ober) {
        const mo = String(ma.Oberfläche ?? "").toLowerCase();
        if (ober === "glänzend" && !mo.includes("glänz")) return false;
        if (ober === "matt" && !mo.includes("matt")) return false;
      }
      return true;
    });
    return cand[0] ?? null;
  };

  const build = (r: Regel, mat: Material | null, note?: string): Zeile => ({
    regel: r.name,
    rolle: r.material_rolle,
    verwendung: r.verwendung,
    material: mat?.name ?? null,
    material_kurz: mat?.name_kurz ?? null,
    grammatur: r.grammatur,
    format: r.format,
    menge: menge(r.mengen_formel, auflage),
    produktionshinweis: r.produktionshinweis,
    zaehlt_zur_blockstaerke: r.zaehlt_zur_blockstaerke,
    seite: r.seite,
    bedruckt: r.bedruckt,
    ...(note ? { ungeloest: note } : {}),
  });

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
    } else if (r.herkunft) {
      note = `Herkunft '${r.herkunft}' noch nicht implementiert`;
    }
    zeilen.push(build(r, mat, note));
  }

  // Blockstärke = Σ (Blatt × Papierdicke) + Zusatzmaterialien mit Flag
  const papier = findPapier();
  const papierDicke = nnum(papier?.attribute?.dicke_mm) ?? 0;
  const blatt = nnum(attr.blatt) ?? 0;
  let block = blatt * papierDicke;
  for (const z of zeilen) {
    if (!z.zaehlt_zur_blockstaerke) continue;
    const m = ref.material.find((x) => x.name === z.material);
    block += nnum(m?.attribute?.dicke_mm) ?? 0;
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
          const okZoll = w.durchmesser_zoll ? zoll.includes(w.durchmesser_zoll.trim().replace("1/4", "¼")) : true;
          const okFarbe = farbe ? m.name.toLowerCase().includes(farbe) : true;
          return okZoll && okFarbe;
        }) ?? null;
      if (!mat) note = `Draht ${w.durchmesser_zoll ?? w.durchmesser_mm}mm nicht im Katalog`;
    } else {
      note = block > 0 ? `keine Wire-O-Staffel für ${block} mm` : "Blockstärke = 0 (Blatt/Papier fehlt)";
    }
    const z = build(r, mat, note);
    z.produktionshinweis = z.produktionshinweis ?? `Blockstärke ${block} mm → ${w?.durchmesser_zoll ?? "?"}`;
    zeilen.push(z);
  }

  const materialliste = zeilen.filter((z) => !(z.rolle && suppressed.has(z.rolle)));

  return {
    reference: order.external_reference,
    stammartikel_id: stammartikelId,
    gruppe: gruppeKuerzel,
    attribute: attr,
    optionen,
    blockstaerke_mm: block,
    flux_template: fluxTemplate,
    materialliste,
    ungeloest,
    hinweise,
  };
}

export async function resolveOpri(opts: Options = {}) {
  const { ref, all, dryRun = false } = opts;
  const refData = await loadRefData();

  let q = supabase
    .from("portal_order")
    .select("id, external_reference, description, quantity, items:portal_order_item(sku, description)");
  if (ref) q = q.eq("external_reference", ref);
  else if (!all) q = q.order("received_at", { ascending: false }).limit(20);
  const { data: orders, error } = await q;
  if (error) throw new Error(error.message);

  const { data: grp } = await supabase
    .from("opri_produkt_gruppe")
    .select("id, kuerzel, flux_template, druckverfahren");
  const gruppen = new Map(
    (grp ?? []).map((g) => [
      g.kuerzel as string,
      { id: g.id as string, flux_template: g.flux_template as string | null, druckverfahren: g.druckverfahren as string | null },
    ]),
  );
  const { data: st } = await supabase.from("opri_stammartikel").select("id, flux_template");
  const stammFlux = new Map((st ?? []).map((s) => [s.id as string, s.flux_template as string | null]));

  const results = [];
  for (const o of orders ?? []) {
    const r = resolveOne(refData, {
      id: o.id,
      external_reference: o.external_reference,
      description: o.description,
      quantity: o.quantity,
      items: (o.items ?? []) as { sku: string | null; description: string | null }[],
      gruppen,
      stammFlux,
    });
    results.push(r);
    if (!dryRun) {
      await supabase
        .from("portal_order")
        .update({ resolve_result: r, resolved_at: new Date().toISOString() })
        .eq("id", o.id);
    }
  }

  const geloest = results.filter((r) => r.stammartikel_id).length;
  return {
    dryRun,
    aufträge: results.length,
    mit_stammartikel: geloest,
    ohne_zuordnung: results.length - geloest,
    ungelöste_skus: [...new Set(results.flatMap((r) => r.ungeloest))].slice(0, 40),
    beispiel: results[0] ?? null,
  };
}
