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

  // Zeilen mit demselben Gegenkonto zu einer Gruppe zusammenfassen (z.B.
  // "Abzuführende SV-Beiträge" + "SV-Differenz Vormonat/Folgemonat" landen
  // alle auf demselben Verbindlichkeiten-Konto) - dadurch saldieren sich
  // Vormonats-/Folgemonats-Korrekturen automatisch zum tatsächlich fälligen
  // Betrag, statt jede Zeile einzeln (und unvollständig) gegen die Bank
  // abgleichen zu müssen. "Konto" trägt im Buchungsstapel das Soll/Haben-
  // Kennzeichen der Zeile - das Gegenkonto hat die jeweils entgegengesetzte
  // Seite: "S" auf Konto → Gegenkonto wird im Haben angesprochen (erhöht eine
  // Verbindlichkeit, also +), "H" auf Konto → Gegenkonto im Soll (mindert
  // sie, also -).
  type Booking = (typeof bankRelevant)[number];
  type BookingGroup = { gegenkonto: string; members: Booking[]; anchor: Booking; target: number };
  const groupMap = new Map<string, Booking[]>();
  for (const b of bankRelevant) {
    const arr = groupMap.get(b.gegenkonto) ?? [];
    arr.push(b);
    groupMap.set(b.gegenkonto, arr);
  }
  const groups: BookingGroup[] = [...groupMap.entries()].map(([gegenkonto, members]) => {
    const target = r2(members.reduce((s, b) => s + (b.soll_haben === "S" ? b.amount : -b.amount), 0));
    const anchor = [...members].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    return { gegenkonto, members, anchor, target };
  });

  const linkedSumForGroup = (g: BookingGroup) =>
    r2(g.members.reduce((s, b) => s + linkedSum(b.id), 0));
  const isGroupFullyLinked = (g: BookingGroup) => Math.abs(g.target - linkedSumForGroup(g)) <= 0.02;

  const openRows = groups.filter((g) => !isGroupFullyLinked(g));
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

  // Zeilen, die schon vorher über die normale Bank-Sonderbuchung (nicht über
  // diese Seite) gegen dasselbe Sachkonto gebucht wurden - Buchung existiert
  // schon, muss nur noch nachträglich mit der Lohnbuchung verknüpft werden
  // (payroll_booking_id nachtragen), nicht doppelt anlegen.
  const openGegenkonten = [...new Set(openRows.map((b) => b.gegenkonto))];
  const { data: alreadyBookedRaw } = openGegenkonten.length
    ? await supabase
        .from("bank_transaction_match")
        .select(
          "id, amount, ledger_account, bank_transaction_id, bank_transaction:bank_transaction_id(booking_date, amount, counterparty_name)",
        )
        .in("ledger_account", openGegenkonten)
        .is("payroll_booking_id", null)
    : { data: [] as unknown[] };
  type AlreadyBooked = {
    id: string;
    amount: number;
    ledger_account: string;
    bank_transaction_id: string;
    bank_transaction: { booking_date: string; amount: number; counterparty_name: string | null } | null;
  };
  const fromIso = from ? from.toISOString().slice(0, 10) : "2000-01-01";
  const toIso = to ? to.toISOString().slice(0, 10) : "2100-01-01";
  const alreadyBookedByGegenkonto = new Map<string, AlreadyBooked[]>();
  for (const m of alreadyBookedRaw ?? []) {
    const row = m as unknown as {
      id: string;
      amount: number;
      ledger_account: string;
      bank_transaction_id: string;
      bank_transaction: AlreadyBooked["bank_transaction"] | AlreadyBooked["bank_transaction"][];
    };
    const bt = Array.isArray(row.bank_transaction) ? (row.bank_transaction[0] ?? null) : row.bank_transaction;
    if (!bt || bt.booking_date < fromIso || bt.booking_date > toIso) continue;
    const arr = alreadyBookedByGegenkonto.get(row.ledger_account) ?? [];
    arr.push({ ...row, bank_transaction: bt });
    alreadyBookedByGegenkonto.set(row.ledger_account, arr);
  }

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
            {groups.map((g) => {
              const links = g.members.flatMap((b) => linkedByBooking.get(b.id) ?? []);
              const fullyLinked = isGroupFullyLinked(g);
              const remaining = r2(g.target - linkedSumForGroup(g));
              const alreadyBooked = alreadyBookedByGegenkonto.get(g.gegenkonto) ?? [];
              const b = g.anchor;
              // Schon über die normale Sonderbuchung gebuchte Zeilen zuerst
              // vorschlagen (ist bereits eine echte Buchung, nur die
              // Verknüpfung fehlt noch) - sonst die noch offenen Bankzeilen.
              const suggestion = fullyLinked
                ? null
                : (() => {
                    const abHit = alreadyBooked.find((m) => Math.abs(Math.abs(m.amount) - remaining) <= 0.02);
                    if (abHit) {
                      return {
                        id: abHit.bank_transaction_id,
                        existingMatchId: abHit.id,
                        booking_date: abHit.bank_transaction?.booking_date ?? "",
                        amount: abHit.bank_transaction?.amount ?? abHit.amount,
                        counterparty_name: abHit.bank_transaction?.counterparty_name ?? null,
                        purpose: null as string | null,
                      };
                    }
                    const open = suggestionFor(remaining, b.beleg_datum);
                    return open ? { ...open, existingMatchId: undefined as string | undefined } : null;
                  })();
              const combinedCandidates = [
                ...alreadyBooked.map((m) => ({
                  id: m.bank_transaction_id,
                  existingMatchId: m.id as string | undefined,
                  label: `${m.bank_transaction?.booking_date ? fmtDate(m.bank_transaction.booking_date) : ""} · ${fmtEur(m.bank_transaction?.amount ?? m.amount)} · ${m.bank_transaction?.counterparty_name ?? ""} (bereits gebucht)`,
                  amount: m.bank_transaction?.amount ?? m.amount,
                })),
                ...openCandidates.map((c) => ({
                  id: c.id,
                  existingMatchId: undefined as string | undefined,
                  label: `${fmtDate(c.booking_date)} · ${fmtEur(c.amount)} · ${c.counterparty_name ?? c.purpose ?? ""}`,
                  amount: c.amount,
                })),
              ];
              return (
                <tr key={g.gegenkonto}>
                  <td>{b.beleg_datum ? fmtDate(b.beleg_datum) : "–"}</td>
                  <td className="count">{g.gegenkonto}</td>
                  <td className="wrap">
                    {g.members.map((m) => m.buchungstext).filter(Boolean).join(" + ") || "–"}
                  </td>
                  <td style={{ textAlign: "right" }}>{fmtEur(g.target)}</td>
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
                              existingMatchId={suggestion.existingMatchId}
                              label={`${fmtDate(suggestion.booking_date)} · ${fmtEur(suggestion.amount)} · ${suggestion.counterparty_name ?? suggestion.purpose ?? ""}${suggestion.existingMatchId ? " (bereits gebucht)" : ""}`}
                            />
                          )}
                          <GroupLinkForm bookingId={b.id} targetAmount={remaining} candidates={combinedCandidates} />
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
