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
  const parsed = JSON.parse(res.stdout) as { rows: PreisRow[]; sheets: Record<string, number> };

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

  // Duplikate (spalten_key + auflage) zusammenfassen
  const seen = new Set<string>();
  const rows = parsed.rows.filter((r) => {
    const k = `${r.spalten_key}|${r.auflage}`;
    return seen.has(k) ? false : seen.add(k);
  });

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ ...r, liste_id: listeId }));
    const { error } = await supabase.from("preis").insert(batch);
    if (error) throw new Error(`preis insert @${i}: ${error.message}`);
  }

  return { liste: name, liste_id: listeId, sheets: parsed.sheets, preise: rows.length };
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
