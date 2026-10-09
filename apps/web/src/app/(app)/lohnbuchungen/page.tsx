import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { UploadForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function LohnbuchungenPage() {
  const supabase = await createClient();
  const { data: imports, error } = await supabase
    .from("payroll_import")
    .select("id, file_name, period_start, period_end, row_count, created_at")
    .order("period_end", { ascending: false });

  return (
    <>
      <h1>Lohnbuchungen</h1>
      <p className="lead">
        Monatlicher DATEV-Buchungsstapel vom Lohnabrechner (Verrechnungskonto 1755) - für die
        Lohnkosten-Auswertung importiert, die tatsächlichen Bankbewegungen (Überweisung, SV-Beiträge,
        Lohnsteuer, …) verknüpfst du je Import mit der passenden Bankzeile.
      </p>

      <p>
        <Link href="/lohnbuchungen/uebersicht">→ Lohn-Übersicht</Link> (Lohnkosten je Monat, Abgleich der Lohnkonten,
        DATEV-Export für den Steuerberater) · <Link href="/konten">→ Kontoabruf</Link>
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <UploadForm />
      </div>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Zeitraum</th>
              <th>Datei</th>
              <th style={{ textAlign: "right" }}>Buchungen</th>
              <th>importiert am</th>
            </tr>
          </thead>
          <tbody>
            {(imports ?? []).map((i) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/lohnbuchungen/${i.id}`}>
                    {i.period_start ? fmtDate(i.period_start) : "?"} – {i.period_end ? fmtDate(i.period_end) : "?"}
                  </Link>
                </td>
                <td className="wrap count">{i.file_name}</td>
                <td style={{ textAlign: "right" }}>{i.row_count}</td>
                <td className="count">{fmtDate(i.created_at)}</td>
              </tr>
            ))}
            {(imports ?? []).length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "var(--muted)" }}>
                  Noch keine Lohnbuchungen importiert.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
