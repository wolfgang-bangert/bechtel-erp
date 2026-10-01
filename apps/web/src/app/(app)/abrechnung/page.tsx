import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ErstellenForm } from "./ErstellenForm";

export const dynamic = "force-dynamic";

function lastCompletedIsoWeek(): { jahr: number; kw: number } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7); // Vorwoche
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // Donnerstag der Woche
  const jahr = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(jahr, 0, 1));
  const kw = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return { jahr, kw };
}

export default async function AbrechnungListe() {
  const supabase = await createClient();
  const [{ data }, { data: portal }] = await Promise.all([
    supabase
      .from("abrechnung")
      .select("id, jahr, kw, von, bis, status, summe_netto, positionen:abrechnung_position(count)")
      .order("jahr", { ascending: false })
      .order("kw", { ascending: false }),
    supabase.from("portal").select("organization_id").eq("code", "onlineprinters").maybeSingle(),
  ]);
  const rows = (data ?? []) as unknown as {
    id: string;
    jahr: number;
    kw: number;
    von: string;
    bis: string;
    status: string;
    summe_netto: number;
    positionen: { count: number }[];
  }[];
  const { jahr, kw } = lastCompletedIsoWeek();

  const { data: offeneRechnung } = portal?.organization_id
    ? await supabase
        .from("invoice")
        .select("id, net_total, positionen:invoice_item(count)")
        .eq("organization_id", portal.organization_id)
        .eq("status", "offen")
        .maybeSingle()
    : { data: null };
  const offeneRechnungZeilen = (offeneRechnung as unknown as { positionen: { count: number }[] } | null)
    ?.positionen?.[0]?.count ?? 0;

  return (
    <>
      <h1>Wochen-Abrechnung OnlinePrinters</h1>
      <p className="lead">
        Je Kalenderwoche werden alle Portal-Aufträge mit <strong>Versanddatum</strong> in der Woche
        erfasst. „Nicht berechnen" / Reklamation erscheinen als 0-€-Zeile (Betrag manuell setzbar,
        z.B. Teilschuld).
      </p>

      {offeneRechnung ? (
        <div className="banner-info">
          Offene Sammelrechnung Onlineprinters: {offeneRechnungZeilen}{" "}
          {offeneRechnungZeilen === 1 ? "Woche" : "Wochen"}, {Number(offeneRechnung.net_total).toFixed(2)} € netto
          {" — "}
          <Link href={`/abrechnung/rechnung/${offeneRechnung.id}`}>ansehen / abschließen</Link>
        </div>
      ) : (
        <p className="lead">Keine offene Sammelrechnung Onlineprinters.</p>
      )}

      <ErstellenForm jahr={jahr} kw={kw} />

      <div className="table-scroll" style={{ marginTop: 14 }}>
        <table className="data">
          <thead>
            <tr>
              <th>KW</th>
              <th>Zeitraum</th>
              <th style={{ textAlign: "right" }}>Positionen</th>
              <th style={{ textAlign: "right" }}>Summe netto</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/abrechnung/${r.id}`}>
                    KW {r.kw}/{r.jahr}
                  </Link>
                </td>
                <td className="count">
                  {r.von} – {r.bis}
                </td>
                <td style={{ textAlign: "right" }}>{r.positionen?.[0]?.count ?? 0}</td>
                <td style={{ textAlign: "right" }}>{Number(r.summe_netto).toFixed(2)} €</td>
                <td>
                  <span className="tag">{r.status}</span>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>Noch keine Abrechnungen.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
