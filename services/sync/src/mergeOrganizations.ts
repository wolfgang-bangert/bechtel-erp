import { supabase } from "./supabase";
import { findDuplicateGroups, type DupeGroup, type DupeRow } from "./dedupeReport";

type Options = {
  dryRun?: boolean;
  /** höchste zu verarbeitende Konfidenz-Stufe (Default: nur "hoch") */
  confidence?: "hoch" | "mittel";
  /** Gruppennummern (G12, G7 …), die übersprungen werden */
  exclude?: Set<string>;
  /** nur diese Gruppennummern verarbeiten */
  only?: Set<string>;
};

/** Gewinner wählen: Keyline-verknüpft > Ninox-verknüpft > ältester Datensatz. */
function pickSurvivor(members: DupeRow[]): DupeRow {
  const score = (m: DupeRow) =>
    (m.systems.includes("keyline") ? 100 : 0) +
    (m.systems.includes("ninox") ? 10 : 0);
  return [...members].sort(
    (a, b) => score(b) - score(a) || a.created_at.localeCompare(b.created_at),
  )[0];
}

export async function dedupeMerge(opts: Options = {}) {
  const { dryRun = false, confidence = "hoch", exclude, only } = opts;
  const { groups } = await findDuplicateGroups();

  const allowed =
    confidence === "mittel"
      ? new Set(["hoch", "mittel"])
      : new Set(["hoch"]);

  const merged = new Set<string>();
  const plan: {
    group: string;
    survivor: DupeRow;
    losers: DupeRow[];
    type: DupeGroup["type"];
  }[] = [];

  groups.forEach((g, i) => {
    const gid = `G${i + 1}`;
    if (!allowed.has(g.confidence)) return;
    if (exclude?.has(gid)) return;
    if (only && !only.has(gid)) return;

    const live = g.members.filter((m) => !merged.has(m.id));
    if (live.length < 2) return;

    const survivor = pickSurvivor(live);
    const losers = live.filter((m) => m.id !== survivor.id);
    losers.forEach((l) => merged.add(l.id));
    plan.push({ group: gid, survivor, losers, type: g.type });
  });

  for (const p of plan) {
    console.log(
      `${p.group} [${p.type}]  BEHALTEN  ${p.survivor.name}  (${p.survivor.systems})`,
    );
    for (const l of p.losers) {
      console.log(`        └─ zusammenführen  ${l.name}  (${l.systems})`);
    }
  }

  if (dryRun) {
    return {
      groups: plan.length,
      merges: plan.reduce((n, p) => n + p.losers.length, 0),
      dryRun: true,
    };
  }

  let ok = 0;
  let failed = 0;
  for (const p of plan) {
    for (const l of p.losers) {
      const { error } = await supabase.rpc("merge_organization", {
        p_survivor: p.survivor.id,
        p_loser: l.id,
      });
      if (error) {
        failed += 1;
        console.error(`  FEHLER ${p.group}: ${l.name} -> ${error.message}`);
      } else {
        ok += 1;
      }
    }
  }

  return { groups: plan.length, merges: ok, failed, dryRun: false };
}
