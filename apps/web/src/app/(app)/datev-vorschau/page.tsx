import Link from "next/link";
import { fmtEur } from "@/lib/format";
import { kreditorPreview, debitorPreview } from "@/lib/datevPreview";

export const dynamic = "force-dynamic";

function monthRange(): { from: string; to: string } {
  const n = new Date();
  const from = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  const to = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}${iso.slice(5, 7)}` : "–");

export default async function DatevVorschauPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const def = monthRange();
  const from = sp.from || def.from;
  const to = sp.to || def.to;
  const scope = sp.scope === "debitor" ? "debitor" : "kreditor";

  const pv = scope === "debitor" ? await debitorPreview(from, to) : await kreditorPreview(from, to);
  const cli =
    scope === "debitor"
      ? `pnpm --filter sync datev:extf --from=${from} --to=${to}`
      : `pnpm --filter sync datev:kreditor --from=${from} --to=${to}`;

  return (
    <>
      <h1>DATEV-Vorschau</h1>
      <p className="lead">
        Alle Buchungssätze, die in den EXTF-Buchungsstapel gehen — zum Prüfen vor
        dem Export. {scope === "kreditor" ? "Eingangsrechnungen (Kreditoren)" : "Ausgangsrechnungen (Debitoren)"}.
      </p>

      <form className="toolbar" method="get">
        <select name="scope" defaultValue={scope}>
          <option value="kreditor">Kreditoren (Eingang)</option>
          <option value="debitor">Debitoren (Ausgang)</option>
        </select>
        <input type="date" name="from" defaultValue={from} />
        <input type="date" name="to" defaultValue={to} />
        <button type="submit">Anzeigen</button>
        <span className="count">
          {pv.belege} Belege · {pv.lines.length} Zeilen · {fmtEur(pv.brutto)} brutto
          {pv.skipped.length > 0 && ` · ${pv.skipped.length} übersprungen`}
        </span>
      </form>

      <p className="lead">
        Export als Datei (CSV + Belege-ZIP): <code>{cli}</code>
      </p>

      {pv.skipped.length > 0 && (
        <details style={{ margin: "12px 0" }}>
          <summary>{pv.skipped.length} Belege werden nicht gebucht</summary>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Beleg</th>
                  <th>Partner</th>
                  <th>Grund</th>
                </tr>
              </thead>
              <tbody>
                {pv.skipped.map((s, i) => (
                  <tr key={i}>
                    <td>{s.belegNr}</td>
                    <td className="wrap">{s.partner}</td>
                    <td>{s.grund}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Bel.-Datum</th>
              <th>Beleg-Nr.</th>
              <th style={{ textAlign: "right" }}>Umsatz</th>
              <th>S/H</th>
              <th>Konto</th>
              <th>Gegenkonto</th>
              <th>BU</th>
              <th>KOST1</th>
              <th>Buchungstext</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pv.lines.map((l, i) => (
              <tr key={i}>
                <td>{ddmm(l.belegdatum)}</td>
                <td className="wrap">{l.belegNr}</td>
                <td style={{ textAlign: "right" }}>{fmtEur(l.brutto)}</td>
                <td>{l.sh}</td>
                <td className="wrap">
                  {l.konto}
                  {l.kontoName && <span style={{ color: "var(--muted)" }}> {l.kontoName}</span>}
                </td>
                <td className="wrap">
                  {l.gegenkonto}
                  {l.gegenkontoName && (
                    <span style={{ color: "var(--muted)" }}> {l.gegenkontoName}</span>
                  )}
                </td>
                <td>{l.bu || "–"}</td>
                <td>{l.kost || "–"}</td>
                <td className="wrap">{l.text}</td>
                <td>
                  <Link href={l.href}>öffnen</Link>
                </td>
              </tr>
            ))}
            {pv.lines.length === 0 && (
              <tr>
                <td colSpan={10} style={{ color: "var(--muted)" }}>
                  Keine buchbaren Belege im Zeitraum.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
