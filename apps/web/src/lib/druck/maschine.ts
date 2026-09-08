/**
 * Automatische Zuordnung Druck-Batch → Maschine.
 * SPIEGEL von services/sync/src/maschine.ts – bei Änderungen BEIDE anpassen.
 *
 * Kriterien: druckverfahren, benötigte Farben (aus Job-Farbigkeit), Druckbogen,
 * Papier. Der Rüstzustand (geladen[] – bis zu 9 Magazine je Digitaldrucker)
 * gewinnt; sonst die Maschine mit der kleinsten ausreichenden Farbigkeit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type GeladenEintrag = { papier: string | null; format: string | null };
export type MaschineSpec = {
  id: string;
  name: string;
  typ: string;
  druckverfahren: string | null;
  max_farben: number | null;
  formate: string[] | null;
  geladen: GeladenEintrag[] | null;
  sortierung: number;
};

const norm = (v: unknown) => (v == null ? "" : String(v).trim().toLowerCase());

/** "4/0" → 4, "1/1" → 1, "" → 4 (sicherste Annahme). */
export function farbenAusFarbigkeit(f: unknown): number {
  const m = String(f ?? "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return 4;
  return Math.max(Number(m[1]), Number(m[2])) || 1;
}

export function waehleMaschine(
  batch: { druckverfahren: string | null; druckbogen: string | null; papier: string | null; farben: number },
  maschinen: MaschineSpec[],
): MaschineSpec | null {
  const sheet = norm(batch.druckbogen);
  const paper = norm(batch.papier);

  const passend = maschinen.filter((m) => {
    if (m.typ !== "druck") return false;
    if (m.druckverfahren && batch.druckverfahren && m.druckverfahren !== batch.druckverfahren)
      return false;
    if (m.max_farben != null && batch.farben > m.max_farben) return false;
    if (m.formate && m.formate.length > 0 && sheet && !m.formate.map(norm).includes(sheet))
      return false;
    return true;
  });
  if (!passend.length) return null;

  const score = (m: MaschineSpec) => {
    let s = 0;
    const gel = Array.isArray(m.geladen) ? m.geladen : [];
    if (paper && gel.some((g) => norm(g.papier) === paper)) s += 100; // Papier ist gerüstet
    if (sheet && gel.some((g) => norm(g.format) === sheet)) s += 10;
    s -= m.max_farben ?? 9; // kleinste ausreichende Farbigkeit bevorzugen
    s -= m.sortierung / 1000;
    return s;
  };
  return [...passend].sort((a, b) => score(b) - score(a))[0];
}

export type ZuordnungResult = {
  geprüft: number;
  zugeordnet: number;
  unverändert: number;
  ohne_maschine: string[];
};

/** Alle offenen Druck-Batches ohne bzw. mit auto-Maschine neu zuordnen. */
export async function autoAssignDruckMaschinen(sb: SupabaseClient): Promise<ZuordnungResult> {
  const { data: maschinen } = await sb
    .from("maschine")
    .select("id, name, typ, druckverfahren, max_farben, formate, geladen, sortierung")
    .eq("aktiv", true)
    .eq("typ", "druck");
  const specs = (maschinen ?? []) as MaschineSpec[];

  const { data: batches } = await sb
    .from("batch")
    .select("id, nummer, druckverfahren, druckbogen, papier, maschine_id, maschine_auto, job(farbigkeit)")
    .eq("typ", "druck")
    .in("status", ["offen", "bereit"]);

  const res: ZuordnungResult = { geprüft: 0, zugeordnet: 0, unverändert: 0, ohne_maschine: [] };

  for (const b of batches ?? []) {
    // manuell gesetzte Maschine nicht überschreiben
    if (b.maschine_id && !b.maschine_auto) {
      res.unverändert++;
      continue;
    }
    res.geprüft++;
    const farben = Math.max(
      1,
      ...((b.job as { farbigkeit: string | null }[] | null) ?? []).map((j) =>
        farbenAusFarbigkeit(j.farbigkeit),
      ),
      1,
    );
    const m = waehleMaschine(
      {
        druckverfahren: b.druckverfahren as string | null,
        druckbogen: b.druckbogen as string | null,
        papier: b.papier as string | null,
        farben,
      },
      specs,
    );
    if (!m) {
      res.ohne_maschine.push(b.nummer as string);
      continue;
    }
    if (m.id === b.maschine_id) {
      res.unverändert++;
      continue;
    }
    await sb.from("batch").update({ maschine_id: m.id, maschine_auto: true }).eq("id", b.id);
    res.zugeordnet++;
  }
  return res;
}
