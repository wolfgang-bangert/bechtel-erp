/**
 * Buchungszeilen (Debitor an Erlöskonto je Steuersatz) aus den
 * Rechnungspositionen ableiten - NICHT aus dem Kopf-Feld tax_breakdown:
 * das speichert nur den Steuerbetrag je Satz, bei 0 % ist der immer 0 und
 * die tatsächliche Höhe der 0%-Position (z.B. Porto) geht dabei verloren
 * (bestätigter Fehler im bisherigen DATEV-Export bei gemischten Sätzen,
 * z.B. Druckprodukt 19 % + Porto 0 % - wurde komplett dem größten Satz
 * zugeschlagen statt eine eigene 0%-Zeile zu bekommen).
 */

const EU = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

export type ErloesKontenMap = {
  standard_19: string;
  standard_7: string;
  reverse_charge_eu?: string;
  intra_community_supply?: string;
  export_third_country?: string;
  tax_free_other?: string;
  fallback: string;
};

export type RechnungsPosition = {
  tax_rate: number | null;
  net_amount: number | null;
};

export type RechnungsBuchungszeile = {
  ledger_account: string;
  tax_rate: number;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
};

function revenueAccount(rate: number, taxCountry: string, map: ErloesKontenMap): string {
  if (rate >= 18) return map.standard_19;
  if (rate >= 6 && rate < 8) return map.standard_7;
  // rate ~0
  const c = (taxCountry || "DE").toUpperCase();
  if (c === "DE") return map.tax_free_other ?? map.fallback;
  if (EU.has(c)) return map.reverse_charge_eu ?? map.fallback;
  return map.export_third_country ?? map.fallback;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Positionen nach Steuersatz gruppieren + je Gruppe eine Buchungszeile
 * bauen. Positionen ohne tax_rate (Datenquelle liefert keinen) werden dem
 * am stärksten vertretenen bekannten Satz zugeschlagen, ohne bekannten
 * Satz Fallback 19 %.
 */
function buchungszeilenAusPositionen(
  positionen: RechnungsPosition[],
  taxCountry: string | null,
  map: ErloesKontenMap,
): RechnungsBuchungszeile[] {
  const byRate = new Map<number, number>();
  let unbekannt = 0;
  for (const p of positionen) {
    const net = p.net_amount ?? 0;
    if (p.tax_rate == null) {
      unbekannt += net;
      continue;
    }
    const rate = r2(p.tax_rate);
    byRate.set(rate, r2((byRate.get(rate) ?? 0) + net));
  }
  if (Math.abs(unbekannt) >= 0.005) {
    const leitsatz = [...byRate.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 19;
    byRate.set(leitsatz, r2((byRate.get(leitsatz) ?? 0) + unbekannt));
  }

  const out: RechnungsBuchungszeile[] = [];
  for (const [rate, net] of byRate) {
    if (Math.abs(net) < 0.005) continue;
    const tax = r2(net * (rate / 100));
    out.push({
      ledger_account: revenueAccount(rate, taxCountry ?? "DE", map),
      tax_rate: rate,
      net_amount: net,
      tax_amount: tax,
      gross_amount: r2(net + tax),
    });
  }
  return out.sort((a, b) => b.gross_amount - a.gross_amount);
}

/**
 * Buchungszeilen für eine Rechnung ermitteln - primär aus den Positionen
 * (korrekt auch bei gemischten Sätzen inkl. 0 %). Nur wenn keine
 * Positionen vorliegen (z.B. noch nicht gespiegelt), Fallback auf einen
 * einzigen, aus Kopf-net_total/tax_total abgeleiteten Satz (bestmögliche
 * Näherung, wie die alte Export-Logik es getan hat).
 */
export function berechneRechnungsBuchungszeilen(
  kopf: { net_total: number | null; tax_total: number | null; tax_country?: string | null },
  positionen: RechnungsPosition[],
  map: ErloesKontenMap,
  /**
   * Aus der BuchhaltungsButler-Historie gelerntes, kundenspezifisches
   * Erlöskonto (siehe learnDebitorVorkontierung) - ersetzt pauschal das
   * Inlands-Automatikkonto (Standard 19 %/7 %), lässt EU/Drittland/
   * steuerfreie Zeilen unangetastet (andere Fälle, kein gelernter Bezug).
   */
  revenueAccountOverride?: string | null,
): RechnungsBuchungszeile[] {
  const zeilen =
    positionen.length > 0
      ? buchungszeilenAusPositionen(positionen, kopf.tax_country ?? null, map)
      : (() => {
          const net = r2(kopf.net_total ?? 0);
          if (Math.abs(net) < 0.005) return [];
          const rate =
            net !== 0 && (kopf.tax_total ?? 0) !== 0 ? r2(((kopf.tax_total ?? 0) / net) * 100) : 0;
          const tax = r2(net * (rate / 100));
          return [
            {
              ledger_account: revenueAccount(rate, kopf.tax_country ?? "DE", map),
              tax_rate: rate,
              net_amount: net,
              tax_amount: tax,
              gross_amount: r2(net + tax),
            },
          ];
        })();

  if (!revenueAccountOverride) return zeilen;
  return zeilen.map((z) =>
    z.ledger_account === map.standard_19 || z.ledger_account === map.standard_7
      ? { ...z, ledger_account: revenueAccountOverride }
      : z,
  );
}
