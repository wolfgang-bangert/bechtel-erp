import { frachtvergleich, type FreightOption } from "@/lib/fracht";

export const dynamic = "force-dynamic";

type Search = { plz?: string; land?: string; gewichte?: string; maxkg?: string };

function parseWeights(raw: string): number[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => Number(s.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export default async function VersandPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const plz = (sp.plz ?? "").trim();
  const land = (sp.land ?? "DE").trim().toUpperCase() || "DE";
  const gewichteRaw = (sp.gewichte ?? "").trim();
  const weights = parseWeights(gewichteRaw);
  const maxkgRaw = (sp.maxkg ?? "").trim();
  const maxKg = maxkgRaw ? Number(maxkgRaw.replace(",", ".")) : null;

  let result: Awaited<ReturnType<typeof frachtvergleich>> | null = null;
  if (plz && weights.length) {
    result = await frachtvergleich({
      plz,
      land,
      packages: weights.map((w) => ({ weight: w })),
      maxKgPerPackage: maxKg && maxKg > 0 ? maxKg : null,
    });
  }

  const cheapest =
    result?.options.find((o) => o.total != null)?.total ?? null;

  return (
    <>
      <h1>Frachtpreis-Vergleich</h1>
      <p className="lead">
        Zielort + Gewicht je Packstück eingeben. Vergleicht Paketvarianten
        (DHL/DPD/Post) gegen Speditionsversand (Wackler, Gesamtgewicht → Zone).
        Zu schwere Packstücke werden für die Paketvarianten automatisch auf mehrere
        gleich schwere Pakete aufgeteilt (Carrier-Maximum, i.&nbsp;d.&nbsp;R. 31,5&nbsp;kg;
        optional weiter begrenzbar). Ein einzelner Wert = Gesamtgewicht in einem Stück.
      </p>

      <form method="get" className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>PLZ</span>
          <input name="plz" defaultValue={plz} placeholder="73033" style={{ width: 100 }} required />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Land</span>
          <input name="land" defaultValue={land} style={{ width: 70 }} />
        </label>
        <label className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
          <span>Gewichte je Paket (kg, kommagetrennt) – oder Gesamtgewicht</span>
          <input
            name="gewichte"
            defaultValue={gewichteRaw}
            placeholder="5, 3, 12  oder  300"
            style={{ width: "100%" }}
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>max kg/Paket</span>
          <input
            name="maxkg"
            defaultValue={maxkgRaw}
            placeholder="31,5"
            style={{ width: 90 }}
            inputMode="decimal"
          />
        </label>
        <button type="submit">Vergleichen</button>
      </form>

      {plz && !weights.length && (
        <div className="banner-err">Bitte mindestens ein gültiges Gewicht eingeben.</div>
      )}

      {result && (
        <>
          <div className="toolbar">
            <span className="count">
              {weights.length} {weights.length === 1 ? "Packstück" : "Packstücke"},
              Gesamtgewicht <strong>{result.totalWeight} kg</strong> · Ziel {land} {plz}
            </span>
          </div>

          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Dienstleister</th>
                  <th>Art</th>
                  <th>Variante</th>
                  <th style={{ textAlign: "right" }}>Preis</th>
                  <th>Δ günstigster</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {result.options.map((o: FreightOption, i) => {
                  const best = o.total != null && o.total === cheapest;
                  return (
                    <tr key={`${o.carrierCode}-${i}`}>
                      <td>
                        {o.carrier} {best && <span className="tag">günstigste</span>}
                      </td>
                      <td>{o.art}</td>
                      <td>{o.variante}</td>
                      <td style={{ textAlign: "right", fontWeight: best ? 700 : 400 }}>
                        {o.total != null ? `${o.total.toFixed(2)} €` : "—"}
                      </td>
                      <td>
                        {o.total != null && cheapest != null && o.total !== cheapest
                          ? `+${(o.total - cheapest).toFixed(2)} €`
                          : ""}
                      </td>
                      <td className="wrap" style={{ color: "var(--muted)", fontSize: 12 }}>
                        {o.missing ? (
                          <span className="msg-err">{o.missing}</span>
                        ) : (
                          o.detail
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="lead" style={{ marginTop: 12 }}>
            DHL-Preis noch als Platzhalter (0 €) — unter{" "}
            <a href="/einstellungen/frachtpreise">Einstellungen → Frachtpreise</a> eintragen.
          </p>
        </>
      )}
    </>
  );
}
