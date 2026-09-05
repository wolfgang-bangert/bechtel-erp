import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { supabase } from "./supabase";

const svc = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const PY = svc(".fints-venv/bin/python");
const SCRIPT = svc("py/preise_dump.py");
const DEFAULT_XLSX = root("imports/online-printers/Preisllisten Schwabenprint.xlsx");

type PreisRow = {
  kategorie: string;
  produktgruppe: string | null;
  format: string | null;
  blatt: number | null;
  sorte: string | null;
  farbigkeit: string | null;
  spalten_key: string;
  auflage: number;
  preis_netto: number;
};
type SpiralAnchor = {
  format: string;
  spalten_key: string;
  sub: string;
  anchor: "b10" | "w10" | "b500" | "w100";
  wert: number;
};

/** Auflage-Staffel: bis 500 über (b10 + n×w10), darüber (b500 + n×w100). */
function staffelPreis(a: { b10: number; w10: number; b500: number; w100: number }, m: number): number {
  const v = m <= 500 ? a.b10 + ((m - 10) / 10) * a.w10 : a.b500 + ((m - 500) / 100) * a.w100;
  return Math.round(v * 10000) / 10000;
}

// feste Auflage-Staffel (wie die anderen Kategorien: exakte Treffer)
const SPIRAL_AUFLAGEN = [10, ...Array.from({ length: 49 }, (_, i) => (i + 2) * 10)]; // 10,20,…,500

function expandSpiral(anchors: SpiralAnchor[]): PreisRow[] {
  const grp = new Map<string, Partial<Record<SpiralAnchor["anchor"], number>>>();
  const meta = new Map<string, { format: string; spalten_key: string; sub: string }>();
  for (const a of anchors) {
    const k = `${a.format}|${a.spalten_key}|${a.sub}`;
    if (!grp.has(k)) {
      grp.set(k, {});
      meta.set(k, { format: a.format, spalten_key: a.spalten_key, sub: a.sub });
    }
    grp.get(k)![a.anchor] = a.wert;
  }
  const out: PreisRow[] = [];
  for (const [k, an] of grp) {
    if (an.b10 == null || an.w10 == null || an.b500 == null || an.w100 == null) continue;
    const m = meta.get(k)!;
    for (const auflage of SPIRAL_AUFLAGEN) {
      out.push({
        kategorie: "Spiralbooklet",
        produktgruppe: "DSP",
        format: m.format,
        blatt: null,
        sorte: m.sub, // '8s' | 'per2' | 'x'
        farbigkeit: null,
        spalten_key: m.spalten_key, // 'inhalt_300', 'umschlag_170', 'cello', …
        auflage,
        preis_netto: staffelPreis(
          { b10: an.b10, w10: an.w10, b500: an.b500, w100: an.w100 },
          auflage,
        ),
      });
    }
  }
  return out;
}

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const fmtKey = (s: string | null) =>
  (s ?? "").toLowerCase().replace(/cm|mm/g, "").replace(/[\s×x,._-]/g, "");

// ---------------------------------------------------------------- Import
export async function importPreise() {
  const datei = arg("datei") ?? DEFAULT_XLSX;
  const name = arg("name");
  const ab = arg("ab");
  if (!name || !ab) throw new Error("--name= und --ab=YYYY-MM-DD sind Pflicht");
  if (!existsSync(PY)) throw new Error(`Python-venv fehlt (${PY})`);
  if (!existsSync(datei)) throw new Error(`Datei fehlt: ${datei}`);

  const res = spawnSync(PY, [SCRIPT, datei], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`preise_dump.py: ${res.stderr?.slice(0, 400)}`);
  const parsed = JSON.parse(res.stdout) as {
    rows: PreisRow[];
    spiral?: SpiralAnchor[];
    sheets: Record<string, number>;
  };
  const spiralRows = expandSpiral(parsed.spiral ?? []);

  // preis_liste anlegen/aktualisieren (Abgleich über name)
  const listeRow = {
    name,
    lieferant: arg("lieferant") ?? "Schwabenprint",
    gueltig_ab: ab,
    gueltig_bis: arg("bis") ?? null,
    aufschlag_prozent: 0,
    is_active: true,
  };
  const { data: exist } = await supabase.from("preis_liste").select("id").eq("name", name).maybeSingle();
  let listeId: string;
  if (exist) {
    await supabase.from("preis_liste").update(listeRow).eq("id", exist.id);
    listeId = exist.id;
    await supabase.from("preis").delete().eq("liste_id", listeId);
  } else {
    const { data, error } = await supabase.from("preis_liste").insert(listeRow).select("id").single();
    if (error) throw new Error(`preis_liste: ${error.message}`);
    listeId = data.id;
  }

  // Duplikate (spalten_key + auflage) zusammenfassen; Spiralbooklet-Zeilen anhängen
  const seen = new Set<string>();
  const rows = [...parsed.rows, ...spiralRows].filter((r) => {
    const k = `${r.kategorie}|${r.format}|${r.spalten_key}|${r.sorte}|${r.auflage}`;
    return seen.has(k) ? false : seen.add(k);
  });

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ ...r, liste_id: listeId }));
    const { error } = await supabase.from("preis").insert(batch);
    if (error) throw new Error(`preis insert @${i}: ${error.message}`);
  }

  return {
    liste: name,
    liste_id: listeId,
    sheets: parsed.sheets,
    spiralbooklet_preise: spiralRows.length,
    preise: rows.length,
  };
}

