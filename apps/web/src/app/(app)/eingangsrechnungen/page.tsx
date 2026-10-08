import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { UploadForm } from "./UploadForm";
import { ListeSteuerung } from "./ListeSteuerung";
import { buchungsProbleme, schluesselInfo } from "@/lib/belegPruefung";
import { applyListFilters, kontoJoin, monthRange, sortSpec } from "./_liste";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  captured: "erfasst",
  extracted: "extrahiert",
  reviewed: "gebucht", // früher "geprüft" - wird zu "gebucht" umgestellt
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

const LISTEN_SELECT =
  "id, file_name, doc_number, doc_type, doc_date, gross_amount, payment_method, payment_status, status, supplier_name, supplier_organization_id, email_from, advice_reference, advice_debit_date, ledger_account, tax_code_id, net_amount, tax_amount, created_at, colleague_checked_at, colleague_checked_by, ust_status:extraction->_ust->>status, incoming_document_item!incoming_document_item_incoming_document_id_fkey ( ledger_account, tax_code_id, linked_document_id, net_amount, tax_rate )" as const;

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
    konto?: string;
    verworfen?: string;
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
  const sort = sp.sort === "supplier" ? "supplier" : sp.sort === "eingang" ? "eingang" : "date";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const ascending = dir === "asc";

  const supabase = await createClient();
  // Gleiche Filter für die Liste und die Summenzeile (alle Seiten, nicht nur die angezeigte).
  const kontoLeer = sp.konto === "leer";
  const zeigeVerworfen = sp.verworfen === "1";
  const applyFilters = <T extends { eq: Function; not: Function; gte: Function; lt: Function; or: Function; is: Function }>(q: T): T =>
    applyListFilters(q, sp);
  let query = applyFilters(
    supabase
      .from("incoming_document")
      .select((LISTEN_SELECT + kontoJoin(sp)) as typeof LISTEN_SELECT, { count: "exact" },
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
      supabase.from("incoming_document").select(("net_amount, doc_type" + kontoJoin(sp)) as "net_amount, doc_type").range(from, from + 999),
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
  const { data: steuerCodes } = await supabase.from("tax_code").select("id, code, rate, treatment");
  const schluessel = schluesselInfo(steuerCodes ?? []);
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

  const kollegenIds = Array.from(new Set((data ?? []).map((d) => d.colleague_checked_by).filter((x): x is string => !!x)));
  const kollegenName = new Map<string, string>();
  if (kollegenIds.length) {
    const { data: us } = await supabase.from("app_user").select("id, display_name, email").in("id", kollegenIds);
    for (const u of us ?? []) kollegenName.set(u.id, u.display_name || u.email || "?");
  }
  const { data: alleKonten } = await supabase.from("ledger_account").select("number, name").eq("is_active", true).order("number");

  const baseParams = () => {
    const u = new URLSearchParams();
    if (status) u.set("status", status);
    if (search) u.set("q", search);
    if (paymentMethod) u.set("payment_method", paymentMethod);
    if (range) u.set("monat", monat);
    if (ustOffen) u.set("ust", "offen");
    if (kontoLeer) u.set("konto", "leer");
    if (zeigeVerworfen) u.set("verworfen", "1");
    if (sort !== "date") u.set("sort", sort);
    if (dir !== "desc") u.set("dir", dir);
    return u;
  };
  const listeQuery = baseParams().toString();
  const sortHref = (field: "date" | "supplier" | "eingang") => {
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
  const sortIndicator = (field: "date" | "supplier" | "eingang") => (sort === field ? (dir === "asc" ? " ▲" : " ▼") : "");

  const [{ count: adviceCount }, { count: dunningCount }, { count: openCount }, { count: ustCount }] = await Promise.all([
    supabase.from("incoming_document").select("id", { count: "exact", head: true }).eq("status", "advice"),
    supabase.from("incoming_document").select("id", { count: "exact", head: true }).eq("status", "dunning"),
    supabase
      .from("incoming_document")
      .select("id", { count: "exact", head: true })
      .eq("status", "extracted"),
    supabase
      .from("incoming_document")
      .select("id", { count: "exact", head: true })
      .in("status", ["captured", "extracted", "booked"])
      .eq("extraction->_ust->>status", "vorschlag"),
  ]);

  return (
    <div className="bd-page content-wide">
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
          <div className="l">zu buchen</div>
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
        <div style={{ marginTop: 6, fontSize: 13 }}>
          Papierrechnung? <Link href="/scannen">📷 Mit dem Handy scannen →</Link>
        </div>
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
            <option value="">Rechnungen (ohne Avis/Sonstiges)</option>
            <option value="alle">Alle</option>
            {Object.entries(STATUS)
              .filter(([k]) => k !== "reviewed")
              .map(([k, v]) => (
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
        <div className="bd-field">
          <label className="bd-field-label">Konto</label>
          <select className="bd-field-input" name="konto" defaultValue={kontoLeer ? "leer" : ""}>
            <option value="">alle</option>
            <option value="leer">ohne Konto</option>
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--bd-ink-muted)", alignSelf: "flex-end", paddingBottom: 8 }}>
          <input type="checkbox" name="verworfen" value="1" defaultChecked={zeigeVerworfen} /> verworfene anzeigen
        </label>
        {ustOffen && <input type="hidden" name="ust" value="offen" />}
        {sort !== "date" && <input type="hidden" name="sort" value={sort} />}
        {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
        <button className="bd-btn bd-btn-secondary" type="submit">Filtern</button>
        {(status || search || paymentMethod || range || ustOffen || kontoLeer || zeigeVerworfen) && <Link href="/eingangsrechnungen">zurücksetzen</Link>}
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

      {!isHint && (
        <ListeSteuerung
          konten={(alleKonten ?? []).map((a) => ({ value: a.number, label: `${a.number} – ${a.name}` }))}
        />
      )}

      <div className="table-scroll">
        <table className="bd-table">
          <thead>
            <tr>
              {!isHint && (
                <th style={{ width: 28 }}>
                  <input type="checkbox" className="row-check-all" aria-label="alle auswählen" />
                </th>
              )}
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
              <th>
                <Link href={sortHref("eingang")}>Eingang{sortIndicator("eingang")}</Link>
              </th>
              <th className="bd-num">
                {isAdvice ? "Lastschrift" : isDunning ? "Betrag" : "Brutto"}
              </th>
              {!isHint && <th>Status</th>}
              {!isHint && <th>Konto</th>}
              <th>{isHint ? "bezieht sich auf" : "Zahlung"}</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => {
              const isPaid = d.payment_status === "paid" || d.payment_status === "overpaid";
              const isBooked = d.status === "booked" || d.status === "exported";
              const orgMethod = d.supplier_organization_id ? ruleMethodByOrg.get(d.supplier_organization_id) : null;
              const probleme = buchungsProbleme({ ...d, items: d.incoming_document_item ?? [] }, { ohneUst: true, schluessel });
              const offen = d.status === "captured" || d.status === "extracted";
              const bereit =
                !isHint && offen && ["invoice", "credit_note", "receipt"].includes(d.doc_type) &&
                probleme.length === 0 && !!(d.payment_method || orgMethod) && d.ust_status !== "vorschlag";
              return (
                <tr key={d.id}>
                  {!isHint && (
                    <td>
                      {offen && ["invoice", "credit_note", "receipt"].includes(d.doc_type) ? (
                        <input type="checkbox" className="row-check" data-id={d.id} data-bereit={bereit ? "1" : "0"} aria-label="auswählen" />
                      ) : null}
                    </td>
                  )}
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
                  <td className="bd-sub" title={new Date(d.created_at).toLocaleString("de-DE")}>{fmtDate(d.created_at)}</td>
                  <td className="bd-num">
                    {fmtEur(d.doc_type === "credit_note" ? -Math.abs(d.gross_amount ?? 0) : d.gross_amount)}
                  </td>
                  {!isHint && (
                    <td className="wrap">
                      <span className={"bd-status " + (isBooked || d.status === "reviewed" ? "t-success" : "t-warning")}>
                        <span className="bd-status-mark" />
                        {STATUS[d.status] ?? d.status}
                      </span>
                      {bereit && (
                        <span className="bd-status t-info" style={{ marginLeft: 6 }} title="Konto, Steuerschlüssel, Zahlart und Summen sind vollständig - bereit zum Buchen">
                          <span className="bd-status-mark" />
                          bereit
                        </span>
                      )}
                      {isBooked && probleme.length > 0 && (
                        <span className="bd-status t-danger" style={{ marginLeft: 6 }} title={probleme.join("\n")}>
                          <span className="bd-status-mark" />
                          Abweichung
                        </span>
                      )}
                      {d.colleague_checked_at && (
                        <span
                          className="bd-sub"
                          style={{ marginLeft: 6 }}
                          title={`von Kollegen gesehen: ${new Date(d.colleague_checked_at).toLocaleDateString("de-DE")}${d.colleague_checked_by && kollegenName.get(d.colleague_checked_by) ? `, ${kollegenName.get(d.colleague_checked_by)}` : ""}`}
                        >
                          👁
                        </span>
                      )}
                    </td>
                  )}
                  {!isHint && (
                    <td className="wrap bd-sub">
                      {(() => {
                        const k = kontenVon(d);
                        if (!k.length) return "–";
                        const label = (nr: string) => `${nr}${kontoName.get(nr) ? ` ${kontoName.get(nr)}` : ""}`;
                        return k.length === 1 ? label(k[0]) : `${label(k[0])} +${k.length - 1}`;
                      })()}
                      {["captured", "extracted"].includes(d.status) && (
                        <button type="button" className="konto-edit" data-id={d.id} data-konto={kontenVon(d)[0] ?? ""} title="Konto für alle Positionen setzen" style={{ marginLeft: 6, border: "none", background: "none", cursor: "pointer" }}>
                          ✎
                        </button>
                      )}
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
