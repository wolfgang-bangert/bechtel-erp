import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { ResolveButton } from "./ResolveButton";
import { DruckjobsButton } from "./DruckjobsButton";

export const dynamic = "force-dynamic";

const kb = (n: number | null) => (n == null ? "—" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function AddrBlock({ a }: { a: Record<string, unknown> | null }) {
  if (!a) return <span className="count">—</span>;
  const g = (k: string) => (a[k] == null ? "" : String(a[k]));
  return (
    <div style={{ whiteSpace: "pre-line" }}>
      {[
        g("company"),
        g("name"),
        [g("street")].filter(Boolean).join(" "),
        g("addition1"),
        [g("zip"), g("city")].filter(Boolean).join(" "),
        g("country"),
        g("phone") && `Tel. ${g("phone")}`,
        g("email"),
      ]
        .filter(Boolean)
        .join("\n")}
    </div>
  );
}

type ResolveResult = {
  stammartikel_id: string | null;
  gruppe: string | null;
  attribute: Record<string, unknown>;
  optionen: { typ: string | null; wert: string | null; sku: string }[];
  blockstaerke_mm: number;
  flux_template: string | null;
  materialliste: {
    regel: string;
    rolle: string | null;
    verwendung: string | null;
    material: string | null;
    material_kurz: string | null;
    grammatur: string | null;
    format: string | null;
    menge: number;
    einheit?: string;
    nutzen?: number | null;
    netto_bogen?: number | null;
    druckbogen?: string | null;
    durchmesser?: string | null;
    teilung?: string | null;
    schlaufen?: number | null;
    schlaufen_gesamt?: number | null;
    bindeseite?: string | null;
    produktionshinweis: string | null;
    seite: string | null;
    bedruckt: boolean | null;
    ungeloest?: string;
  }[];
  ungeloest: string[];
  hinweise: string[];
};

type Detail = {
  id: string;
  external_id: string;
  external_reference: string | null;
  reference_type: string | null;
  portal_state: string | null;
  description: string | null;
  quantity: number | null;
  deliver_date: string | null;
  currency: string | null;
  total_net: number | null;
  total_gross: number | null;
  ship_to: Record<string, unknown> | null;
  sender: Record<string, unknown> | null;
  received_at: string;
  raw: unknown;
  resolve_result: ResolveResult | null;
  resolved_at: string | null;
  portal: { code?: string; name?: string } | null;
  items: { position: string | null; sku: string | null; quantity: number | null; description: string | null }[];
  files: {
    id: string;
    typ: string;
    filename: string | null;
    bytes: number | null;
    storage_key: string | null;
    is_zip: boolean;
    source_url: string | null;
    fetched_at: string | null;
  }[];
};

export default async function DruckauftragPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("portal_order")
    .select(
      "id, external_id, external_reference, reference_type, portal_state, description, quantity, " +
        "deliver_date, currency, total_net, total_gross, ship_to, sender, received_at, raw, resolve_result, resolved_at, " +
        "portal:portal_id(code, name), " +
        "items:portal_order_item(position, sku, quantity, description), " +
        "files:portal_order_file(id, typ, filename, bytes, storage_key, is_zip, source_url, fetched_at)",
    )
    .eq("id", id)
    .maybeSingle();

  const data = raw as unknown as Detail | null;
  if (!data) notFound();

  const portal = data.portal;
  const items = (data.items ?? [])
    .slice()
    .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? ""));

  const fileLinks = await Promise.all(
    (data.files ?? []).map(async (f) => ({
      ...f,
      url: f.storage_key ? await signedGetUrl(f.storage_key) : null,
    })),
  );

  const { data: jobsRaw } = await supabase
    .from("druckjob")
    .select(
      "id, bauteil, papier, farbigkeit, format, druckbogen, nutzen, netto_bogen, auflage, cello, cello_seiten, status, batch:batch_id(nummer, status)",
    )
    .eq("portal_order_id", id)
    .order("created_at", { ascending: true });
  const jobs = (jobsRaw ?? []) as unknown as {
    id: string;
    bauteil: string;
    papier: string | null;
    farbigkeit: string | null;
    format: string | null;
    druckbogen: string | null;
    nutzen: number | null;
    netto_bogen: number | null;
    auflage: number;
    cello: string;
    cello_seiten: number;
    status: string;
    batch: { nummer: string; status: string } | null;
  }[];

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>
          Druckauftrag {data.external_reference}{" "}
          <span className="tag">{data.portal_state ?? "?"}</span>
        </h1>
        <Link href="/druckauftraege" className="ghost" style={{ padding: "7px 12px" }}>
          ← Liste
        </Link>
      </div>
      <p className="lead">
        {portal?.name ?? portal?.code} · {data.reference_type}/{data.external_reference} ·
        Eingang {fmtDate(data.received_at)}
      </p>

      <h2>Auftrag</h2>
      <dl className="kv">
        <dt>Produkt</dt>
        <dd>{data.description ?? "—"}</dd>
        <dt>Menge</dt>
        <dd>{data.quantity != null ? Number(data.quantity) : "—"}</dd>
        <dt>Liefertermin</dt>
        <dd>{data.deliver_date ? fmtDate(data.deliver_date) : "—"}</dd>
        <dt>Betrag</dt>
        <dd>
          {data.total_net != null ? `${Number(data.total_net).toFixed(2)} netto` : "—"}
          {data.total_gross != null ? ` / ${Number(data.total_gross).toFixed(2)} brutto` : ""}{" "}
          {data.currency ?? ""}
        </dd>
      </dl>

      <div className="row" style={{ border: "none", padding: 0, gap: 24, marginTop: 8 }}>
        <div>
          <h2>Empfänger</h2>
          <AddrBlock a={data.ship_to as Record<string, unknown> | null} />
        </div>
        <div>
          <h2>Absender</h2>
          <AddrBlock a={data.sender as Record<string, unknown> | null} />
        </div>
      </div>

      <h2>
        Positionen <span className="tag">{items.length}</span>
      </h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Pos</th>
              <th>SKU</th>
              <th style={{ textAlign: "right" }}>Menge</th>
              <th>Beschreibung</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>{it.position ?? "—"}</td>
                <td>{it.sku ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{it.quantity != null ? Number(it.quantity) : "—"}</td>
                <td className="wrap">{it.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lead" style={{ marginTop: 4 }}>
        Welche Positionen produktionsrelevant sind, klärt die SKU-Regel-Engine (Phase 2).
      </p>

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>
          Auflösung{" "}
          {data.resolved_at && (
            <span className="count">zuletzt {fmtDate(data.resolved_at)}</span>
          )}
        </h2>
        <ResolveButton id={data.id} />
      </div>
      {!data.resolve_result ? (
        <p className="lead">Noch nicht aufgelöst — „neu auflösen" klicken.</p>
      ) : (
        (() => {
          const r = data.resolve_result;
          return (
            <>
              <dl className="kv">
                <dt>Produktgruppe</dt>
                <dd>{r.gruppe ?? "—"}</dd>
                <dt>Stammartikel erkannt</dt>
                <dd>{r.stammartikel_id ? "ja" : "nein"}</dd>
                <dt>Attribute</dt>
                <dd>
                  {Object.entries(r.attribute ?? {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ") || "—"}
                </dd>
                <dt>Optionen</dt>
                <dd>
                  {(r.optionen ?? []).map((o) => o.typ ?? o.sku).join(" · ") || "—"}
                </dd>
                <dt>Blockstärke</dt>
                <dd>{r.blockstaerke_mm ? `${r.blockstaerke_mm} mm` : "—"}</dd>
                <dt>flux_template</dt>
                <dd>{r.flux_template ?? <span className="msg-err">nicht gesetzt (Regel fehlt)</span>}</dd>
              </dl>

              <h3 style={{ margin: "14px 0 6px", fontSize: 14 }}>Materialliste</h3>
              {r.materialliste?.length ? (
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Rolle / Verwendung</th>
                        <th>Material</th>
                        <th style={{ textAlign: "right" }}>Menge</th>
                        <th>Hinweis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.materialliste.map((m, i) => (
                        <tr key={i}>
                          <td>
                            {m.rolle ?? "?"}
                            {m.verwendung ? ` · ${m.verwendung}` : ""}
                            {m.seite ? ` · ${m.seite}` : ""}
                          </td>
                          <td>
                            {m.material_kurz || m.material || "—"}
                            {m.grammatur ? ` (${m.grammatur})` : ""}
                            {m.format ? ` ${m.format}` : ""}
                            {m.durchmesser && (
                              <div className="count">
                                Ø {m.durchmesser}
                                {m.teilung ? ` · ${m.teilung}` : ""}
                                {m.schlaufen != null
                                  ? ` · ${m.schlaufen} Schlaufen/Expl.${
                                      m.schlaufen_gesamt != null
                                        ? ` · ${m.schlaufen_gesamt.toLocaleString("de-DE")} gesamt`
                                        : ""
                                    }`
                                  : ""}
                                {m.bindeseite ? ` · ${m.bindeseite}` : ""}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {m.menge} {m.einheit && m.einheit !== "stück" ? "" : "Stk"}
                            {m.netto_bogen != null && (
                              <div className="count">
                                {m.netto_bogen} Bogen{m.druckbogen ? ` ${m.druckbogen}` : ""}
                                {m.nutzen ? ` (${m.nutzen}-up)` : ""}
                              </div>
                            )}
                          </td>
                          <td className="count">
                            {m.ungeloest ? (
                              <span className="msg-err">{m.ungeloest}</span>
                            ) : (
                              m.produktionshinweis ?? ""
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="lead">Keine Materialregel hat gegriffen.</p>
              )}

              {(r.ungeloest?.length || r.hinweise?.length) && (
                <p className="lead" style={{ marginTop: 8 }}>
                  {r.ungeloest?.length ? (
                    <>Nicht zugeordnete SKUs: {r.ungeloest.join(", ")}. </>
                  ) : null}
                  {(r.hinweise ?? []).join(" · ")}
                </p>
              )}
            </>
          );
        })()
      )}

      <div className="toolbar" style={{ justifyContent: "space-between", marginTop: 18 }}>
        <h2 style={{ margin: 0 }}>
          Druckjobs {jobs.length > 0 && <span className="tag">{jobs.length}</span>}
        </h2>
        <DruckjobsButton id={data.id} />
      </div>
      {jobs.length === 0 ? (
        <p className="lead">
          Noch keine Druckjobs. „Druckjobs erzeugen" legt pro bedrucktem Bauteil einen Job an und
          sortiert ihn in einen Batch (Schlüssel: Verfahren · Cello · Papier · Druckbogen).
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Bauteil</th>
                <th>Papier / Farbe</th>
                <th style={{ textAlign: "right" }}>Bogen</th>
                <th>Cello</th>
                <th>Batch</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.bauteil}</td>
                  <td>
                    {j.papier ?? "—"}
                    {j.farbigkeit ? ` · ${j.farbigkeit}` : ""}
                    {j.format ? ` · ${j.format}` : ""}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {j.netto_bogen != null ? j.netto_bogen : "—"}
                    {j.druckbogen ? ` ${j.druckbogen}` : ""}
                    {j.nutzen ? ` (${j.nutzen}-up)` : ""}
                  </td>
                  <td>
                    {j.cello === "keine" ? "—" : `${j.cello}, ${j.cello_seiten}-seitig`}
                  </td>
                  <td>
                    {j.batch ? (
                      <Link href="/druck">{j.batch.nummer}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="count">{j.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: 18 }}>Dateien</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Datei</th>
              <th style={{ textAlign: "right" }}>Größe</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fileLinks.map((f) => (
              <tr key={f.id}>
                <td>
                  {f.typ}
                  {f.is_zip ? <span className="tag" style={{ marginLeft: 4 }}>ZIP</span> : null}
                </td>
                <td className="wrap">{f.filename ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{kb(f.bytes)}</td>
                <td className="count">{f.fetched_at ? "geholt" : "nicht geholt"}</td>
                <td>
                  {f.url ? (
                    <a className="ghost" href={f.url} target="_blank" rel="noreferrer" style={{ padding: "5px 10px" }}>
                      öffnen
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!fileLinks.length && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>Keine Dateien.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Rohdaten (Portal)</h2>
      <details>
        <summary style={{ cursor: "pointer", color: "var(--muted)" }}>raw JSON anzeigen</summary>
        <pre
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 12,
            overflow: "auto",
            fontSize: 12,
            maxHeight: 500,
          }}
        >
          {JSON.stringify(data.raw, null, 2)}
        </pre>
      </details>
    </>
  );
}
