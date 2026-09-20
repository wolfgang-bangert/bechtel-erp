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
    <>
      <h1>flux-Log</h1>
      <p className="lead">
        Rohe Statusmeldungen, die flux an den Webhook geschickt hat - die letzten 300. "nicht
        zugeordnet" heißt: kein passender opri-Auftrag/Job gefunden, z.B. weil der Auftrag nicht
        über opri, sondern direkt in flux angelegt wurde.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <span className="count">
          {zeilen.length} Einträge{!nurUnzugeordnet && ` · ${unzugeordnetAnzahl} nicht zugeordnet`}
        </span>
        {nurUnzugeordnet ? (
          <Link href="/druck/flux-log" className="ghost" style={{ padding: "7px 12px" }}>
            alle anzeigen
          </Link>
        ) : (
          <Link
            href="/druck/flux-log?nur=unzugeordnet"
            className="ghost"
            style={{ padding: "7px 12px" }}
          >
            nur nicht zugeordnete
          </Link>
        )}
      </div>

      <div className="table-scroll">
        <table className="data">
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
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.id}>
                <td className="count">{fmtZeit(z.received_at)}</td>
                <td>{z.event ?? "—"}</td>
                <td>{z.status ?? "—"}</td>
                <td>{z.work_step ?? "—"}</td>
                <td className="count">
                  {z.flux_order_id ?? "—"}
                  {z.flux_order_item_id ? ` / ${z.flux_order_item_id}` : ""}
                </td>
                <td>
                  {z.portal_order_id ? (
                    <Link href={`/druckauftraege/${z.portal_order_id}`}>
                      {z.order?.external_reference ?? "zum Auftrag"}
                    </Link>
                  ) : (
                    <span className="msg-err">nicht zugeordnet</span>
                  )}
                </td>
                <td>
                  {z.signature_ok == null ? (
                    <span className="count">–</span>
                  ) : z.signature_ok ? (
                    "✓"
                  ) : (
                    <span className="msg-err">✗</span>
                  )}
                </td>
                <td className="wrap count">{z.message ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
