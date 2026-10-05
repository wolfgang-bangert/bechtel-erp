import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { ReviewForm } from "./ui";
import { setIncomingStatus, bestaetigeUst, alsRechnungBehandeln, alsSonstigesBehandeln, kollegenGesehen } from "../actions";
import { applyListFilters, sortSpec, type ListeParams } from "../_liste";

export const dynamic = "force-dynamic";

type AllocRow = {
  id: string;
  link_type: string;
  sales_order_id: string | null;
  material_ref: string | null;
  cost_center_id: string | null;
  amount: number | null;
  note: string | null;
  order_ref: string | null;
  sales_order: { order_number: string | null } | null;
};

type ItemRow = {
  id: string;
  position: number | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  tax_rate: number | null;
  net_amount: number | null;
  ledger_account: string | null;
  tax_code_id: string | null;
  material_ref: string | null;
  supplier_sku: string | null;
  order_reference: string | null;
  linked_document_id: string | null;
  incoming_document_allocation: AllocRow[];
};

// Keyline-Schreibweise: "W7MN2S" -> "W7-MN-2S".
const fmtOrderNo = (n: string) => (/^[A-Z0-9]{6}$/.test(n) ? n.match(/../g)!.join("-") : n);

export default async function IncomingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ l?: string }>;
}) {
  const { id } = await params;
  const { l: listeRaw } = await searchParams;
  const supabase = await createClient();

  // Blättern: Nachbarn in der Liste, aus der der Beleg geöffnet wurde (gleiche Filter und Sortierung).
  const liste = listeRaw ? Object.fromEntries(new URLSearchParams(listeRaw)) as ListeParams : null;
  let prevId: string | null = null;
  let nextId: string | null = null;
  let pos = 0;
  let total = 0;
  let ausserhalb = false;
  if (liste) {
    const { column, ascending } = sortSpec(liste);
    const { data: ids } = await applyListFilters(supabase.from("incoming_document").select(`id, sort_value:${column}`), liste)
      .order(column, { ascending, nullsFirst: false })
      .order("id")
      .range(0, 4999);
    const list = (ids ?? []) as unknown as { id: string; sort_value: string | null }[];
    const i = list.findIndex((r) => r.id === id);
    if (i >= 0) {
      pos = i + 1;
      total = list.length;
      prevId = i > 0 ? list[i - 1].id : null;
      nextId = i < list.length - 1 ? list[i + 1].id : null;
    } else if (list.length) {
      // Der Beleg passt nach einer Änderung (z.B. USt bestätigt, geprüft) nicht mehr zum Listenfilter:
      // trotzdem an seiner Stelle in der Sortierung blättern.
      const { data: self } = await supabase.from("incoming_document").select(`sort_value:${column}`).eq("id", id).maybeSingle();
      const mine = (self as unknown as { sort_value: string | null } | null)?.sort_value ?? null;
      const before = (r: { id: string; sort_value: string | null }) => {
        if (r.sort_value === mine) return r.id < id;
        if (r.sort_value == null) return false; // Leerwerte stehen am Ende
        if (mine == null) return true;
        return ascending ? r.sort_value < mine : r.sort_value > mine;
      };
      const k = list.filter(before).length;
      prevId = k > 0 ? list[k - 1].id : null;
      nextId = k < list.length ? list[k].id : null;
      pos = k + 1;
      total = list.length;
      ausserhalb = true;
    }
  }
  const lq = listeRaw ? `?l=${encodeURIComponent(listeRaw)}` : "";

  const [
    { data: doc, error },
    { data: itemsRaw },
    { data: taxCodes },
    { data: costCenters },
    { data: ledgerAccounts },
    { data: organizations },
  ] = await Promise.all([
    supabase.from("incoming_document").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("incoming_document_item")
      .select(
        "id, position, description, quantity, unit_price, tax_rate, net_amount, ledger_account, tax_code_id, material_ref, supplier_sku, order_reference, linked_document_id, " +
          "incoming_document_allocation ( id, link_type, sales_order_id, order_ref, material_ref, cost_center_id, amount, note, sales_order:sales_order_id ( order_number ) )",
      )
      .eq("incoming_document_id", id)
      .order("position", { nullsFirst: false }),
    supabase.from("tax_code").select("id, code, name").eq("direction", "input").order("code"),
    supabase.from("cost_center").select("id, number, name").eq("is_active", true).order("number"),
    supabase.from("ledger_account").select("number, name").eq("is_active", true).order("number"),
    // Lieferanten (auch "Kunde + Lieferant") komplett laden - PostgREST liefert sonst nur die ersten
    // 1000 Zeilen, spätere (z.B. Lidl) wurden dann nur als ID angezeigt.
    (async () => {
      const all: { id: string; name: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase
          .from("organization")
          .select("id, name")
          .in("relation", ["supplier", "both"])
          .order("name")
          .range(from, from + 999);
        all.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      return { data: all };
    })(),
  ]);

  // Andere Belege zum Verknüpfen von Belegzeilen (z.B. SaaS-Anbieter-Rechnung,
  // die zusätzlich auf einer Kreditkartenabrechnung auftaucht) - Bridge statt
  // Doppelerfassung, siehe PositionModal "Verknüpfter Beleg".
  const { data: otherDocsRaw } = await supabase
    .from("incoming_document")
    .select("id, doc_number, file_name, supplier_name, gross_amount, doc_date")
    .neq("id", id)
    .not("status", "in", "(advice,dunning)")
    .order("doc_date", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!doc) notFound();

  if (doc.supplier_organization_id && !(organizations ?? []).some((o) => o.id === doc.supplier_organization_id)) {
    const { data: cur } = await supabase
      .from("organization")
      .select("id, name")
      .eq("id", doc.supplier_organization_id)
      .maybeSingle();
    if (cur) organizations?.push(cur);
  }

  // Zuordnungen zu Bankzeilen (Zahlungen und Skonto-Ausbuchungen) - für den Block im Zahlung-Kasten,
  // mit Link zur Bank-Übersicht des jeweiligen Kontos.
  const { data: bankMatchRaw } = await supabase
    .from("bank_transaction_match")
    .select(
      "id, amount, ledger_account, auto, created_at, bank_transaction:bank_transaction_id(id, booking_date, amount, counterparty_name, purpose, bank_account_id)",
    )
    .eq("incoming_document_id", id)
    .order("created_at");
  type BankTxInfo = {
    id: string;
    booking_date: string;
    amount: number;
    counterparty_name: string | null;
    purpose: string | null;
    bank_account_id: string;
  };
  const bankMatches = ((bankMatchRaw ?? []) as unknown as {
    id: string;
    amount: number;
    ledger_account: string | null;
    auto: boolean;
    bank_transaction: BankTxInfo | BankTxInfo[] | null;
  }[]).map((m) => ({
    id: m.id,
    amount: m.amount,
    ledger_account: m.ledger_account,
    auto: m.auto,
    tx: Array.isArray(m.bank_transaction) ? (m.bank_transaction[0] ?? null) : m.bank_transaction,
  }));

  // Gelernte/von Hand gesetzte Vorkontierung des Lieferanten (Standardkonto/Zahlart an der
  // Organisation, siehe /einstellungen/vorkontierung) - nur ein Vorschlag fürs Formular, greift
  // dort nur wenn das Dokument noch kein eigenes Aufwandskonto hat. Steuerschlüssel kommt nicht
  // von hier, sondern aus der USt-Prüfung des Belegs.
  const { data: supplierOrg } = doc.supplier_organization_id
    ? await supabase
        .from("organization")
        .select("default_expense_account, default_payment_method")
        .eq("id", doc.supplier_organization_id)
        .maybeSingle()
    : { data: null };
  const suggestion =
    supplierOrg?.default_expense_account || supplierOrg?.default_payment_method
      ? {
          ledger_account: supplierOrg.default_expense_account,
          tax_code_id: null,
          payment_method: supplierOrg.default_payment_method,
        }
      : null;

  let colleagueName: string | null = null;
  if (doc.colleague_checked_by) {
    const { data: cu } = await supabase.from("app_user").select("display_name, email").eq("id", doc.colleague_checked_by).maybeSingle();
    colleagueName = cu?.display_name || cu?.email || null;
  }

  const pdfUrl = doc.pdf_storage_key ? await signedGetUrl(doc.pdf_storage_key, 1800) : null;
  const isAdvice = doc.doc_type === "payment_advice" || doc.status === "advice";
  const isDunning = doc.doc_type === "dunning" || doc.doc_type === "other" || doc.status === "dunning";
  const isOther = doc.doc_type === "other";
  const isHint = isAdvice || isDunning;
  const dun = ((doc.extraction as { dunning?: Record<string, unknown> } | null)?.dunning ??
    {}) as Record<string, unknown>;

  const ust = ((doc.extraction as { _ust?: { status?: string; tax_code_id?: string | null; tax_code?: string | null; reason?: string } } | null)
    ?._ust ?? null);
  const ustOpen = !isHint && ust?.status === "vorschlag" && ["captured", "extracted", "booked"].includes(doc.status);

  const items = ((itemsRaw ?? []) as unknown as ItemRow[]).map((it) => ({
    id: it.id,
    position: it.position,
    description: it.description ?? "",
    quantity: it.quantity,
    unit_price: it.unit_price,
    tax_rate: it.tax_rate,
    net_amount: it.net_amount,
    ledger_account: it.ledger_account ?? "",
    tax_code_id: it.tax_code_id ?? "",
    material_ref: it.material_ref ?? "",
    supplier_sku: it.supplier_sku ?? "",
    order_reference: it.order_reference ?? "",
    linked_document_id: it.linked_document_id ?? "",
    allocations: (it.incoming_document_allocation ?? []).map((a) => ({
      id: a.id,
      link_type: (a.link_type as "sales_order" | "material" | "cost_center") ?? "sales_order",
      order_number: a.sales_order?.order_number
        ? fmtOrderNo(a.sales_order.order_number)
        : (a.order_ref ?? ""),
      material_ref: a.material_ref ?? "",
      cost_center_id: a.cost_center_id ?? "",
      amount: a.amount,
      note: a.note ?? "",
    })),
  }));

  return (
    <>
      <p className="lead" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/eingangsrechnungen${listeRaw ? `?${listeRaw}` : ""}`}>← Eingangsrechnungen</Link>
        {pos > 0 && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            {prevId ? <Link href={`/eingangsrechnungen/${prevId}${lq}`}>← vorheriger</Link> : <span style={{ opacity: 0.4 }}>← vorheriger</span>}
            <span className="count">{ausserhalb ? "nicht mehr in der Liste" : `${pos} von ${total}`}</span>
            {nextId ? <Link href={`/eingangsrechnungen/${nextId}${lq}`}>nächster →</Link> : <span style={{ opacity: 0.4 }}>nächster →</span>}
          </span>
        )}
      </p>
      <h1>{doc.doc_number ?? doc.file_name ?? "Beleg"}</h1>
      <p className="lead">
        {isAdvice ? "Zahlungsavis" : isOther ? "Sonstiges (kein Beleg)" : isDunning ? "Mahnung (Sonstiges)" : `Status ${doc.status}`}
        {!isHint &&
          doc.extraction_confidence != null &&
          ` · KI-Konfidenz ${Math.round(doc.extraction_confidence * 100)} %`}
        {doc.email_from && ` · von ${doc.email_from}`}
        {isDunning && doc.forwarded_at && !String(doc.notes ?? "").startsWith("Von Hand als Sonstiges") && " · weitergeleitet"}
      </p>

      {isOther && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="lead" style={{ marginTop: 0 }}>
            Sonstiges — kein Beleg, nicht buchungsrelevant (z.B. AGB, Werbung, Angebot).
            {String(doc.notes ?? "").startsWith("Von Hand als Sonstiges")
              ? " Von Hand als Sonstiges eingestuft (nicht weitergeleitet)."
              : doc.forwarded_at
              ? " Wurde per E-Mail weitergeleitet."
              : " Weiterleitung ausstehend (SMTP/Ziel prüfen)."}
          </p>
          <table className="data">
            <tbody>
              <tr>
                <th style={{ textAlign: "left" }}>Absender</th>
                <td>{doc.email_from ?? "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>Betreff</th>
                <td>{doc.email_subject ?? "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>Datei</th>
                <td>{doc.file_name ?? "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {isDunning && !isOther && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="lead" style={{ marginTop: 0 }}>
            Mahnung / Zahlungserinnerung — keine zu buchende Rechnung.
            {doc.forwarded_at
              ? " Wurde per E-Mail weitergeleitet."
              : " Weiterleitung ausstehend (SMTP/Ziel prüfen)."}
          </p>
          <table className="data">
            <tbody>
              <tr>
                <th style={{ textAlign: "left" }}>Lieferant</th>
                <td>{doc.supplier_name ?? "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>angemahnte Rechnung(en)</th>
                <td>{(doc.advice_reference ?? []).join(", ") || "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>Mahnstufe</th>
                <td>{dun.level != null ? String(dun.level) : "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>offener Betrag</th>
                <td>{doc.gross_amount != null ? `${doc.gross_amount} ${doc.currency}` : "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>neue Frist</th>
                <td>{dun.deadline != null ? String(dun.deadline) : "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {isAdvice && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="lead" style={{ marginTop: 0 }}>
            Lastschrift-/Zahlungsavis — keine zu buchende Rechnung. Dient dem
            Kontoauszug-Abgleich.
          </p>
          <table className="data">
            <tbody>
              <tr>
                <th style={{ textAlign: "left" }}>Lieferant</th>
                <td>{doc.supplier_name ?? "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>bezieht sich auf Rechnung(en)</th>
                <td>{(doc.advice_reference ?? []).join(", ") || "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>Belastung am</th>
                <td>{doc.advice_debit_date ?? "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>Lastschriftbetrag</th>
                <td>{doc.gross_amount != null ? `${doc.gross_amount} ${doc.currency}` : "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="toolbar">
        {pdfUrl ? (
          <a className="ghost" href={pdfUrl} target="_blank" rel="noreferrer"
             style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
            PDF öffnen
          </a>
        ) : (
          <span className="count">kein PDF</span>
        )}
        {!isHint && !ustOpen && ["captured", "extracted"].includes(doc.status) && (
          <form action={setIncomingStatus}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="status" value="booked" />
            <button type="submit">als gebucht markieren</button>
          </form>
        )}
        {!isHint && ["booked", "exported"].includes(doc.status) && (
          <form action={setIncomingStatus}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="status" value="extracted" />
            <button type="submit" className="ghost">Buchung zurücknehmen</button>
          </form>
        )}
        {!isHint && (
          <form action={kollegenGesehen}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="gesehen" value={doc.colleague_checked_at ? "0" : "1"} />
            <button type="submit" className="ghost" title="Vermerk für die Durchsicht durch Kollegen, ohne Wirkung auf die Buchung">
              {doc.colleague_checked_at
                ? `von Kollegen gesehen (${new Date(doc.colleague_checked_at).toLocaleDateString("de-DE")}${colleagueName ? `, ${colleagueName}` : ""}) – zurücknehmen`
                : "von Kollegen gesehen"}
            </button>
          </form>
        )}
        {isDunning && doc.status === "dunning" && (
          <form action={alsRechnungBehandeln}>
            <input type="hidden" name="id" value={doc.id} />
            <button type="submit">Als Rechnung behandeln</button>
          </form>
        )}
        {!isOther && !isAdvice && (
          <form action={alsSonstigesBehandeln}>
            <input type="hidden" name="id" value={doc.id} />
            <button type="submit" className="ghost" title="kein Beleg, nicht buchungsrelevant (z.B. Lieferschein, AGB, Angebot)">
              als Sonstiges einstufen
            </button>
          </form>
        )}
        <form action={setIncomingStatus}>
          <input type="hidden" name="id" value={doc.id} />
          <input type="hidden" name="status" value="rejected" />
          <button type="submit" className="ghost">verwerfen</button>
        </form>
      </div>

      {ustOpen && (
        <div className="bd-card" style={{ borderLeft: "4px solid #d98e04", margin: "0 0 14px", padding: "12px 16px" }}>
          <strong>USt bitte bestätigen</strong>
          <p className="bd-hint" style={{ margin: "4px 0 8px" }}>
            Die KI ist sich bei der Umsatzsteuer nicht ganz sicher und hat deshalb <em>keinen</em> Steuerschlüssel gesetzt.
            Grund: {ust?.reason ?? "–"}
          </p>
          <form action={bestaetigeUst} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input type="hidden" name="id" value={doc.id} />
            <div className="bd-field" style={{ width: 320 }}>
              <label className="bd-field-label" htmlFor="ust_code">
                {ust?.tax_code_id ? `Vorschlag: ${ust.tax_code}` : "Steuerschlüssel wählen"}
              </label>
              <select className="bd-field-input" id="ust_code" name="tax_code_id" defaultValue={ust?.tax_code_id ?? ""} required>
                <option value="" disabled>– wählen –</option>
                {(taxCodes ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.code} – {t.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="bd-btn bd-btn-primary">Bestätigen &amp; buchen</button>
          </form>
        </div>
      )}
      {!isHint && ust?.status === "sicher" && (
        <p className="bd-hint">USt automatisch erkannt (sicher): {ust.reason}.</p>
      )}

      {doc.notes && !String(doc.notes).startsWith("Von Hand als Sonstiges") && <div className="banner-err">{doc.notes}</div>}

      {!isHint && (
        <div className="content-wide">
          <ReviewForm
            // Neu aufbauen, sobald die USt bestätigt wurde: sonst behält das Formular seinen alten
            // Zustand (leere Schlüssel) und würde sie beim Speichern wieder überschreiben.
            key={`${doc.id}:${ust?.status ?? ""}:${doc.tax_code_id ?? ""}`}
            doc={doc as Record<string, unknown>}
            items={items}
            taxCodes={(taxCodes ?? []).map((t) => ({ id: t.id, label: `${t.code} – ${t.name}` }))}
            costCenters={(costCenters ?? []).map((c) => ({ id: c.id, label: `${c.number} – ${c.name}` }))}
            ledgerAccounts={(ledgerAccounts ?? []).map((a) => ({
              value: a.number,
              label: `${a.number} – ${a.name}`,
            }))}
            organizations={(organizations ?? []).map((o) => ({ value: o.id, label: o.name }))}
            documents={(otherDocsRaw ?? []).map((d) => ({
              value: d.id,
              label: `${d.doc_number ?? d.file_name ?? d.id.slice(0, 8)} · ${d.supplier_name ?? "–"} · ${
                d.gross_amount != null ? `${Number(d.gross_amount).toFixed(2)} €` : "–"
              }${d.doc_date ? ` · ${d.doc_date}` : ""}`,
            }))}
            suggestion={suggestion}
            bankMatches={bankMatches}
            pdfUrl={pdfUrl}
            pdfLabel={doc.doc_number ?? doc.file_name ?? "Beleg.pdf"}
          />
        </div>
      )}
    </>
  );
}
