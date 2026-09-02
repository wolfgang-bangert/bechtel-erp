import { createClient } from "@/lib/supabase/server";

export type Package = { weight: number };
export type FreightInput = {
  plz: string;
  land?: string;
  packages: Package[];
  /** Optionales Limit kg/Paket für die Paketvarianten. Wird zusätzlich durch das
   *  Carrier-Maximum (höchstes `kg_bis`) begrenzt. Leer = nur Carrier-Maximum. */
  maxKgPerPackage?: number | null;
};

export type FreightOption = {
  carrier: string;
  carrierCode: string;
  art: string;
  variante: string; // z.B. "10 Pakete (aufgeteilt)" / "1 Sendung"
  total: number | null;
  detail: string;
  missing?: string;
};

type Carrier = { id: string; code: string; name: string; art: string; is_active: boolean };
type Rate = {
  carrier_id: string;
  produkt: string | null;
  zone: number | null;
  kg_von: number;
  kg_bis: number;
  preis: number;
};
type Zone = { carrier_id: string; plz_prefix: string; land: string; zone: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const N = (v: unknown) => Number(v ?? 0);

/**
 * Passende Tarifzeile für ein Gewicht: die engste Staffel, die das Gewicht
 * abdeckt (kleinstes `kg_bis` ≥ Gewicht); bei Gleichstand die günstigste.
 * Die untere Grenze (`kg_von`) wird nur als Tie-Breaker genutzt, damit
 * kleine Lücken in den Ninox-Staffeln (z. B. 50→51 kg) nicht zu „kein Tarif" führen.
 */
function bestRate(rates: Rate[], weight: number, zone: number | null): Rate | null {
  const inZone = rates.filter((x) => zone == null || x.zone == null || x.zone === zone);
  const covering = inZone.filter((x) => weight <= N(x.kg_bis) + 1e-6);
  if (!covering.length) return null;
  return covering.reduce((a, b) => {
    if (N(b.kg_bis) !== N(a.kg_bis)) return N(b.kg_bis) < N(a.kg_bis) ? b : a;
    return N(b.preis) < N(a.preis) ? b : a;
  });
}

/** Ein Packstück ggf. auf mehrere gleich schwere Pakete ≤ cap aufteilen. */
function splitPackage(weight: number, cap: number): number[] {
  if (!(cap > 0) || weight <= cap + 1e-6) return [weight];
  const n = Math.ceil(weight / cap);
  return Array.from({ length: n }, () => weight / n);
}

export async function frachtvergleich(input: FreightInput): Promise<{
  options: FreightOption[];
  totalWeight: number;
  zoneByCarrier: Record<string, number | null>;
}> {
  const land = (input.land || "DE").toUpperCase();
  const supabase = await createClient();
  const [{ data: carriers }, { data: rates }, { data: zones }] = await Promise.all([
    supabase.from("carrier").select("id, code, name, art, is_active").eq("is_active", true),
    supabase.from("carrier_rate").select("carrier_id, produkt, zone, kg_von, kg_bis, preis"),
    supabase.from("carrier_zone").select("carrier_id, plz_prefix, land, zone"),
  ]);

  const cs = (carriers ?? []) as Carrier[];
  const rs = (rates ?? []) as Rate[];
  const zs = (zones ?? []) as Zone[];

  const totalWeight = r2(input.packages.reduce((s, p) => s + (p.weight || 0), 0));
  const plz2 = input.plz.replace(/\D/g, "").slice(0, 2);
  const userCap =
    input.maxKgPerPackage != null && input.maxKgPerPackage > 0
      ? input.maxKgPerPackage
      : Infinity;

  const zoneFor = (cid: string): number | null => {
    const cand = zs.filter((z) => z.carrier_id === cid && z.land === land);
    return (
      cand.find((z) => z.plz_prefix === plz2.padStart(2, "0"))?.zone ??
      cand.find((z) => z.plz_prefix === plz2)?.zone ??
      cand.find((z) => z.plz_prefix === plz2.slice(0, 1).padStart(2, "0"))?.zone ??
      null
    );
  };

  const options: FreightOption[] = [];
  const zoneByCarrier: Record<string, number | null> = {};

  for (const c of cs) {
    const cr = rs.filter((x) => x.carrier_id === c.id);
    const zone = zoneFor(c.id);
    zoneByCarrier[c.code] = zone;

    if (c.art === "spedition") {
      const rate = bestRate(cr, totalWeight, zone);
      options.push({
        carrier: c.name,
        carrierCode: c.code,
        art: c.art,
        variante: "1 Sendung",
        total: rate ? r2(N(rate.preis)) : null,
        detail: rate
          ? `Zone ${zone ?? "?"}, ${totalWeight} kg → ${N(rate.preis).toFixed(2)} €`
          : "",
        missing: rate
          ? undefined
          : zone == null
            ? `keine Zone für PLZ ${plz2}`
            : `keine Tarifzeile für ${totalWeight} kg (Zone ${zone})`,
      });
      continue;
    }

    // Paketvariante: schwere Packstücke auf mehrere Pakete aufteilen.
    if (!cr.length) {
      options.push({
        carrier: c.name,
        carrierCode: c.code,
        art: c.art,
        variante: "—",
        total: null,
        detail: "",
        missing: "keine Tarife hinterlegt",
      });
      continue;
    }
    const carrierMax = Math.max(...cr.map((r) => N(r.kg_bis)));
    // Nur echte Paketdienste aufteilen; Brief/Mailing (Post) nicht auf 300 Sendungen splitten.
    const cap = c.art === "paket" ? Math.min(carrierMax, userCap) : Infinity;

    const subPackages = input.packages.flatMap((p) => splitPackage(p.weight || 0, cap));

    let sum = 0;
    let miss = "";
    const groups = new Map<string, { w: number; preis: number; produkt: string; n: number }>();
    for (const w of subPackages) {
      const rate = bestRate(cr, w, zone);
      if (!rate) {
        miss = `kein Tarif für ${r2(w)} kg (max ${carrierMax} kg/Paket)`;
        break;
      }
      const preis = N(rate.preis);
      sum += preis;
      const key = `${r2(w)}|${preis}|${rate.produkt ?? ""}`;
      const g = groups.get(key);
      if (g) g.n += 1;
      else groups.set(key, { w: r2(w), preis, produkt: rate.produkt ?? "Paket", n: 1 });
    }

    const split = subPackages.length > input.packages.length;
    const label = `${subPackages.length} ${subPackages.length === 1 ? "Paket" : "Pakete"}${
      split ? " (aufgeteilt)" : ""
    }`;
    const detail = [...groups.values()]
      .map((g) => `${g.n}× ${g.w} kg · ${g.produkt} ${g.preis.toFixed(2)} €`)
      .join("   +   ");

    options.push({
      carrier: c.name,
      carrierCode: c.code,
      art: c.art,
      variante: label,
      total: miss ? null : r2(sum),
      detail,
      missing: miss || undefined,
    });
  }

  options.sort((a, b) => {
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return a.total - b.total;
  });

  return { options, totalWeight, zoneByCarrier };
}
