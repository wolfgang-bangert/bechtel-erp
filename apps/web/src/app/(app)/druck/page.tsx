import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { BatchActions } from "./BatchActions";
import { SortControls } from "./SortControls";

export const dynamic = "force-dynamic";

type Job = {
  id: string;
  typ: string;
  bauteil: string;
  format: string | null;
  papier: string | null;
  cello: string | null;
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
  portal_order_id: string | null;
  order: {
    external_reference: string | null;
    blockstaerke_mm: string | null;
    gruppe: string | null;
    prodformat: string | null;
    ausrichtung: string | null;
    ausrichtung_quelle: string | null;
    deliver_date: string | null;
  } | null;
};

/** "A5 (Querformat)" aus Format + Ausrichtung; "(QP)" = aus PDF ermittelt. */
const prodFmt = (j: Job) => {
  const a = j.order?.ausrichtung;
  const marker = j.order?.ausrichtung_quelle === "pdf" ? " QP" : "";
  return [j.order?.prodformat ?? j.format, a && `(${a}${marker})`].filter(Boolean).join(" ");
};

/** frühester Liefertermin eines Batches (über seine Jobs). */
function fruehesterLiefer(b: Batch): string | null {
  const ds = (b.job ?? []).map((j) => j.order?.deliver_date).filter(Boolean) as string[];
  return ds.length ? ds.reduce((a, c) => (c < a ? c : a)) : null;
}
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
  { typ: "druck", label: "Drucken", hint: "Schlüssel: Anzahl Loops · Farbe Spirale · Durchmesser" },
  { typ: "cello", label: "Cellophanieren", hint: "nach dem Umschlag-Druck" },
  { typ: "binden", label: "Binden (Wire-O)", hint: "Schlüssel: Anzahl Loops · Farbe Spirale · Teilung · Durchmesser" },
];

// Feld-Schlüssel → Klartext-Label für die Batch-Beschriftung
const FELD_LABEL: Record<string, string> = {
  bindelaenge: "Anzahl Loops",
  schlaufen: "Anzahl Loops",
  durchmesser: "Durchmesser",
  spiralfarbe: "Farbe Spirale",
  teilung: "Teilung",
  aufhaenger: "Aufhänger",
  bauteil: "Bauteil",
  cello: "Cello",
  papier: "Papier",
  druckbogen: "Bogen",
  verfahren: "Verfahren",
  format: "Format",
};

/** Batch-Schlüssel + Config → [{label, wert}] ohne Leerwerte. */
function schluesselTeile(typ: string, schluessel: string, cfg: Record<string, string[]>) {
  const felder = cfg[typ] ?? [];
  const werte = (schluessel ?? "").split(" | ");
  return felder
    .map((f, i) => ({ label: FELD_LABEL[f] ?? f, wert: (werte[i] ?? "").trim() }))
    .filter((x) => x.wert);
}

// logische Sortier-/Gruppier-Dimension → mögliche Config-Feldnamen
const DIM_FELDER: Record<string, string[]> = {
  loops: ["bindelaenge", "schlaufen"],
  spiralfarbe: ["spiralfarbe"],
  durchmesser: ["durchmesser"],
  teilung: ["teilung"],
  aufhaenger: ["aufhaenger"],
};
const DIM_LABEL: Record<string, string> = {
  loops: "Anzahl Loops",
  spiralfarbe: "Farbe Spirale",
  durchmesser: "Durchmesser",
  teilung: "Teilung",
  aufhaenger: "Aufhänger",
  format: "Format",
};

/** Wert eines Batches für eine Sortier-/Gruppier-Dimension. */
function critWert(b: Batch, dim: string, cfg: Record<string, string[]>): string {
  if (dim === "format") {
    const fs = [
      ...new Set((b.job ?? []).map((j) => prodFmt(j)).filter(Boolean)),
    ];
    return fs.join(" / ") || "—";
  }
  const felder = cfg[b.typ] ?? [];
  const werte = (b.schluessel ?? "").split(" | ");
  const idx = felder.findIndex((f) => (DIM_FELDER[dim] ?? [dim]).includes(f));
  return (idx >= 0 ? werte[idx] ?? "" : "").trim() || "—";
}

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

