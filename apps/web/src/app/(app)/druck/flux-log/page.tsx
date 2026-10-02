import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fmtZeit = (d: string) =>
  new Date(d).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "medium" });

type LogZeile = {
  id: string;
  received_at: string;
  event: string | null;
  status: string | null;
  work_step: string | null;
  message: string | null;
  matched: boolean;
  signature_ok: boolean | null;
  flux_order_id: string | null;
  flux_order_item_id: string | null;
  portal_order_id: string | null;
  job_id: string | null;
  raw: unknown;
  order: { external_reference: string | null } | null;
};

export default async function FluxLogPage({
  searchParams,
}: {
  searchParams: Promise<{ nur?: string }>;
}) {
  const { nur } = await searchParams;
  const nurUnzugeordnet = nur === "unzugeordnet";

  const supabase = await createClient();
  let query = supabase
    .from("flux_status_log")
    .select(
      "id, received_at, event, status, work_step, message, matched, signature_ok, " +
        "flux_order_id, flux_order_item_id, portal_order_id, job_id, raw, " +
        "order:portal_order_id(external_reference)",
    )
    .order("received_at", { ascending: false })
    .limit(300);
  if (nurUnzugeordnet) query = query.eq("matched", false);

  const { data, error } = await query;
  const zeilen = (data ?? []) as unknown as LogZeile[];
  const unzugeordnetAnzahl = nurUnzugeordnet
    ? zeilen.length
    : zeilen.filter((z) => !z.matched).length;

  return (
    <div className="content-wide bd-page">
      <h1>flux-Log</h1>
      <p className="bd-lead" style={{ maxWidth: 760 }}>
        Rohe Statusmeldungen, die flux an den Webhook geschickt hat - die letzten 300. "nicht
        zugeordnet" heißt: kein passender opri-Auftrag/Job gefunden, z.B. weil der Auftrag nicht
        über opri, sondern direkt in flux angelegt wurde.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="bd-toolbar" style={{ alignItems: "center" }}>
        <span className="bd-mute">
          {zeilen.length} Einträge{!nurUnzugeordnet && ` · ${unzugeordnetAnzahl} nicht zugeordnet`}
        </span>
        <div className="bd-spacer" />
        {nurUnzugeordnet ? (
          <Link href="/druck/flux-log" className="bd-btn bd-btn-secondary">
            alle anzeigen
          </Link>
        ) : (
          <Link href="/druck/flux-log?nur=unzugeordnet" className="bd-btn bd-btn-secondary">
            nur nicht zugeordnete
          </Link>
        )}
      </div>

      <div className="table-scroll">
        <table className="bd-table">
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Event</th>
              <th>Status</th>
              <th>Workstep</th>
              <th>flux-Auftrag</th>
              <th>Auftrag</th>
              <th>Signatur</th>
              <th>Nachricht</th>
              <th>Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.id}>
                <td className="bd-mute" style={{ whiteSpace: "nowrap" }}>{fmtZeit(z.received_at)}</td>
                <td>{z.event ?? "—"}</td>
                <td>{z.status ?? "—"}</td>
                <td>{z.work_step ?? "—"}</td>
                <td className="bd-mute">
                  {z.flux_order_id ?? "—"}
                  {z.flux_order_item_id ? ` / ${z.flux_order_item_id}` : ""}
                </td>
                <td>
                  {z.portal_order_id ? (
                    <Link className="bd-link" href={`/druckauftraege/${z.portal_order_id}`}>
                      {z.order?.external_reference ?? "zum Auftrag"}
                    </Link>
                  ) : (
                    <span className="bd-status t-danger">
                      <span className="bd-status-mark" />
                      nicht zugeordnet
                    </span>
                  )}
                </td>
                <td>
                  {z.signature_ok == null ? (
                    <span className="bd-mute">–</span>
                  ) : z.signature_ok ? (
                    <span className="bd-ok">✓</span>
                  ) : (
                    <span className="bd-err">✗</span>
                  )}
                </td>
                <td className="wrap bd-mute">{z.message ?? ""}</td>
                <td>
                  <details>
                    <summary className="bd-mute" style={{ cursor: "pointer" }}>roh</summary>
                    <pre className="bd-pre" style={{ maxWidth: 400, maxHeight: 300 }}>
                      {JSON.stringify(z.raw, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
