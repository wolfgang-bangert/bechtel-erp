import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { fmtDate } from "@/lib/format";

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
        "deliver_date, currency, total_net, total_gross, ship_to, sender, received_at, raw, " +
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

      <h2>Dateien</h2>
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
