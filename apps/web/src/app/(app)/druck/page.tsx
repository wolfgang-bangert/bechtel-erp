import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BatchActions } from "./BatchActions";

export const dynamic = "force-dynamic";

type Job = {
  id: string;
  bauteil: string;
  netto_bogen: number | null;
  druckbogen: string | null;
  nutzen: number | null;
  auflage: number;
  zuschuss: number;
  status: string;
  order: { external_reference: string | null } | null;
};
type Batch = {
  id: string;
  nummer: string;
  schluessel: string;
  druckverfahren: string | null;
  cello: string;
  cello_seiten: number;
  papier: string | null;
  druckbogen: string | null;
  status: string;
  created_at: string;
  an_flux_at: string | null;
  flux_order_id: string | null;
  druckjob: Job[];
};

const BUCKETS: { label: string; states: string[] }[] = [
  { label: "Sammeln", states: ["offen", "bereit"] },
  { label: "In Arbeit", states: ["an_flux", "im_druck", "gedruckt", "cellophaniert"] },
  { label: "Erledigt", states: ["abgeschlossen"] },
];

function alterTage(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return "heute";
  if (d < 2) return "1 Tag";
  return `${Math.floor(d)} Tage`;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="tag" style={{ marginRight: 4 }}>{children}</span>;
}

export default async function DruckDashboard() {
  const supabase = await createClient();
  const { data: raw } = await supabase
    .from("druck_batch")
    .select(
      "id, nummer, schluessel, druckverfahren, cello, cello_seiten, papier, druckbogen, status, created_at, an_flux_at, flux_order_id, " +
        "druckjob(id, bauteil, netto_bogen, druckbogen, nutzen, auflage, zuschuss, status, order:portal_order_id(external_reference))",
    )
    .neq("status", "storniert")
    .order("created_at", { ascending: true });
  const batches = (raw ?? []) as unknown as Batch[];

  const sum = (js: Job[], f: (j: Job) => number) => js.reduce((a, j) => a + f(j), 0);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Druck-Dashboard</h1>
        <Link href="/druckauftraege" className="ghost" style={{ padding: "7px 12px" }}>
          Druckaufträge →
        </Link>
      </div>
      <p className="lead">
        Batches sammeln Druckjobs auftragsübergreifend. Schlüssel: Verfahren · Cello · Papier ·
        Druckbogen. Cello-Batches (matt/glanz) bekommen nach dem Druck den Schritt Cellophanieren.
      </p>

      {batches.length === 0 && (
        <p className="lead">
          Noch keine Batches. In einem Druckauftrag „Druckjobs erzeugen" klicken.
        </p>
      )}

      {BUCKETS.map((bucket) => {
        const list = batches.filter((b) => bucket.states.includes(b.status));
        if (!list.length) return null;
        return (
          <section key={bucket.label} style={{ marginTop: 18 }}>
            <h2 style={{ marginBottom: 8 }}>
              {bucket.label} <span className="count">{list.length}</span>
            </h2>
            {list.map((b) => {
              const jobs = b.druckjob ?? [];
              return (
                <div
                  key={b.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <div>
                      <strong>{b.nummer}</strong>{" "}
                      {b.cello !== "keine" && (
                        <Badge>Cello {b.cello}, {b.cello_seiten}-seitig</Badge>
                      )}
                      {b.papier && <Badge>{b.papier}</Badge>}
                      {b.druckbogen && <Badge>{b.druckbogen}</Badge>}
                      {b.druckverfahren && <Badge>{b.druckverfahren}</Badge>}
                      <span className="tag">{b.status}</span>
                    </div>
                    <div className="count">
                      {jobs.length} Jobs · {sum(jobs, (j) => j.netto_bogen ?? 0).toLocaleString("de-DE")} Bogen ·{" "}
                      {sum(jobs, (j) => (j.auflage || 0) + (j.zuschuss || 0)).toLocaleString("de-DE")} Expl. · seit{" "}
                      {alterTage(b.created_at)}
                      {b.flux_order_id ? ` · flux ${b.flux_order_id}` : ""}
                    </div>
                  </div>

                  <div className="table-scroll">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Auftrag</th>
                          <th>Bauteil</th>
                          <th style={{ textAlign: "right" }}>Bogen</th>
                          <th style={{ textAlign: "right" }}>Expl.</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((j) => (
                          <tr key={j.id}>
                            <td>
                              {j.order?.external_reference ? (
                                <Link href={`/druckauftraege?ref=${j.order.external_reference}`}>
                                  {j.order.external_reference}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>{j.bauteil}</td>
                            <td style={{ textAlign: "right" }}>
                              {j.netto_bogen ?? "—"}
                              {j.druckbogen ? ` ${j.druckbogen}` : ""}
                              {j.nutzen ? ` (${j.nutzen}-up)` : ""}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {((j.auflage || 0) + (j.zuschuss || 0)).toLocaleString("de-DE")}
                            </td>
                            <td className="count">{j.status}</td>
                          </tr>
                        ))}
                        {!jobs.length && (
                          <tr>
                            <td colSpan={5} className="count">Keine Jobs.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <BatchActions id={b.id} status={b.status} cello={b.cello} />
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
