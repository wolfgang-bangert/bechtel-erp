import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { LinkBookingForm, GroupLinkForm } from "../ui";

export const dynamic = "force-dynamic";

// SKR03: Aufwandskonten liegen im Bereich 3000-6999 - alles andere
// (Verbindlichkeiten/Bestand, hier v.a. 15xx/17xx) bewegt tatsächlich Geld
// und ist ein Kandidat für die Verknüpfung mit einer Bankzeile.
const isAufwand = (konto: string) => /^[3-6]/.test(konto);

export default async function LohnImportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: imp, error }, { data: bookingsRaw }] = await Promise.all([
    supabase
      .from("payroll_import")
      .select("id, file_name, period_start, period_end, mandanten_nr, row_count")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("payroll_booking")
      .select("id, position, amount, soll_haben, konto, gegenkonto, beleg_datum, belegfeld1, buchungstext, kost1, kost2")
      .eq("import_id", id)
      .order("position"),
  ]);

  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!imp) notFound();

  const bookings = bookingsRaw ?? [];
  const aufwand = bookings.filter((b) => isAufwand(b.gegenkonto));
  const bankRelevant = bookings.filter((b) => !isAufwand(b.gegenkonto));

  const { data: existingMatches } = bankRelevant.length
    ? await supabase
        .from("bank_transaction_match")
        .select("payroll_booking_id, bank_transaction_id, bank_transaction:bank_transaction_id(booking_date, amount, counterparty_name)")
        .in(
          "payroll_booking_id",
          bankRelevant.map((b) => b.id),
        )
    : { data: [] as unknown[] };
  type LinkedMatch = {
    payroll_booking_id: string | null;
    bank_transaction_id: string;
    bank_transaction: { booking_date: string; amount: number; counterparty_name: string | null } | null;
  };
  // Eine Lohnbuchung (z.B. Sammelzeile "Abzuführende SV-Beiträge") kann jetzt
  // an mehrere Bankzeilen hängen (je Krankenkasse eine) - daher Array, nicht
  // nur der letzte Treffer.
  const linkedByBooking = new Map<string, LinkedMatch[]>();
  for (const m of existingMatches ?? []) {
    const row = m as unknown as {
      payroll_booking_id: string | null;
      bank_transaction_id: string;
      bank_transaction: LinkedMatch["bank_transaction"] | LinkedMatch["bank_transaction"][];
    };
    if (!row.payroll_booking_id) continue;
    const bt = Array.isArray(row.bank_transaction) ? (row.bank_transaction[0] ?? null) : row.bank_transaction;
    const arr = linkedByBooking.get(row.payroll_booking_id) ?? [];
    arr.push({ ...row, bank_transaction: bt });
    linkedByBooking.set(row.payroll_booking_id, arr);
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const linkedSum = (id: string) =>
    r2((linkedByBooking.get(id) ?? []).reduce((s, m) => s + Math.abs(m.bank_transaction?.amount ?? 0), 0));
  const isFullyLinked = (b: (typeof bankRelevant)[number]) => Math.abs(b.amount - linkedSum(b.id)) <= 0.02;

  const openRows = bankRelevant.filter((b) => !isFullyLinked(b));
  const from = imp.period_start ? new Date(imp.period_start) : null;
  const to = imp.period_end ? new Date(imp.period_end) : null;
  if (from) from.setDate(from.getDate() - 5);
  if (to) to.setDate(to.getDate() + 20);

  const linkedTxIds = new Set((existingMatches ?? []).map((m) => (m as { bank_transaction_id: string }).bank_transaction_id));
  const { data: candidateTxns } = openRows.length
    ? await supabase
        .from("bank_transaction")
        .select("id, booking_date, amount, counterparty_name, purpose")
        .in("match_status", ["unmatched", "partial"])
        .lt("amount", 0)
        .gte("booking_date", from ? from.toISOString().slice(0, 10) : "2000-01-01")
        .lte("booking_date", to ? to.toISOString().slice(0, 10) : "2100-01-01")
    : { data: [] as { id: string; booking_date: string; amount: number; counterparty_name: string | null; purpose: string | null }[] };
  const openCandidates = (candidateTxns ?? []).filter((t) => !linkedTxIds.has(t.id));

  const suggestionFor = (amount: number, belegDatum: string | null) => {
    const hits = openCandidates.filter((t) => Math.abs(Math.abs(t.amount) - amount) <= 0.02);
    if (!hits.length) return null;
    if (!belegDatum) return hits[0];
    const target = new Date(belegDatum).getTime();
    return [...hits].sort(
      (a, b) => Math.abs(new Date(a.booking_date).getTime() - target) - Math.abs(new Date(b.booking_date).getTime() - target),
    )[0];
  };

  return (
    <>
      <p className="lead">
        <Link href="/lohnbuchungen">← Lohnbuchungen</Link>
      </p>
      <h1>
        {imp.period_start ? fmtDate(imp.period_start) : "?"} – {imp.period_end ? fmtDate(imp.period_end) : "?"}
      </h1>
      <p className="lead" style={{ marginTop: -6 }}>
        {imp.file_name} · {imp.row_count} Buchungen{imp.mandanten_nr ? ` · Mandant ${imp.mandanten_nr}` : ""}
      </p>

      <h2>Mit Bank verknüpfen</h2>
      <p className="lead" style={{ marginTop: -6 }}>
        Diese Zeilen bewegen tatsächlich Geld (Verbindlichkeiten-/Personalkonten) - hier die passende
        Bankzeile bestätigen, dann wird sie gegen das jeweilige Konto verbucht.
      </p>
      <div className="table-scroll" style={{ marginBottom: 20 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Belegdatum</th>
              <th>Gegenkonto</th>
              <th>Buchungstext</th>
              <th style={{ textAlign: "right" }}>Betrag</th>
              <th>Bankzeile</th>
            </tr>
          </thead>
          <tbody>
            {bankRelevant.map((b) => {
              const links = linkedByBooking.get(b.id) ?? [];
              const fullyLinked = isFullyLinked(b);
              const remaining = r2(b.amount - linkedSum(b.id));
              const suggestion = !fullyLinked ? suggestionFor(remaining, b.beleg_datum) : null;
              return (
                <tr key={b.id}>
                  <td>{b.beleg_datum ? fmtDate(b.beleg_datum) : "–"}</td>
                  <td className="count">{b.gegenkonto}</td>
                  <td className="wrap">{b.buchungstext ?? "–"}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(b.amount)}</td>
                  <td>
                    <div className="rows" style={{ gap: 4 }}>
                      {links.map((l) => (
                        <span key={l.bank_transaction_id} className="msg-ok" style={{ fontSize: 12 }}>
                          ✓ {l.bank_transaction?.booking_date ? fmtDate(l.bank_transaction.booking_date) : ""} ·{" "}
                          {fmtEur(l.bank_transaction?.amount ?? 0)} · {l.bank_transaction?.counterparty_name ?? ""}
                        </span>
                      ))}
                      {fullyLinked ? (
                        links.length > 1 && (
                          <span className="count" style={{ fontSize: 12 }}>
                            Summe passt ✓
                          </span>
                        )
                      ) : (
                        <>
                          {links.length > 0 && (
                            <span className="count" style={{ fontSize: 12 }}>
                              noch offen: {fmtEur(remaining)}
                            </span>
                          )}
                          {suggestion && (
                            <LinkBookingForm
                              bookingId={b.id}
                              txId={suggestion.id}
                              label={`${fmtDate(suggestion.booking_date)} · ${fmtEur(suggestion.amount)} · ${suggestion.counterparty_name ?? suggestion.purpose ?? ""}`}
                            />
                          )}
                          <GroupLinkForm
                            bookingId={b.id}
                            targetAmount={remaining}
                            candidates={openCandidates.map((c) => ({
                              id: c.id,
                              label: `${fmtDate(c.booking_date)} · ${fmtEur(c.amount)} · ${c.counterparty_name ?? c.purpose ?? ""}`,
                              amount: c.amount,
                            }))}
                          />
                          {!suggestion && links.length === 0 && (
                            <span className="count" style={{ fontSize: 12 }}>
                              kein Vorschlag
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {bankRelevant.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Keine bankrelevanten Zeilen in diesem Import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Lohnkosten</h2>
      <p className="lead" style={{ marginTop: -6 }}>
        Aufwandskonten (3000-6999), unverändert wie im Buchungsstapel - Soll/Haben-Kennzeichen beachten.
      </p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Gegenkonto</th>
              <th>Buchungstext</th>
              <th>S/H</th>
              <th style={{ textAlign: "right" }}>Betrag</th>
              <th>KOST1</th>
            </tr>
          </thead>
          <tbody>
            {aufwand.map((b) => (
              <tr key={b.id}>
                <td className="count">{b.gegenkonto}</td>
                <td className="wrap">{b.buchungstext ?? "–"}</td>
                <td>{b.soll_haben}</td>
                <td style={{ textAlign: "right" }}>{fmtEur(b.amount)}</td>
                <td className="count">{b.kost1 ?? "–"}</td>
              </tr>
            ))}
            {aufwand.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Keine Aufwandszeilen in diesem Import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