// ---------------------------------------------------------------- Rollover (+X %)
export async function rolloverPreise() {
  const basis = arg("basis");
  const name = arg("name");
  const ab = arg("ab");
  const prozent = Number(arg("prozent") ?? "0");
  if (!basis || !name || !ab) throw new Error("--basis= (Name/ID) --name= --ab= sind Pflicht");

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(basis);
  const { data: basisliste } = await supabase
    .from("preis_liste")
    .select("id, name")
    .eq(isUuid ? "id" : "name", basis)
    .maybeSingle();
  if (!basisliste) throw new Error(`Basisliste '${basis}' nicht gefunden`);

  const { data: neu, error: nErr } = await supabase
    .from("preis_liste")
    .insert({
      name,
      lieferant: "Schwabenprint",
      gueltig_ab: ab,
      gueltig_bis: arg("bis") ?? null,
      basis_liste_id: basisliste.id,
      aufschlag_prozent: prozent,
      is_active: true,
    })
    .select("id")
    .single();
  if (nErr) throw new Error(`preis_liste: ${nErr.message}`);

  const faktor = 1 + prozent / 100;
  let from = 0;
  let n = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("preis")
      .select("*")
      .eq("liste_id", basisliste.id)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    const batch = data.map((p) => {
      const { id, created_at, updated_at, ...rest } = p as Record<string, unknown>;
      void id;
      void created_at;
      void updated_at;
      return {
        ...rest,
        liste_id: neu.id,
        preis_netto: Math.round(Number(p.preis_netto) * faktor * 10000) / 10000,
      };
    });
    const { error: iErr } = await supabase.from("preis").insert(batch);
    if (iErr) throw new Error(`preis copy: ${iErr.message}`);
    n += batch.length;
    if (data.length < 1000) break;
    from += 1000;
  }
  return { neu: name, basis: basisliste.name, prozent, preise: n };
}

// ---------------------------------------------------------------- Match
type OrderAttr = Record<string, unknown>;

async function listeFuerDatum(datum: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("preis_liste")
    .select("id, name, gueltig_ab, gueltig_bis")
    .eq("is_active", true)
    .lte("gueltig_ab", datum)
    .order("gueltig_ab", { ascending: false });
  const hit = (data ?? []).find((l) => !l.gueltig_bis || (l.gueltig_bis as string) >= datum);
  return hit ? { id: hit.id as string, name: hit.name as string } : null;
}

function sorteKey(attr: OrderAttr): string | null {
  const g = attr.grammatur_g;
  if (g == null) return null;
  const offset = /offset/i.test(String(attr.sorte ?? ""));
  return `${g}${offset ? "OFF" : ""}`;
}

/** Spiralbooklet: Preis aus Komponenten (siehe apps/web/src/lib/preise/match.ts). */
async function spiralPreis(
  listeId: string,
  format: string,
  attr: OrderAttr,
  auflage: number,
): Promise<{ netto: number; aufbau: string } | null> {
  const { data: rows } = await supabase
    .from("preis")
    .select("spalten_key, sorte, preis_netto")
    .eq("liste_id", listeId)
    .eq("kategorie", "Spiralbooklet")
    .eq("format", format)
    .eq("auflage", auflage);
  if (!rows?.length) return null;
  const P = (key: string, sub: string) =>
    Number(rows.find((r) => r.spalten_key === key && r.sorte === sub)?.preis_netto ?? 0);
  const seiten = Number(attr.seiten ?? (attr.blatt != null ? Number(attr.blatt) * 2 : 8)) || 8;
  const extra = Math.max(0, Math.ceil((seiten - 8) / 2));
  const g = Number(attr.grammatur_g) || 0;
  const offset = /offset/i.test(String(attr.sorte ?? ""));
  const ic = offset ? "inhalt_offset" : g >= 280 ? "inhalt_300" : "inhalt_135";
  const teile = [`${ic}${extra ? ` +${extra}×2S.` : ""}`];
  let netto = P(ic, "8s") + extra * P(ic, "per2");
  const ug = Number(attr.umschlag_g) || 0;
  if ([170, 250, 300].includes(ug)) {
    netto += P(`umschlag_${ug}`, "x");
    teile.push(`umschlag_${ug}`);
  }
  if (attr.cello === "matt" || attr.cello === "glanz") {
    netto += P("cello", "8s") + extra * P("cello", "per2");
    teile.push("cello");
  }
  if (attr.deckblatt === true) {
    netto += P("deckblatt", "x");
    teile.push("deckblatt");
  }
  const sbl = String(attr.schlussblatt ?? "");
  if (sbl === "folie") (netto += P("schlussblatt_folie", "x")), teile.push("schlussblatt");
  else if (sbl === "grau") (netto += P("karton_grau", "x")), teile.push("karton_grau");
  else if (sbl === "weiss") (netto += P("karton_weiss", "x")), teile.push("karton_weiss");
  return { netto: Math.round(netto * 100) / 100, aufbau: teile.join(" + ") };
}

