import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { fuerKonto, ladeJournal, saldoVon } from "@/lib/konten/journal";
import { kontoNamen } from "@/lib/konten/namen";
import { KOSTEN_GRUPPEN, LOHN_PARTNER, LOHN_ZWECK, gegenkontoSoll, gruppeVon, istPersonalaufwand } from "@/lib/lohn/auswertung";
import { Drucken } from "./Drucken";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lohn-Übersicht · werk" };

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const fmtSaldo = (s: number) => (Math.abs(s) < 0.005 ? "0,00" : `${fmtEur(Math.abs(s)).replace(/\s?€/, "")} ${s > 0 ? "S" : "H"}`);
const r2 = (n: number) => Math.round(n * 100) / 100;

type P = { amount: number; soll_haben: "S" | "H"; konto: string; gegenkonto: string; beleg_datum: string | null; payroll_import: { period_end: string | null } | { period_end: string | null }[] | null };

/**
 * Lohn-Übersicht eines Jahres: Arbeitgeber-Belastung je Monat, Abgleich der Lohnkonten (Saldo am Monatsende,
 * aus Lohnstapel + ausgebuchten Bankzeilen), offene Bankzeilen mit Lohnbezug, Export für den Steuerberater.
 */
export default async function LohnUebersicht({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const sp = await searchParams;
  const jahr = /^\d{4}$/.test(sp.jahr ?? "") ? sp.jahr! : String(new Date().getFullYear());
  const sb = await createClient();

  const lohn: P[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await sb
      .from("payroll_booking")
      .select("amount, soll_haben, konto, gegenkonto, beleg_datum, payroll_import:import_id(period_end)")
      .range(f, f + 999);
    lohn.push(...((data ?? []) as P[]));
    if (!data || data.length < 1000) break;
  }
  const monatVon = (p: P) => {
    const imp = Array.isArray(p.payroll_import) ? p.payroll_import[0] : p.payroll_import;
    const d = p.beleg_datum ?? imp?.period_end ?? "";
    return d.startsWith(jahr) ? Number(d.slice(5, 7)) - 1 : -1;
  };

  // 1) Kosten je Monat und Gruppe
  const kosten = new Map<string, number[]>(KOSTEN_GRUPPEN.map((g) => [g.key, new Array(12).fill(0)]));
  const lohnMonate = new Set<number>();
  for (const p of lohn) {
    const m = monatVon(p);
    if (m < 0) continue;
    lohnMonate.add(m);
    const g = gruppeVon(p.gegenkonto);
    if (g) kosten.get(g)![m] += gegenkontoSoll(p);
  }
  const summeMonat = new Array(12).fill(0).map((_, m) => r2(KOSTEN_GRUPPEN.reduce((s, g) => s + kosten.get(g.key)![m], 0)));
  const jahresSumme = r2(summeMonat.reduce((a, b) => a + b, 0));

  // 2) Abgleich der Lohnkonten: alle Nicht-Aufwands-Gegenkonten des Stapels + 1755
  const lohnKonten = [...new Set(["1755", ...lohn.filter((p) => monatVon(p) >= 0 && !istPersonalaufwand(p.gegenkonto)).map((p) => p.gegenkonto)])].sort();
  const journal = await ladeJournal(`${jahr}-01-01`, `${jahr}-12-31`, sb);
  const abgleich = lohnKonten.map((k) => {
    const z = fuerKonto(journal, k);
    const monatsEnde = MONATE.map((_, i) => saldoVon(z.filter((b) => b.datum <= new Date(Date.UTC(+jahr, i + 1, 0)).toISOString().slice(0, 10))));
    const bank = z.filter((b) => b.quelle === "bank").length;
    return { konto: k, monatsEnde, bank };
  });
  const namen = await kontoNamen(sb, lohnKonten);
  const letzterMonat = Math.max(...lohnMonate, -1);

  // 3) offene Bankzeilen mit Lohnbezug
  const { data: offen } = await sb
    .from("bank_transaction")
    .select("id, booking_date, amount, counterparty_name, purpose, match_status")
    .in("match_status", ["unmatched", "partial"])
    .lt("amount", 0)
    .gte("booking_date", `${jahr}-01-01`)
    .lte("booking_date", `${jahr}-12-31`)
    .order("booking_date")
    .limit(2000);
  const offeneLohn = (offen ?? []).filter((t) => LOHN_PARTNER.test(t.counterparty_name ?? "") || LOHN_ZWECK.test(t.purpose ?? ""));

  const bisMonat = String(Math.max(letzterMonat, 0) + 1).padStart(2, "0");

  return (
    <>
      <h1>Lohn-Übersicht {jahr}</h1>
      <p className="lead">
        Aus den importierten Lohnbuchungen und den in <Link href="/bank">Bank</Link> auf Lohnkonten ausgebuchten
        Zahlungen. Bankzeilen bucht du wie gewohnt direkt auf das Lohnkonto aus (z. B. Krankenkassen auf 1742) – der
        Abgleich läuft über den Kontosaldo.
      </p>
      <form className="toolbar no-print" method="get">
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
        <button type="submit">Anzeigen</button>
        <span style={{ flex: 1 }} />
        <a className="bd-btn bd-btn-secondary" href={`/api/lohn/datev?jahr=${jahr}&von=01&bis=${bisMonat}`}>
          ⬇ DATEV-Buchungsstapel Jan–{MONATE[+bisMonat - 1]} {jahr}
        </a>
        <Drucken />
      </form>

      <h2>Lohnkosten je Monat (Arbeitgeber-Belastung)</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th></th>
              {MONATE.map((m) => (
                <th key={m} style={{ textAlign: "right" }}>
                  {m}
                </th>
              ))}
              <th style={{ textAlign: "right" }}>Jahr</th>
            </tr>
          </thead>
          <tbody>
            {KOSTEN_GRUPPEN.map((g) => {
              const w = kosten.get(g.key)!;
              const summe = r2(w.reduce((a, b) => a + b, 0));
              if (Math.abs(summe) < 0.005 && w.every((x) => Math.abs(x) < 0.005)) return null;
              return (
                <tr key={g.key}>
                  <td className="wrap">{g.label}</td>
                  {w.map((x, i) => (
                    <td key={i} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {lohnMonate.has(i) ? fmtEur(r2(x)).replace(/\s?€/, "") : "–"}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtEur(summe)}</td>
                </tr>
              );
            })}
            <tr>
              <td>
                <strong>AG-Belastung gesamt</strong>
              </td>
              {summeMonat.map((x, i) => (
                <td key={i} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <strong>{lohnMonate.has(i) ? fmtEur(x).replace(/\s?€/, "") : "–"}</strong>
                </td>
              ))}
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <strong>{fmtEur(jahresSumme)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Abgleich der Lohnkonten (Saldo am Monatsende)</h2>
      <p className="count">
        S = Soll, H = Haben. Bei Verbindlichkeiten ist ein Haben-Saldo am Monatsende normal, wenn die Zahlung erst im
        Folgemonat fällig ist (z. B. Lohnsteuer bis zum 10.). Ein Saldo, der über mehrere Monate stehen bleibt oder
        wächst, zeigt eine fehlende oder falsch ausgebuchte Zahlung. Klick aufs Konto zeigt den Kontoauszug.
      </p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Konto</th>
              {MONATE.map((m) => (
                <th key={m} style={{ textAlign: "right" }}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {abgleich.map((a) => (
              <tr key={a.konto}>
                <td className="wrap">
                  <Link href={`/konten/${a.konto}?jahr=${jahr}`}>{a.konto}</Link> <span className="count">{namen.get(a.konto) ?? ""}</span>
                  {a.bank === 0 && <span className="tag" title="noch keine Bankzeile auf dieses Konto ausgebucht"> ohne Bank</span>}
                </td>
                {a.monatsEnde.map((s, i) => (
                  <td
                    key={i}
                    style={{ textAlign: "right", whiteSpace: "nowrap", color: i > letzterMonat ? "var(--muted)" : Math.abs(s) < 0.005 ? undefined : "var(--warn, #b45309)" }}
                  >
                    {i > letzterMonat ? "–" : fmtSaldo(s)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="no-print">Offene Bankzeilen mit Lohnbezug ({offeneLohn.length})</h2>
      <div className="table-scroll no-print">
        <table className="data">
          <tbody>
            {offeneLohn.map((t) => (
              <tr key={t.id}>
                <td>{fmtDate(t.booking_date)}</td>
                <td className="wrap">{t.counterparty_name}</td>
                <td className="wrap count">{(t.purpose ?? "").slice(0, 90)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtEur(t.amount)}</td>
                <td>
                  <Link href={`/bank?tx=${t.id}`}>ausbuchen →</Link>
                </td>
              </tr>
            ))}
            {offeneLohn.length === 0 && (
              <tr>
                <td style={{ color: "var(--muted)" }}>Keine offenen Bankzeilen mit Lohnbezug.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
