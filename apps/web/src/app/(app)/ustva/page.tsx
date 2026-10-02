import Link from "next/link";
import { fmtDate, fmtEur } from "@/lib/format";
import { ladeUstva } from "@/lib/ustva";

export const dynamic = "force-dynamic";

/** Vormonat als Vorgabe: die UStVA wird für den abgelaufenen Monat abgegeben. */
function vormonat(): string {
  const n = new Date();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

const monatLabel = (m: string) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

const ganzeEuro = (n: number | null) => (n == null ? "–" : `${Math.trunc(n).toLocaleString("de-DE")} €`);

export default async function UstvaPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; versteuerung?: string }>;
}) {
  const sp = await searchParams;
  const monat = /^\d{4}-\d{2}$/.test(sp.monat ?? "") ? (sp.monat as string) : vormonat();
  const versteuerung = sp.versteuerung === "ist" ? "ist" : "soll";
  const d = await ladeUstva(monat, versteuerung);
  const e = d.ergebnis;
  const zahllastTon = e.zahllast > 0 ? "danger" : e.zahllast < 0 ? "ok" : "";

  const [y, m] = monat.split("-").map(Number);
  const nav = (delta: number) => new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  const href = (mo: string) => `/ustva?monat=${mo}${versteuerung === "ist" ? "&versteuerung=ist" : ""}`;

  return (
    <div className="content-wide bd-page">
      <div className="bd-head">
        <div>
          <h1>Umsatzsteuer-Voranmeldung</h1>
          <p className="bd-lead" style={{ marginBottom: 16, maxWidth: 780 }}>
            Vorschau aus den werk-Daten - zum Abgleich mit der bisherigen Meldung, noch kein Versand.
            Zeitraum {fmtDate(d.von)} – {fmtDate(d.bis)}, {versteuerung === "ist" ? "Ist" : "Soll"}-Versteuerung.
          </p>
        </div>
      </div>

      <form className="bd-toolbar" method="get">
        <Link className="bd-btn bd-btn-secondary" href={href(nav(-1))}>←</Link>
        <div className="bd-field">
          <label className="bd-field-label" htmlFor="monat">Monat</label>
          <input className="bd-field-input" id="monat" type="month" name="monat" defaultValue={monat} />
        </div>
        <div className="bd-field">
          <label className="bd-field-label" htmlFor="versteuerung">Versteuerung</label>
          <select className="bd-field-input" id="versteuerung" name="versteuerung" defaultValue={versteuerung}>
            <option value="soll">Soll (nach Rechnungsdatum)</option>
            <option value="ist">Ist (nach Zahlungseingang)</option>
          </select>
        </div>
        <button className="bd-btn bd-btn-secondary" type="submit">Anzeigen</button>
        <Link className="bd-btn bd-btn-secondary" href={href(nav(1))}>→</Link>
        <div className="bd-spacer" />
        <span className="bd-mute">
          {monatLabel(monat)} · {d.anzahlAusgang} Ausgangs-, {d.anzahlEingang} Eingangsbelege · Stand{" "}
          {new Date(d.stand).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
        </span>
      </form>

      <div className="bd-stat-row">
        <div className="bd-stat-card">
          <div className="n">{fmtEur(e.umsatzsteuer)}</div>
          <div className="l">Umsatzsteuer (inkl. § 13b)</div>
        </div>
        <div className="bd-stat-card">
          <div className="n">{fmtEur(e.vorsteuer)}</div>
          <div className="l">abziehbare Vorsteuer</div>
        </div>
        <div className={`bd-stat-card ${zahllastTon}`}>
          <div className="n">{fmtEur(Math.abs(e.zahllast))}</div>
          <div className="l">{e.zahllast >= 0 ? "Zahllast (Kz 83)" : "Erstattung (Kz 83)"}</div>
        </div>
      </div>

      {d.hinweise.filter((h) => h.ton === "warn").length > 0 && (
        <div className="bd-card">
          <h2>Prüfen vor dem Abgleich</h2>
          {d.hinweise
            .filter((h) => h.ton === "warn")
            .map((h, i) => (
              <details key={i} className="bd-acc" style={{ marginBottom: 6 }}>
                <summary style={{ color: "var(--bd-ink)" }}>{h.text}</summary>
                {h.belege && (
                  <ul style={{ margin: "8px 0 0 28px", padding: 0, fontSize: 13 }}>
                    {h.belege.slice(0, 40).map((b, k) => (
                      <li key={k} style={{ listStyle: "none", margin: "3px 0" }}>
                        <Link className="bd-link" href={b.href}>{b.label}</Link>
                      </li>
                    ))}
                    {h.belege.length > 40 && <li className="bd-mute" style={{ listStyle: "none" }}>… und {h.belege.length - 40} weitere</li>}
                  </ul>
                )}
              </details>
            ))}
        </div>
      )}

      <div className="table-scroll">
        <table className="bd-table">
          <thead>
            <tr>
              <th>Kz</th>
              <th>Bezeichnung</th>
              <th className="bd-num">Bemessungsgrundlage</th>
              <th className="bd-num">Eintrag (ganze €)</th>
              <th className="bd-num">Steuer</th>
              <th className="bd-num">Belege</th>
            </tr>
          </thead>
          <tbody>
            {e.kennzahlen.map((k) => (
              <tr key={k.kz} style={{ opacity: k.belege.length ? 1 : 0.5 }}>
                <td><strong>{k.kz}</strong></td>
                <td className="wrap">{k.label}</td>
                <td className="bd-num">{k.basis != null ? fmtEur(k.basis) : "–"}</td>
                <td className="bd-num">{ganzeEuro(k.basis)}</td>
                <td className="bd-num">{k.steuer != null ? fmtEur(k.steuer) : "–"}</td>
                <td className="bd-num">{new Set(k.belege.map((b) => b.belegId)).size}</td>
              </tr>
            ))}
            <tr>
              <td><strong>83</strong></td>
              <td className="wrap"><strong>Verbleibende Vorauszahlung / Überschuss</strong></td>
              <td className="bd-num" />
              <td className="bd-num" />
              <td className="bd-num"><strong>{fmtEur(e.zahllast)}</strong></td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="bd-hint">
        Bemessungsgrundlagen trägt das ELSTER-Formular in ganzen Euro ein (abgerundet), Steuerbeträge in Cent.
        Kz 81/86 und 46/47, 52/53: Steuer wird aus der Bemessungsgrundlage berechnet.
      </p>

      <h2 className="bd-h2">Belege je Kennzahl</h2>
      {e.kennzahlen
        .filter((k) => k.belege.length > 0)
        .map((k) => (
          <details key={k.kz} className="bd-acc" style={{ marginBottom: 6 }}>
            <summary style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ flex: 1 }}>
                <strong>Kz {k.kz}</strong> · {k.label}{" "}
                <span className="bd-mute">· {new Set(k.belege.map((b) => b.belegId)).size} Belege</span>
              </span>
              <span style={{ fontWeight: 600 }}>{fmtEur(k.steuer ?? k.basis ?? 0)}</span>
            </summary>
            <div className="table-scroll" style={{ marginTop: 6 }}>
              <table className="bd-table">
                <thead>
                  <tr>
                    <th>Beleg</th>
                    <th>Partner</th>
                    <th>Datum</th>
                    <th className="bd-num">Netto</th>
                    <th className="bd-num">Satz</th>
                    <th className="bd-num">Steuer</th>
                  </tr>
                </thead>
                <tbody>
                  {k.belege.map((z, i) => (
                    <tr key={i}>
                      <td>
                        <Link className="bd-link" href={z.href}>{z.belegNr ?? z.belegId.slice(0, 8)}</Link>
                      </td>
                      <td className="wrap">{z.partner}</td>
                      <td>{z.datum ? fmtDate(z.datum) : "—"}</td>
                      <td className="bd-num">{fmtEur(z.vorzeichen * z.netto)}</td>
                      <td className="bd-num">{z.rc ? "19 % (§13b)" : `${z.satz} %`}</td>
                      <td className="bd-num">
                        {fmtEur(z.vorzeichen * z.netto * ((z.rc ? 19 : z.satz) / 100))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}

      {d.hinweise.filter((h) => h.ton === "info").map((h, i) => (
        <p key={i} className="bd-hint">{h.text}</p>
      ))}
    </div>
  );
}