export async function matchPreise() {
  const ref = arg("ref");
  const all = process.argv.includes("--all");
  let q = supabase
    .from("portal_order")
    .select("id, external_reference, quantity, versand_datum, deliver_date, resolve_result");
  if (ref) q = q.eq("external_reference", ref);
  else if (!all) q = q.is("preis_id", null);
  const { data: orders, error } = await q;
  if (error) throw new Error(error.message);

  const listenCache = new Map<string, { id: string; name: string } | null>();
  let treffer = 0;
  let ohne = 0;
  const beispiele: string[] = [];

  for (const o of orders ?? []) {
    const rr = (o.resolve_result ?? null) as { gruppe?: string; attribute?: OrderAttr } | null;
    const datum =
      (o.versand_datum as string | null) ??
      (o.deliver_date ? String(o.deliver_date).slice(0, 10) : null);
    if (!rr?.gruppe || !datum) {
      ohne++;
      continue;
    }
    if (!listenCache.has(datum)) listenCache.set(datum, await listeFuerDatum(datum));
    const liste = listenCache.get(datum) ?? null;
    if (!liste) {
      ohne++;
      continue;
    }

    const attr = rr.attribute ?? {};
    const auflage = Number(o.quantity) || 0;

    if (rr.gruppe === "DSP") {
      const sp = await spiralPreis(liste.id, String(attr.format ?? ""), attr, auflage);
      if (sp) {
        await supabase
          .from("portal_order")
          .update({ preis_id: null, preis_netto: sp.netto, preis_quelle: "auto" })
          .eq("id", o.id);
        treffer++;
      } else {
        await supabase.from("portal_order").update({ preis_quelle: "kein_treffer" }).eq("id", o.id);
        ohne++;
        if (beispiele.length < 12)
          beispiele.push(`${o.external_reference} DSP/${attr.format ?? "?"}/${auflage} (keine Spiral-Preise)`);
      }
      continue;
    }

    const { data: kandidaten } = await supabase
      .from("preis")
      .select("id, format, blatt, sorte, farbigkeit, preis_netto, spalten_key")
      .eq("liste_id", liste.id)
      .eq("produktgruppe", rr.gruppe)
      .eq("auflage", auflage);

    const fmt = fmtKey(String(attr.format ?? ""));
    const blatt = attr.blatt != null ? Number(attr.blatt) : attr.seiten != null ? Number(attr.seiten) : null;
    const sk = sorteKey(attr);
    const farb = attr.farbigkeit ? String(attr.farbigkeit) : null;

    const hit =
      (kandidaten ?? []).find((p) => {
        if (p.format && fmt && fmtKey(p.format as string) !== fmt) return false;
        if (p.blatt != null && blatt != null && Number(p.blatt) !== blatt) return false;
        if (p.sorte && sk && String(p.sorte) !== sk) return false;
        if (p.farbigkeit && farb && String(p.farbigkeit) !== farb) return false;
        return true;
      }) ?? null;

    if (hit) {
      await supabase
        .from("portal_order")
        .update({
          preis_id: hit.id,
          preis_netto: Math.round(Number(hit.preis_netto) * 100) / 100,
          preis_quelle: "auto",
        })
        .eq("id", o.id);
      treffer++;
    } else {
      await supabase.from("portal_order").update({ preis_quelle: "kein_treffer" }).eq("id", o.id);
      ohne++;
      if (beispiele.length < 12)
        beispiele.push(
          `${o.external_reference} ${rr.gruppe}/${attr.format ?? "?"}/${blatt ?? "?"}Bl/${sk ?? "?"}/${auflage}`,
        );
    }
  }
  return { geprüft: orders?.length ?? 0, treffer, ohne_treffer: ohne, beispiele };
}
