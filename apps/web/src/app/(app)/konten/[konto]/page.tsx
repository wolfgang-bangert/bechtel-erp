import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { fuerKonto, kontoauszug, ladeJournal, saldoVon, type Quelle } from "@/lib/konten/journal";
import { kontoNamen } from "@/lib/konten/namen";
import { ladeVortraege } from "@/lib/konten/vortrag";

export const dynamic = "force-dynamic";

type Search = { jahr?: string; von?: string; bis?: string; monat?: string };

const QUELLE: Record<Quelle, string> = {
  eingangsrechnung: "ER",
  ausgangsrechnung: "AR",
  bank: "Bank",
  lohn: "Lohn",
};

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const fmtSaldo = (s: number) => (Math.abs(s) < 0.005 ? "0,00 €" : `${fmtEur(Math.abs(s))} ${s > 0 ? "S" : "H"}`);

/** Kontoauszug eines Kontos: Vortrag, Buchungen mit laufendem Saldo, Monatssalden. */
export default async function KontoPage({ params, searchParams }: { params: Promise<{ konto: string }>; searchParams: Promise<Search> }) {
  const konto = decodeURIComponent((await params).konto);
  const sp = await searchParams;
  const jahr = /^\d{4}$/.test(sp.jahr ?? "") ? sp.jahr! : String(new Date().getFullYear());
  const monat = /^(0[1-9]|1[0-2])$/.test(sp.monat ?? "") ? sp.monat! : "";
  const von = monat ? `${jahr}-${monat}-01` : `${jahr}-01-01`;
  const bis = monat ? new Date(Date.UTC(+jahr, +monat, 0)).toISOString().slice(0, 10) : `${jahr}-12-31`;

  const sb = await createClient();
  // Vortrag: alles vor dem Zeitraum seit Jahresbeginn (werk führt keine Vorjahressalden)
  const [journal, vortraege] = await Promise.all([ladeJournal(`${jahr}-01-01`, bis, sb), ladeVortraege(sb, jahr)]);
  const jahresVortrag = vortraege.get(konto) ?? 0;
  const alleZeilen = fuerKonto(journal, konto);
  const vorher = alleZeilen.filter((b) => b.datum < von);
  const imZeitraum = alleZeilen.filter((b) => b.datum >= von);
  const vortrag = Math.round((jahresVortrag + saldoVon(vorher)) * 100) / 100;
  const auszug = kontoauszug(imZeitraum, vortrag);
  const ende = auszug.length ? auszug[auszug.length - 1].saldo : vortrag;
  const namen = await kontoNamen(sb, [konto, ...new Set(imZeitraum.map((b) => b.gegenkonto))]);
  const summeSoll = imZeitraum.reduce((s, b) => s + (b.sh === "S" ? b.betrag : 0), 0);
  const summeHaben = imZeitraum.reduce((s, b) => s + (b.sh === "H" ? b.betrag : 0), 0);

  // Monatssalden (Ende jedes Monats) fürs ganze Jahr
  const monatsEnde = MONATE.map((_, i) => {
    const grenze = new Date(Date.UTC(+jahr, i + 1, 0)).toISOString().slice(0, 10);
    return Math.round((jahresVortrag + saldoVon(alleZeilen.filter((b) => b.datum <= grenze))) * 100) / 100;
  });
  const heuteMonat = new Date().getFullYear() === +jahr ? new Date().getMonth() : 11;

  return (
    <>
      <h1>
        Konto {konto} {namen.get(konto) ? `– ${namen.get(konto)}` : ""}
      </h1>
      <p className="lead">
        {monat ? `${MONATE[+monat - 1]} ${jahr}` : jahr} · Saldo am Ende: <strong>{fmtSaldo(ende)}</strong>{" "}
        {Math.abs(ende) < 0.005 ? <span className="tag">ausgeglichen ✓</span> : <span className="tag">nicht ausgeglichen</span>}
      </p>

      <form className="toolbar" method="get">
        <select name="jahr" defaultValue={jahr}>
          {[0, 1, 2].map((d) => {
            const j = String(new Date().getFullYear() - d);
            return (
              <option key={j} value={j}>
                {j}
              </option>
            );
          })}
        </select>
        <select name="monat" defaultValue={monat}>
          <option value="">ganzes Jahr</option>
          {MONATE.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </select>
        <button type="submit">Anzeigen</button>
        <Link href={`/konten?jahr=${jahr}`}>← alle Konten</Link>
      </form>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              {MONATE.map((m, i) => (
                <th key={m} style={{ textAlign: "right" }}>
                  <Link href={`/konten/${encodeURIComponent(konto)}?jahr=${jahr}&monat=${String(i + 1).padStart(2, "0")}`}>{m}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {monatsEnde.map((s, i) => (
                <td
                  key={i}
                  style={{ textAlign: "right", whiteSpace: "nowrap", color: i > heuteMonat ? "var(--muted)" : Math.abs(s) < 0.005 ? undefined : "var(--warn, #b45309)" }}
                  title="Saldo am Monatsende"
                >
                  {i > heuteMonat ? "–" : fmtSaldo(s)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="table-scroll" style={{ marginTop: 16 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Quelle</th>
              <th>Beleg</th>
              <th>Text</th>
              <th>Gegenkonto</th>
              <th style={{ textAlign: "right" }}>Soll</th>
              <th style={{ textAlign: "right" }}>Haben</th>
              <th style={{ textAlign: "right" }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="count">
                Vortrag {monat ? `zum ${fmtDate(von)}` : `zum 01.01.${jahr}`}
                {!monat && !jahresVortrag && (
                  <>
                    {" "}
                    – keiner erfasst (<Link href={`/konten/vortraege?jahr=${jahr}`}>Saldovortrag eintragen</Link>)
                  </>
                )}
              </td>
              <td style={{ textAlign: "right" }}>{fmtSaldo(vortrag)}</td>
            </tr>
            {auszug.map((z, i) => (
              <tr key={i}>
                <td>{fmtDate(z.datum)}</td>
                <td>
                  <span className="tag">{QUELLE[z.quelle]}</span>
                </td>
                <td>{z.href ? <Link href={z.href}>{z.beleg || "→"}</Link> : z.beleg}</td>
                <td className="wrap">{z.text}</td>
                <td className="wrap">
                  <Link href={`/konten/${encodeURIComponent(z.gegenkonto)}?jahr=${jahr}`}>{z.gegenkonto}</Link>{" "}
                  <span className="count">{namen.get(z.gegenkonto) ?? ""}</span>
                </td>
                <td style={{ textAlign: "right" }}>{z.soll ? fmtEur(z.soll) : ""}</td>
                <td style={{ textAlign: "right" }}>{z.haben ? fmtEur(z.haben) : ""}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtSaldo(z.saldo)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={5}>
                <strong>Summe Zeitraum</strong>
              </td>
              <td style={{ textAlign: "right" }}>
                <strong>{fmtEur(summeSoll)}</strong>
              </td>
              <td style={{ textAlign: "right" }}>
                <strong>{fmtEur(summeHaben)}</strong>
              </td>
              <td style={{ textAlign: "right" }}>
                <strong>{fmtSaldo(ende)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
