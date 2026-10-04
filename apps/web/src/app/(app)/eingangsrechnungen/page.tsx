import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { UploadForm } from "./UploadForm";
import { applyListFilters, monthRange, sortSpec } from "./_liste";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  captured: "erfasst",
  extracted: "extrahiert",
  reviewed: "geprüft",
  booked: "gebucht",
  exported: "exportiert",
  rejected: "verworfen",
  advice: "Zahlungsavis",
  dunning: "Sonstiges",
};

// Hinweisbelege: keine zu buchenden Rechnungen, eigener Blick.
const HINT = new Set(["advice", "dunning"]);

const PAYMENT_LABEL: Record<string, string> = {
  card: "Kreditkarte",
  paypal: "PayPal",
  transfer: "Überweisung",
  direct_debit: "Lastschrift",
};

const PAGE_SIZE = 200;

export default async function EingangsrechnungenPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    dir?: string;
    payment_method?: string;
    monat?: string;
    seite?: string;
    ust?: string;
  }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";
  const search = (sp.q ?? "").trim();
  const paymentMethod = sp.payment_method ?? "";
  const monat = sp.monat ?? "";
  const ustOffen = sp.ust === "offen";
  const range = monthRange(monat);
  const seite = Math.max(1, Number.parseInt(sp.seite ?? "1", 10) || 1);
  const isHint = HINT.has(status);
  const isAdvice = status === "advice";
  const isDunning = status === "dunning";
  const sort = sp.sort === "supplier" ? "supplier" : "date";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const ascending = dir === "asc";

  const supabase = await createClient();
  // Gleiche Filter für die Liste und die Summenzeile (alle Seiten, nicht nur die angezeigte).
  const applyFilters = <T extends { eq: Function; not: Function; gte: Function; lt: Function; or: Function }>(q: T): T =>
    applyListFilters(q, sp);
  let query = applyFilters(
    supabase
      .from("incoming_document")
      .select(
        "id, file_name, doc_number, doc_type, doc_date, gross_amount, payment_method, payment_status, status, supplier_name, supplier_organization_id, email_from, advice_reference, advice_debit_date, ledger_account, ust_status:extraction->_ust->>status, incoming_document_item!incoming_document_item_incoming_document_id_fkey ( ledger_account )",
        { count: "exact" },
      )
      .range((seite - 1) * PAGE_SIZE, seite * PAGE_SIZE - 1),
  );
  const { column: sortColumn } = sortSpec(sp);
  query = query.order(sortColumn, { ascending, nullsFirst: false }).order("id");
  const { data, count, error } = await query;

  // Nettosumme über alle gefilterten Belege (Gutschriften negativ).
  let netSum = 0;
  for (let from = 0; ; from += 1000) {
    const { data: rows } = await applyFilters(
      supabase.from("incoming_document").select("net_amount, doc_type").range(from, from + 999),
    );
    for (const r of rows ?? []) {
      const n = Number(r.net_amount ?? 0);
      netSum += r.doc_type === "credit_note" ? -Math.abs(n) : n;
    }
    if ((rows ?? []).length < 1000) break;
  }

  // Zahlart-Vorschlag je Lieferant (Vorkontierung an der Organisation) für Belege ohne eigene
  // Angabe - nur zur Anzeige, nicht geraten (siehe Vorfall: vorher wurde
  // ungeprüft "Lastschrift" angenommen, auch wenn z.B. eine Überweisungs-
  // Regel existierte).
  const orgIds = Array.from(
    new Set((data ?? []).map((d) => d.supplier_organization_id).filter((x): x is string => !!x)),
  );
  const ruleMethodByOrg = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await supabase
      .from("organization")
      .select("id, default_payment_method")
      .in("id", orgIds)
      .not("default_payment_method", "is", null);
    for (const o of orgs ?? []) {
      if (o.default_payment_method) ruleMethodByOrg.set(o.id, o.default_payment_method);
    }
  }

  // Konten (aus den Positionen, sonst am Beleg) mit Bezeichnung für die Spalte "Konto"
  const kontenVon = (d: NonNullable<typeof data>[number]): string[] => {
    const fromItems = (d.incoming_document_item ?? []).map((i) => i.ledger_account).filter((x): x is string => !!x);
    return Array.from(new Set(fromItems.length ? fromItems : d.ledger_account ? [d.ledger_account] : []));
  };
  const kontoNr = Array.from(new Set((data ?? []).flatMap(kontenVon)));
  const kontoName = new Map<string, string>();
  if (kontoNr.length) {
    const { data: la } = await supabase.from("ledger_account").select("number, name").in("number", kontoNr);
    for (const a of la ?? []) kontoName.set(a.number, a.name);
  }

  const baseParams = () => {
    const u = new URLSearchParams();
    if (status) u.set("status", status);
    if (search) u.set("q", search);
    if (paymentMethod) u.set("payment_method", paymentMethod);
    if (range) u.set("monat", monat);
    if (ustOffen) u.set("ust", "offen");
    if (sort !== "date") u.set("sort", sort);
    if (dir !== "desc") u.set("dir", dir);
    return u;
  };
  const listeQuery = baseParams().toString();
  const sortHref = (field: "date" | "supplier") => {
    const u = baseParams();
    u.set("sort", field);
    u.set("dir", sort === field && dir === "asc" ? "desc" : "asc");
    return `/eingangsrechnungen?${u.toString()}`;
  };
  const pageHref = (n: number) => {
    const u = baseParams();
    if (n > 1) u.set("seite", String(n));
    return `/eingangsrechnungen?${u.toString()}`;
  };
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const sortIndicator = (field: "date" | "supplier") => (sort === field ? (dir === "asc" ? " ▲" : " ▼") : "");

  const [{ count: adviceCount }, { count: dunningCount }, { count: openCount }, { count: ustCount }] = await Promise.all([
    supabase.from("incoming_document").select("id", { count: "exact", head: true }).eq("status", "advice"),
    supabase.from("incoming_document").select("id", { count: "exact", head: true }).eq("status", "dunning"),
    supabase
      .from("incoming_document")
      .select("id", { count: "exact", head: true })
      .in("status", ["captured", "extracted"]),
    supabase
      .from("incoming_document")
      .select("id", { count: "exact", head: true })
      .in("status", ["captured", "extracted", "reviewed"])
      .eq("extraction->_ust->>status", "vorschlag"),
  ]);

  return (
    <div className="bd-page">
      <h1>Eingangsrechnungen</h1>
      <p className="bd-lead">
        Aus dem Postfach <code>rechnungen@bechtel-druck.de</code>, per KI
        vorerfasst. Prüfen → kontieren → für DATEV freigeben.
      </p>

      <div className="bd-stat-row">
        <Link
          href="/eingangsrechnungen?status=extracted"
          className={"bd-stat-card" + ((openCount ?? 0) > 0 ? " warn" : "")}
        >
          <div className="n">{openCount ?? 0}</div>
          <div className="l">zu prüfen</div>
        </Link>
        <Link
          href="/eingangsrechnungen?ust=offen"
          className={"bd-stat-card" + ((ustCount ?? 0) > 0 ? " warn" : "")}
        >
          <div className="n">{ustCount ?? 0}</div>
          <div className="l">USt bestätigen</div>
        </Link>
        <Link href="/eingangsrechnungen?status=advice" className="bd-stat-card">
          <div className="n">{adviceCount ?? 0}</div>
          <div className="l">Zahlungsavis</div>
        </Link>
        <Link
          href="/eingangsrechnungen?status=dunning"
          className={"bd-stat-card" + ((dunningCount ?? 0) > 0 ? " danger" : "")}
        >
          <div className="n">{dunningCount ?? 0}</div>
          <div className="l">Sonstiges</div>
        </Link>
      </div>

      <div style={{ marginBottom: 14 }}>
        <UploadForm />
      </div>

      <form className="bd-toolbar" method="get">
        <div className="bd-field">
          <label className="bd-field-label">Suche</label>
          <input
            className="bd-field-input"
            name="q"
            defaultValue={search}
            placeholder="Lieferant, Absender…"
            style={{ minWidth: 220 }}
          />
        </div>
        <div className="bd-field">
          <label className="bd-field-label">Status</label>
          <select className="bd-field-input" name="status" defaultValue={status}>
            <option value="">offene Rechnungen</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="bd-field">
          <label className="bd-field-label">Zahlart</label>
          <select className="bd-field-input" name="payment_method" defaultValue={paymentMethod}>
            <option value="">alle Zahlarten</option>
            <option value="transfer">Überweisung</option>
            <option value="direct_debit">Lastschrift</option>
            <option value="card">Kreditkarte</option>
            <option value="paypal">PayPal</option>
          </select>
        </div>
        <div className="bd-field">
          <label className="bd-field-label">Monat (Belegdatum)</label>
          <input className="bd-field-input" type="month" name="monat" defaultValue={range ? monat : ""} />
        </div>
        {ustOffen && <input type="hidden" name="ust" value="offen" />}
        {sort !== "date" && <input type="hidden" name="sort" value={sort} />}
        {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
        <button className="bd-btn bd-btn-secondary" type="submit">Filtern</button>
        {(status || search || paymentMethod || range || ustOffen) && <Link href="/eingangsrechnungen">zurücksetzen</Link>}
        <div className="bd-spacer" />
        <span style={{ color: "var(--bd-ink-muted)", fontSize: 13, fontFamily: "var(--font-bd-sans)" }}>
          {count ?? 0} Belege · Netto {fmtEur(netSum)}
        </span>
      </form>

      {isAdvice && (
        <p className="bd-lead">
          Zahlungs-/Lastschriftavis — <strong>keine</strong> zu buchenden
          Rechnungen. Sie nennen die Rechnungsnummer(n) und das Belastungsdatum
          und helfen beim Kontoauszug-Abgleich.
        </p>
      )}
      {isDunning && (
        <p className="bd-lead">
          Sonstiges — Mahnungen, AGB, Werbung, Angebote und andere Dokumente ohne Buchungsrelevanz,
          <strong> keine</strong> zu buchenden Rechnungen. Werden zusätzlich per E-Mail weitergeleitet.
          Ist eines doch eine Rechnung: öffnen und „Als Rechnung behandeln" wählen.
        </p>
      )}

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="bd-table">
          <thead>
            <tr>
              <th>Beleg</th>
              <th>
                <Link href={sortHref("supplier")}>Lieferant{sortIndicator("supplier")}</Link>
              </th>
              <th>
                <Link href={sortHref("date")}>
                  {isAdvice ? "Belastung am" : "Datum"}
                  {sortIndicator("date")}
                </Link>
              </th>
              <th className="bd-num">
                {isAdvice ? "Lastschrift" : isDunning ? "Betrag" : "Brutto"}
              </th>
              {!isHint && <th>Konto</th>}
              <th>{isHint ? "bezieht sich auf" : "bezahlt"}</th>
              <th>{isHint ? "" : "gebucht"}</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => {
              const isPaid = d.payment_status === "paid" || d.payment_status === "overpaid";
              const isBooked = d.status === "booked" || d.status === "exported";
              return (
                <tr key={d.id}>
                  <td className="wrap">
                    <Link href={`/eingangsrechnungen/${d.id}${listeQuery ? `?l=${encodeURIComponent(listeQuery)}` : ""}`}>
                      {d.doc_number ?? d.file_name ?? d.id.slice(0, 8)}
                    </Link>
                    {d.ust_status === "vorschlag" && (
                      <span className="bd-status t-warning" style={{ marginLeft: 8 }} title="USt-Schlüssel noch nicht bestätigt">
                        <span className="bd-status-mark" />
                        USt?
                      </span>
                    )}
                  </td>
                  <td className="wrap">{d.supplier_name ?? d.email_from ?? "–"}</td>
                  <td>{fmtDate(isAdvice ? d.advice_debit_date : d.doc_date)}</td>
                  <td className="bd-num">
                    {fmtEur(d.doc_type === "credit_note" ? -Math.abs(d.gross_amount ?? 0) : d.gross_amount)}
                  </td>
                  {!isHint && (
                    <td className="wrap bd-sub">
                      {(() => {
                        const k = kontenVon(d);
                        if (!k.length) return "–";
                        const label = (nr: string) => `${nr}${kontoName.get(nr) ? ` ${kontoName.get(nr)}` : ""}`;
                        return k.length === 1 ? label(k[0]) : `${label(k[0])} +${k.length - 1}`;
                      })()}
                    </td>
                  )}
                  <td className="wrap">
                    {isHint ? (
                      (d.advice_reference ?? []).join(", ") || "–"
                    ) : isPaid ? (
                      <span className="bd-status t-success">
                        <span className="bd-status-mark" />
                        bezahlt
                      </span>
                    ) : (
                      (() => {
                        const method =
                          d.payment_method ??
                          (d.supplier_organization_id
                            ? ruleMethodByOrg.get(d.supplier_organization_id)
                            : null);
                        return (
                          <span className="bd-sub">
                            {method ? (PAYMENT_LABEL[method] ?? method) : "–"}
                          </span>
                        );
                      })()
                    )}
                  </td>
                  <td>
                    {isHint ? (
                      ""
                    ) : isBooked ? (
                      <span className="bd-status t-success">
                        <span className="bd-status-mark" />
                        gebucht
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--bd-ink-muted)" }}>
                  Noch keine Belege. CLI:{" "}
                  <code>pnpm --filter sync mail:fetch</code> →{" "}
                  <code>pnpm --filter sync incoming:extract</code>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="bd-toolbar" style={{ marginTop: 14 }}>
          {seite > 1 && (
            <Link className="bd-btn bd-btn-secondary" href={pageHref(seite - 1)}>← zurück</Link>
          )}
          <span style={{ color: "var(--bd-ink-muted)", fontSize: 13, fontFamily: "var(--font-bd-sans)" }}>
            Seite {seite} von {pages} · Belege {(seite - 1) * PAGE_SIZE + 1}–{Math.min(seite * PAGE_SIZE, count ?? 0)} von {count}
          </span>
          {seite < pages && (
            <Link className="bd-btn bd-btn-secondary" href={pageHref(seite + 1)}>weiter →</Link>
          )}
        </div>
      )}
    </div>
  );
}
