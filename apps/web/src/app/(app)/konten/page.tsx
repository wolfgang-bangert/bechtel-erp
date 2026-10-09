import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtEur } from "@/lib/format";
import { ladeJournal } from "@/lib/konten/journal";
import { kontoNamen } from "@/lib/konten/namen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kontoabruf · werk" };

type Search = { jahr?: string; q?: string; art?: string };

/** Summen- und Saldenliste: alle bebuchten Konten eines Jahres; Klick → Kontoauszug. */
export default async function KontenPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const jahr = /^\d{4}$/.test(sp.jahr ?? "") ? sp.jahr! : String(new Date().getFullYear());
  const q = (sp.q ?? "").trim();
  const art = sp.art === "personen" ? "personen" : sp.art === "alle" ? "alle" : "sach";
  const sb = await createClient();
  const journal = await ladeJournal(`${jahr}-01-01`, `${jahr}-12-31`, sb);

  const summen = new Map<string, { soll: number; haben: number; n: number }>();
  const add = (k: string, sh: "S" | "H", b: number) => {
    if (!k) return;
    const s = summen.get(k) ?? { soll: 0, haben: 0, n: 0 };
    if (sh === "S") s.soll += b;
    else s.haben += b;
    s.n++;
    summen.set(k, s);
  };
  for (const b of journal) {
    add(b.konto, b.sh, b.betrag);
    add(b.gegenkonto, b.sh === "S" ? "H" : "S", b.betrag);
  }
  const namen = await kontoNamen(sb, [...summen.keys()]);
  const istPerson = (k: string) => /^\d{5,6}$/.test(k);
  const zeilen = [...summen.entries()]
    .filter(([k]) => (art === "alle" ? true : art === "personen" ? istPerson(k) : !istPerson(k)))
    .filter(([k]) => !q || k.startsWith(q) || (namen.get(k) ?? "").toLowerCase().includes(q.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b, "de", { numeric: true }));

  return (
    <>
      <h1>Kontoabruf</h1>
      <p className="lead">
        Summen und Salden aller Konten, die werk bebucht: Eingangs- und Ausgangsrechnungen (wie im DATEV-Export, brutto
        mit BU-Schlüssel), zugeordnete Bankbuchungen und die Lohnbuchungen. Klick auf ein Konto zeigt den Kontoauszug.
        Nicht zugeordnete Bankzeilen fehlen – so wie im DATEV-Export.
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
        <select name="art" defaultValue={art}>
          <option value="sach">Sachkonten</option>
          <option value="personen">Debitoren/Kreditoren</option>
          <option value="alle">alle</option>
        </select>
        <input name="q" defaultValue={q} placeholder="Konto oder Name, z. B. 1590" style={{ width: 220 }} />
        <button type="submit">Anzeigen</button>
        <Link href={`/konten/1590?jahr=${jahr}`}>→ 1590 Interimskonto</Link>
      </form>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Konto</th>
              <th>Bezeichnung</th>
              <th style={{ textAlign: "right" }}>Buchungen</th>
              <th style={{ textAlign: "right" }}>Soll</th>
              <th style={{ textAlign: "right" }}>Haben</th>
              <th style={{ textAlign: "right" }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(([k, s]) => {
              const saldo = Math.round((s.soll - s.haben) * 100) / 100;
              return (
                <tr key={k}>
                  <td>
                    <Link href={`/konten/${encodeURIComponent(k)}?jahr=${jahr}`}>{k}</Link>
                  </td>
                  <td className="wrap">{namen.get(k) ?? "–"}</td>
                  <td style={{ textAlign: "right" }}>{s.n}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(s.soll)}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(s.haben)}</td>
                  <td style={{ textAlign: "right" }}>
                    <strong>{Math.abs(saldo) < 0.005 ? "0,00 €" : `${fmtEur(Math.abs(saldo))} ${saldo > 0 ? "S" : "H"}`}</strong>
                  </td>
                </tr>
              );
            })}
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Keine Konten gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