const sum = (js: Job[], f: (j: Job) => number) => js.reduce((a, j) => a + f(j), 0);

function BatchCard({
  b,
  cfg,
  gruppeKuerzel,
}: {
  b: Batch;
  cfg: Record<string, string[]>;
  gruppeKuerzel: Record<string, string>;
}) {
  const jobs = b.job ?? [];
  const bogen = sum(jobs, (j) => j.netto_bogen ?? 0);
  const expl = sum(jobs, (j) => (j.auflage || 0) + (j.zuschuss || 0));
  const schlaufen = sum(jobs, (j) => j.schlaufen_gesamt ?? 0);
  const kriterien = schluesselTeile(b.typ, b.schluessel, cfg)
    .map((t) => `${t.label}: ${t.wert.replace(/\s*\([^)]*\)\s*$/, "")}`)
    .join("  ·  ");
  const lts = jobs.map((j) => j.order?.deliver_date).filter(Boolean).sort() as string[];
  const ltText = lts.length
    ? lts[0] === lts[lts.length - 1]
      ? fmtDate(lts[0])
      : `${fmtDate(lts[0])} – ${fmtDate(lts[lts.length - 1])}`
    : null;

  return (
    <div
      id={b.nummer}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        marginBottom: 10,
      }}
    >
      <div
        className="toolbar"
        style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
      >
        <div style={{ minWidth: 0 }}>
          <strong>{b.nummer}</strong>
          <span style={{ marginLeft: 10 }}>{kriterien}</span>
          {ltText && (
            <span
              className="tag"
              style={{ marginLeft: 10, background: "var(--tag-bg)", color: "var(--accent)" }}
            >
              Liefertermin {ltText}
            </span>
          )}
          <span className="tag" style={{ marginLeft: 10, background: "var(--tag-bg)" }}>
            {b.status}
          </span>
        </div>
        <div className="count" style={{ whiteSpace: "nowrap" }}>
          {jobs.length} Jobs
          {b.typ === "druck" && ` · ${bogen.toLocaleString("de-DE")} Bogen`}
          {b.typ === "binden" && ` · ${schlaufen.toLocaleString("de-DE")} Schlaufen`}
          {` · ${expl.toLocaleString("de-DE")} Expl. · seit ${alterTage(b.created_at)}`}
          {b.flux_order_id ? ` · flux ${b.flux_order_id}` : ""}
        </div>
      </div>

      <details style={{ marginTop: 6 }}>
        <summary className="count" style={{ cursor: "pointer", padding: "2px 0" }}>
          {jobs.length} {jobs.length === 1 ? "Job" : "Jobs"} anzeigen
        </summary>
        <div style={{ marginTop: 6 }}>
          {jobs.map((j) => {
            const stk = j.order?.blockstaerke_mm
              ? `${Number(j.order.blockstaerke_mm).toLocaleString("de-DE")} mm`
              : null;
            return (
              <details
                key={j.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  marginBottom: 4,
                }}
              >
                <summary style={{ cursor: "pointer", listStyle: "none" }}>
                  <span style={{ fontWeight: 600 }}>{j.order?.external_reference ?? "—"}</span>
                  {"  ·  "}
                  <span className="count">
                    {(j.order?.gruppe && (gruppeKuerzel[j.order.gruppe] ?? j.order.gruppe)) ?? "—"}
                  </span>
                  {"  ·  "}
                  {j.bauteil}
                  {prodFmt(j) ? `  ·  ${prodFmt(j)}` : ""}
                  {stk ? `  ·  ${stk}` : ""}
                  {j.order?.deliver_date ? `  ·  LT ${fmtDate(j.order.deliver_date)}` : ""}
                  {"  ·  "}
                  {((j.auflage || 0) + (j.zuschuss || 0)).toLocaleString("de-DE")} Expl.
                  {"  ·  "}
                  <span className="count">{j.status}</span>
                </summary>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7 }}>
                  {[
                    j.papier && `Papier: ${j.papier}`,
                    j.druckbogen && `Druckbogen: ${j.druckbogen}`,
                    j.nutzen && `Nutzen: ${j.nutzen}`,
                    j.netto_bogen != null && `Netto-Bogen: ${j.netto_bogen.toLocaleString("de-DE")}`,
                    j.cello && j.cello !== "keine" && `Cello: ${j.cello}`,
                    j.teilung && `Teilung: ${j.teilung}`,
                    j.durchmesser && `Durchmesser: ${j.durchmesser}`,
                    j.schlaufen_gesamt != null &&
                      `Schlaufen gesamt: ${j.schlaufen_gesamt.toLocaleString("de-DE")}`,
                  ]
                    .filter(Boolean)
                    .join("  ·  ") || "—"}
                  {j.komponenten && j.komponenten.length > 0 && (
                    <div className="count" style={{ marginTop: 3 }}>
                      führt zusammen:{" "}
                      {j.komponenten
                        .map(
                          (k) =>
                            `${k.bezeichnung ?? "?"}${
                              k.menge != null
                                ? ` (${k.menge.toLocaleString("de-DE")}${k.einheit ? " " + k.einheit : ""})`
                                : ""
                            }`,
                        )
                        .join("  +  ")}
                    </div>
                  )}
                  {j.portal_order_id && (
                    <div style={{ marginTop: 6 }}>
                      <a
                        href={`/druckauftraege/${j.portal_order_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ghost"
                        style={{ padding: "4px 10px" }}
                      >
                        Zum Auftrag →
                      </a>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
          {!jobs.length && <div className="count">Keine Jobs.</div>}
        </div>
      </details>

      <details style={{ marginTop: 4 }}>
        <summary className="count" style={{ cursor: "pointer", padding: "2px 0" }}>
          Aktionen
        </summary>
        <div style={{ marginTop: 4 }}>
          <BatchActions id={b.id} typ={b.typ} status={b.status} cello={b.cello} />
        </div>
      </details>
    </div>
  );
}

export default async function DruckDashboard({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; group?: string; dir?: string }>;
}) {
  const { sort = "", group = "", dir = "asc" } = await searchParams;
  const desc = dir === "desc";
  const supabase = await createClient();
  const { data: cfgRow } = await supabase
    .from("setting")
    .select("value")
    .eq("key", "batch_gruppierung")
    .maybeSingle();
  const cfg = (cfgRow?.value as Record<string, string[]>) ?? {};
  const { data: grpRows } = await supabase
    .from("opri_produkt_gruppe")
    .select("kuerzel, titel_kuerzel");
  const gruppeKuerzel: Record<string, string> = {};
  for (const g of grpRows ?? []) {
    if (g.titel_kuerzel) gruppeKuerzel[g.kuerzel as string] = g.titel_kuerzel as string;
  }
  const { data: raw } = await supabase
    .from("batch")
    .select(
      "id, nummer, typ, schluessel, druckverfahren, cello, cello_seiten, papier, druckbogen, status, created_at, an_flux_at, flux_order_id, " +
        "job(id, typ, bauteil, format, papier, cello, netto_bogen, druckbogen, nutzen, auflage, zuschuss, teilung, durchmesser, schlaufen_gesamt, komponenten, status, portal_order_id, " +
        "order:portal_order_id(external_reference, deliver_date, blockstaerke_mm:resolve_result->>blockstaerke_mm, gruppe:resolve_result->>gruppe, prodformat:resolve_result->attribute->>format, ausrichtung:resolve_result->attribute->>ausrichtung, ausrichtung_quelle:resolve_result->attribute->>ausrichtung_quelle))",
    )
    .neq("status", "storniert")
    .order("created_at", { ascending: true });
  const batches = (raw ?? []) as unknown as Batch[];

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Druck-Dashboard</h1>
        <div className="toolbar" style={{ gap: 8, alignItems: "center" }}>
          <Link href="/druck/plan" className="ghost" style={{ padding: "7px 12px" }}>
            Belegungs-Board →
          </Link>
          <Link href="/druckauftraege" className="ghost" style={{ padding: "7px 12px" }}>
            Druckaufträge →
          </Link>
        </div>
      </div>
      <div style={{ margin: "6px 0 10px" }}>
        <SortControls />
      </div>
      <p className="lead">
        Batches sammeln Arbeitsvorgänge auftragsübergreifend. Druck-Batches sind nach
        Anzahl Loops · Farbe Spirale · Durchmesser gruppiert (aus der Wire-O-Zeile); der
        flux-Versand läuft je Auftrag im Druckauftrag.
      </p>

      {batches.length === 0 && (
        <p className="lead">Noch keine Batches. In einem Auftrag „Jobs erzeugen" klicken.</p>
      )}

      {TYPEN.map(({ typ, label, hint }) => {
        const list = batches.filter((b) => b.typ === typ && (b.job?.length ?? 0) > 0);
        if (!list.length) return null;
        return (
          <section key={typ} style={{ marginTop: 26 }}>
            <h2 style={{ marginBottom: 2 }}>
              {label} <span className="count">{list.length}</span>
            </h2>
            <p className="lead" style={{ marginTop: 0 }}>{hint}</p>
            {BUCKETS.map((bucket) => {
              const ltKey = (b: Batch) => fruehesterLiefer(b) ?? "9999-99-99";
              const sortWert = (b: Batch) => (sort ? critWert(b, sort, cfg) : b.schluessel ?? "");
              // innerhalb einer Gruppe: ältester Liefertermin oben
              const byLiefer = (a: Batch, b: Batch) => ltKey(a).localeCompare(ltKey(b));
              const bl = list
                .filter((b) => bucket.states.includes(b.status))
                .sort((a, b) => {
                  const c = sortWert(a).localeCompare(sortWert(b), "de", { numeric: true });
                  return (desc ? -c : c) || byLiefer(a, b);
                });
              if (!bl.length) return null;

              // Nach Einzelkriterium gruppieren?
              const gruppen: [string, Batch[]][] = group
                ? Object.entries(
                    bl.reduce<Record<string, Batch[]>>((acc, b) => {
                      const k = critWert(b, group, cfg);
                      (acc[k] ??= []).push(b);
                      return acc;
                    }, {}),
                  )
                    .map(([k, arr]) => [k, [...arr].sort(byLiefer)] as [string, Batch[]])
                    .sort((x, y) =>
                      x[0].localeCompare(y[0], "de", { numeric: true }) * (desc ? -1 : 1),
                    )
                : [["", bl]];

              return (
                <div key={bucket.label} style={{ marginTop: 10 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--muted)" }}>
                    {bucket.label} · {bl.length}
                  </h3>
                  {gruppen.map(([gk, gb]) => (
                    <div key={gk || "_"} style={{ marginBottom: group ? 14 : 0 }}>
                      {group && (
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            margin: "10px 0 4px",
                            padding: "4px 10px",
                            background: "var(--tag-bg)",
                            borderRadius: 6,
                            display: "inline-flex",
                            gap: 10,
                            alignItems: "baseline",
                          }}
                        >
                          <span>
                            {DIM_LABEL[group] ?? group}: {gk}{" "}
                            <span className="count">· {gb.length}</span>
                          </span>
                          {fruehesterLiefer(gb[0]) && (
                            <span style={{ color: "var(--accent)" }}>
                              Liefertermin ab {fmtDate(fruehesterLiefer(gb[0]))}
                            </span>
                          )}
                        </div>
                      )}
                      {gb.map((b) => (
                        <BatchCard key={b.id} b={b} cfg={cfg} gruppeKuerzel={gruppeKuerzel} />
                      ))}
                    </div>
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
