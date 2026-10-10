import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Belegprüfung · werk" };

type Doc = {
  id: string;
  doc_number: string | null;
  doc_date: string | null;
  gross_amount: number | null;
  supplier_name: string | null;
  status: string;
  payment_status: string;
  source: string;
  pdf_pruefung: { abweichungen?: string[]; verkaeufer?: string | null; bestellnummern?: string[] } | null;
};

/**
 * Prüfliste: (1) Belege, deren PDF von den gespeicherten Daten abweicht (Verkäufer, Rechnungsnummer, Betrag –
 * aus belege:pdf-pruefen), (2) mehrere nicht verworfene Belege mit derselben Rechnungsnummer.
 */
export default async function BelegPruefung() {
  const sb = await createClient();
  const alle: Doc[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await sb
      .from("incoming_document")
      .select("id, doc_number, doc_date, gross_amount, supplier_name, status, payment_status, source, pdf_pruefung")
      .neq("status", "rejected")
      .range(f, f + 999);
    alle.push(...((data ?? []) as Doc[]));
    if (!data || data.length < 1000) break;
  }
  const abweichend = alle
    .filter((d) => (d.pdf_pruefung?.abweichungen ?? []).length > 0)
    .sort((a, b) => (a.doc_date ?? "").localeCompare(b.doc_date ?? ""));
  const jeNummer = new Map<string, Doc[]>();
  for (const d of alle) {
    const k = (d.doc_number ?? "").replace(/\s+/g, "").toUpperCase();
    if (k.length < 4) continue;
    jeNummer.set(k, [...(jeNummer.get(k) ?? []), d]);
  }
  const dubletten = [...jeNummer.values()].filter((g) => g.length > 1).sort((a, b) => (a[0].doc_date ?? "").localeCompare(b[0].doc_date ?? ""));

  const zeile = (d: Doc) => (
    <>
      <td>{fmtDate(d.doc_date)}</td>
      <td>
        <Link href={`/eingangsrechnungen/${d.id}`}>{d.doc_number ?? "–"}</Link>
      </td>
      <td className="wrap">{d.supplier_name ?? "–"}</td>
      <td style={{ textAlign: "right" }}>{fmtEur(d.gross_amount)}</td>
      <td>
        <span className="tag">{d.payment_status === "paid" ? "bezahlt" : d.payment_status === "open" ? "offen" : d.payment_status}</span>{" "}
        <span className="count">{d.source}</span>
      </td>
    </>
  );

  return (
    <>
      <h1>Belegprüfung</h1>
      <p className="lead">
        Belege, deren PDF nicht zu den gespeicherten Daten passt (meist aus BuchhaltungsButler übernommen), und Rechnungsnummern,
        die mehrfach vorkommen. Korrigieren auf der Belegseite: Lieferant/Betrag ändern oder die Dublette verwerfen.
      </p>

      <h2>Abweichungen zum PDF ({abweichend.length})</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Nummer</th>
              <th>Lieferant in werk</th>
              <th style={{ textAlign: "right" }}>Betrag</th>
              <th>Status</th>
              <th>laut PDF</th>
            </tr>
          </thead>
          <tbody>
            {abweichend.map((d) => (
              <tr key={d.id}>
                {zeile(d)}
                <td className="wrap">{(d.pdf_pruefung?.abweichungen ?? []).join(" · ")}</td>
              </tr>
            ))}
            {abweichend.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Keine Abweichungen (geprüft werden Belege nach dem Lauf belege:pdf-pruefen).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Doppelte Rechnungsnummern ({dubletten.length})</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Nummer</th>
              <th>Lieferant</th>
              <th style={{ textAlign: "right" }}>Betrag</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {dubletten.map((g, i) =>
              g.map((d, j) => (
                <tr key={d.id} style={j === 0 && i > 0 ? { borderTop: "2px solid var(--border)" } : undefined}>
                  {zeile(d)}
                </tr>
              )),
            )}
            {dubletten.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Keine doppelten Rechnungsnummern.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
