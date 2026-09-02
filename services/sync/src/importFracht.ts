import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase";

const imp = (n: string) => fileURLToPath(new URL(`../../../imports/${n}`, import.meta.url));
const readJson = <T>(n: string): T => JSON.parse(readFileSync(imp(n), "utf8")) as T;

type Options = { dryRun?: boolean };

/**
 * Frachtdaten aus Ninox übernehmen:
 *  - EB Zonen Spedition  → carrier_zone (wackler)
 *  - FB Tarife nach kg   → carrier_rate (wackler, je Zone eine kg-Staffel)
 *  - FF Preise DPD/Post  → carrier_rate (dpd / post, produkt aus „Produkt")
 * Ersetzt jeweils den vorhandenen Bestand des Carriers.
 */
export async function importFracht(opts: Options = {}) {
  const { dryRun = false } = opts;

  const { data: carriers } = await supabase.from("carrier").select("id, code");
  const cid = new Map((carriers ?? []).map((c) => [c.code, c.id]));
  const wackler = cid.get("wackler");
  const dpd = cid.get("dpd");
  const post = cid.get("post");
  if (!wackler || !dpd || !post) throw new Error("carrier-Seed fehlt (dhl/dpd/post/wackler)");

  const eb = readJson<{ PLZ: number; Zone: number }[]>("ninox-zonen-spedition.json");
  const fb = readJson<{ "von kg": number; "bis kg": number; Zone: number; Preis: number }[]>(
    "ninox-tarife-kg.json",
  );
  const ff = readJson<
    { "von kg": number; "bis kg": number; Preis: number; Frachtunternehmen: string; Produkt?: string }[]
  >("ninox-preise-dpd-post.json");

  const zones = eb
    .filter((r) => r.PLZ != null && r.Zone != null)
    .map((r) => ({
      carrier_id: wackler,
      plz_prefix: String(r.PLZ).padStart(2, "0"),
      land: "DE",
      zone: Math.round(r.Zone),
    }));

  const wacklerRates = fb
    .filter((r) => r.Zone != null && r["bis kg"] != null)
    .map((r) => ({
      carrier_id: wackler,
      produkt: "Palette",
      zone: Math.round(r.Zone),
      kg_von: r["von kg"] ?? 0,
      kg_bis: r["bis kg"],
      preis: r.Preis ?? 0,
      notiz: "Import Ninox FB",
    }));

  const ffRates = ff
    .filter((r) => r.Frachtunternehmen && r["bis kg"] != null)
    .map((r) => ({
      carrier_id: /post/i.test(r.Frachtunternehmen) ? post : dpd,
      produkt: r.Produkt?.trim() || (/post/i.test(r.Frachtunternehmen) ? "Warenpost" : "Paket"),
      zone: null as number | null,
      kg_von: r["von kg"] ?? 0,
      kg_bis: r["bis kg"],
      preis: r.Preis ?? 0,
      notiz: "Import Ninox FF",
    }));

  const summary = {
    dryRun,
    zonen: zones.length,
    wackler_staffeln: wacklerRates.length,
    dpd_post_staffeln: ffRates.length,
  };
  if (dryRun) return summary;

  await supabase.from("carrier_zone").delete().eq("carrier_id", wackler);
  await supabase.from("carrier_rate").delete().in("carrier_id", [wackler, dpd, post]);

  for (let i = 0; i < zones.length; i += 500) {
    const { error } = await supabase.from("carrier_zone").upsert(zones.slice(i, i + 500), {
      onConflict: "carrier_id,land,plz_prefix",
    });
    if (error) throw new Error(`carrier_zone: ${error.message}`);
  }
  const allRates = [...wacklerRates, ...ffRates];
  for (let i = 0; i < allRates.length; i += 500) {
    const { error } = await supabase.from("carrier_rate").insert(allRates.slice(i, i + 500));
    if (error) throw new Error(`carrier_rate: ${error.message}`);
  }
  return summary;
}
