import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BatchActions } from "./BatchActions";

export const dynamic = "force-dynamic";

type Job = {
  id: string;
  typ: string;
  bauteil: string;
  netto_bogen: number | null;
  druckbogen: string | null;
  nutzen: number | null;
  auflage: number;
  zuschuss: number;
  teilung: string | null;
  durchmesser: string | null;
  schlaufen_gesamt: number | null;
  komponenten: { bezeichnung: string | null; menge?: number | null; einheit?: string | null }[] | null;
  status: string;
  order: { external_reference: string | null } | null;
};
type Batch = {
  id: string;
  nummer: string;
  typ: string;
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
  job: Job[];
};

const TYPEN: { typ: string; label: string; hint: string }[] = [
  { typ: "druck", label: "Drucken", hint: "Schlüssel: Verfahren · Cello · Papier · Druckbogen — geht an flux" },
  { typ: "cello", label: "Cellophanieren", hint: "Schlüssel: matt/glanz · Papier — nach dem Umschlag-Druck" },
  { typ: "binden", label: "Binden (Wire-O)", hint: "Schlüssel: Teilung · Durchmesser — nach allen Druck-/Cello-Jobs" },
  { typ: "aufhaenger", label: "Aufhänger montieren", hint: "nach dem Binden" },
];

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

const sum = (js: Job[], f: (j: Job) => number) => js.reduce((a, j) => a + f(j), 0);

function BatchCard({ b }: { b: Batch }) {
  const jobs = b.job ?? [];
  const bogen = sum(jobs, (j) => j.netto_bogen ?? 0);
  const expl = sum(jobs, (j) => (j.auflage || 0) + (j.zuschuss || 0));
  const schlaufen = sum(jobs, (j) => j.schlaufen_gesamt ?? 0);
  const wire = jobs.find((j) => j.durchmesser || j.teilung);

  return (
    <div
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
          {b.cello !== "keine" && <Badge>Cello {b.cello}, {b.cello_seiten}-seitig</Badge>}
          {b.papier && <Badge>{b.papier}</Badge>}
          {b.druckbogen && <Badge>{b.druckbogen}</Badge>}
          {b.druckverfahren && <Badge>{b.druckverfahren}</Badge>}
          {wire?.teilung && <Badge>{wire.teilung}</Badge>}
          {wire?.durchmesser && <Badge>{wire.durchmesser}</Badge>}
          <span className="tag">{b.status}</span>
        </div>
        <div className="count">
          {jobs.length} Jobs
          {b.typ === "druck" && ` · ${bogen.toLocaleString("de-DE")} Bogen`}
          {b.typ === "binden" && ` · ${schlaufen.toLocaleString("de-DE")} Schlaufen`}
          {` · ${expl.toLocaleString("de-DE")} Expl. · seit ${alterTage(b.created_at)}`}
          {b.flux_order_id ? ` · flux ${b.flux_order_id}` : ""}
        </div>
      </div>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Auftrag</th>
              <th>Bauteil</th>
              <th style={{ textAlign: "right" }}>{b.typ === "druck" ? "Bogen" : b.typ === "binden" ? "Schlaufen" : "Menge"}</th>
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
                <td>
                  {j.bauteil}
                  {j.komponenten && j.komponenten.length > 0 && (
                    <div className="count" style={{ marginTop: 3 }}>
                      führt zusammen:{" "}
                      {j.komponenten
                        .map(
                          (k) =>
                            `${k.bezeichnung ?? "?"}${
                              k.menge != null ? ` (${k.menge.toLocaleString("de-DE")}${k.einheit ? " " + k.einheit : ""})` : ""
                            }`,
                        )
                        .join("  +  ")}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {j.typ === "druck"
                    ? `${j.netto_bogen ?? "—"}${j.druckbogen ? ` ${j.druckbogen}` : ""}${j.nutzen ? ` (${j.nutzen}-up)` : ""}`
                    : j.typ === "binden"
                      ? (j.schlaufen_gesamt?.toLocaleString("de-DE") ?? "—")
                      : "—"}
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

      <BatchActions id={b.id} typ={b.typ} status={b.status} cello={b.cello} />
    </div>
  );
}

export default async function DruckDashboard() {
  const supabase = await createClient();
  const { data: raw } = await supabase
    .from("batch")
    .select(
      "id, nummer, typ, schluessel, druckverfahren, cello, cello_seiten, papier, druckbogen, status, created_at, an_flux_at, flux_order_id, " +
        "job(id, typ, bauteil, netto_bogen, druckbogen, nutzen, auflage, zuschuss, teilung, durchmesser, schlaufen_gesamt, komponenten, status, order:portal_order_id(external_reference))",
    )
    .neq("status", "storniert")
    .order("created_at", { ascending: true });
  const batches = (raw ?? []) as unknown as Batch[];

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Druck-Dashboard</h1>
        <Link href="/druckauftraege" className="ghost" style={{ padding: "7px 12px" }}>
          Druckaufträge →
        </Link>
      </div>
      <p className="lead">
        Batches sammeln Arbeitsvorgänge auftragsübergreifend. „an flux übergeben" gilt nur für
        Druck-Batches; Cellophanieren und Binden laufen werk-intern.
      </p>

      {batches.length === 0 && (
        <p className="lead">Noch keine Batches. In einem Auftrag „Jobs erzeugen" klicken.</p>
      )}

      {TYPEN.map(({ typ, label, hint }) => {
        const list = batches.filter((b) => b.typ === typ);
        if (!list.length) return null;
        return (
          <section key={typ} style={{ marginTop: 26 }}>
            <h2 style={{ marginBottom: 2 }}>
              {label} <span className="count">{list.length}</span>
            </h2>
            <p className="lead" style={{ marginTop: 0 }}>{hint}</p>
            {BUCKETS.map((bucket) => {
              const bl = list.filter((b) => bucket.states.includes(b.status));
              if (!bl.length) return null;
              return (
                <div key={bucket.label} style={{ marginTop: 10 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--muted)" }}>
                    {bucket.label} · {bl.length}
                  </h3>
                  {bl.map((b) => (
                    <BatchCard key={b.id} b={b} />
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
