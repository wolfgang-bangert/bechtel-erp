import { PERSONAL_FELDER, ninoxWert } from "@werk/shared/personal/felder";
import { supabase } from "./supabase";
import { env } from "./env";

/**
 * Einmaliger Import der Personalübersicht aus Ninox (Team GL, DB "check", Tabelle A) nach public.personal.
 * Danach ist werk führend: Personen, die es schon gibt (ninox_id), werden NICHT überschrieben -
 * ein zweiter Lauf legt nur neu hinzugekommene an. Mit `--update` werden bestehende überschrieben.
 * Logins (app_user) werden verknüpft, wenn geschäftliche oder private E-Mail eindeutig passt.
 * Ausgabe nur als Zählung - keine Personaldaten im Log.
 */
type Options = { dryRun?: boolean; update?: boolean };

const TEAM = () => (process.env.NINOX_PERSONAL_TEAM_ID || "w092mw6q5fpgxga6b").trim();
const DB = () => (process.env.NINOX_PERSONAL_DATABASE_ID || "iecws4rh61da").trim();
const TABELLE = () => (process.env.NINOX_PERSONAL_TABLE_ID || "A").trim();

export async function personalImport(opts: Options = {}) {
  const { dryRun = false, update = false } = opts;
  const url = `${env.ninox.base()}/teams/${TEAM()}/databases/${DB()}/tables/${TABELLE()}/records?perPage=1000`;
  const res = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${env.ninox.key()}` } });
  if (!res.ok) throw new Error(`Ninox ${res.status} ${res.statusText} (Personalübersicht)`);
  const recs = (await res.json()) as { id: number; fields: Record<string, unknown> }[];

  const { data: vorhanden, error: vErr } = await supabase.from("personal").select("id, ninox_id, app_user_id");
  if (vErr) throw new Error(`personal lesen: ${vErr.message}`);
  const nachNinox = new Map((vorhanden ?? []).filter((p) => p.ninox_id != null).map((p) => [p.ninox_id as number, p]));
  const vergeben = new Set((vorhanden ?? []).map((p) => p.app_user_id).filter(Boolean));

  const { data: nutzer, error: uErr } = await supabase.from("app_user").select("id, email");
  if (uErr) throw new Error(`app_user lesen: ${uErr.message}`);
  const nachMail = new Map<string, string[]>();
  for (const u of nutzer ?? []) {
    const m = String(u.email ?? "").trim().toLowerCase();
    if (m) nachMail.set(m, [...(nachMail.get(m) ?? []), u.id]);
  }

  let neu = 0;
  let aktualisiert = 0;
  let uebersprungen = 0;
  let verknuepft = 0;
  for (const r of recs) {
    const zeile: Record<string, unknown> = { ninox_id: r.id };
    for (const f of PERSONAL_FELDER) if (f.ninox) zeile[f.spalte] = ninoxWert(f, r.fields[f.ninox]);

    const alt = nachNinox.get(r.id);
    if (!alt?.app_user_id) {
      const treffer = [zeile.email, zeile.privat_email]
        .map((m) => String(m ?? "").trim().toLowerCase())
        .filter(Boolean)
        .flatMap((m) => nachMail.get(m) ?? []);
      const eindeutig = [...new Set(treffer)];
      if (eindeutig.length === 1 && !vergeben.has(eindeutig[0])) {
        zeile.app_user_id = eindeutig[0];
        vergeben.add(eindeutig[0]);
        verknuepft++;
      }
    }

    if (alt && !update) {
      if (zeile.app_user_id && !dryRun) {
        const { error } = await supabase.from("personal").update({ app_user_id: zeile.app_user_id }).eq("id", alt.id);
        if (error) throw new Error(`personal verknüpfen: ${error.message}`);
      }
      uebersprungen++;
      continue;
    }
    if (dryRun) {
      alt ? aktualisiert++ : neu++;
      continue;
    }
    const { error } = alt
      ? await supabase.from("personal").update(zeile).eq("id", alt.id)
      : await supabase.from("personal").insert(zeile);
    if (error) throw new Error(`personal schreiben (Ninox ${r.id}): ${error.message}`);
    alt ? aktualisiert++ : neu++;
  }
  return { gesehen: recs.length, neu, aktualisiert, uebersprungen, verknuepft };
}
