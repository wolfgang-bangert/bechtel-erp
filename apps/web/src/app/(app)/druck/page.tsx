import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { BatchActions } from "./BatchActions";
import { BatchRow } from "./BatchRow";
import { SortControls } from "./SortControls";
import { FluxOrderButton } from "./FluxOrderButton";

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
  flux_order_item_id: string | null;
  order: {
    external_reference: string | null;
    blockstaerke_mm: string | null;
    gruppe: string | null;
    prodformat: string | null;
    ausrichtung: string | null;
    ausrichtung_quelle: string | null;
    deliver_date: string | null;
    flux_order_id: string | null;
    flux_status: string | null;
    flux_sent_at: string | null;
    abweichungen: { feld: string; text: string }[] | null;
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

type Abteilung = "druck" | "cello" | "binden" | "konfektion" | "versand";

const TYPEN: { typ: string; label: string; hint: string; abteilung: Abteilung }[] = [
  { typ: "druck", label: "Drucken", hint: "Schlüssel: Anzahl Loops · Farbe Spirale · Durchmesser", abteilung: "druck" },
  { typ: "cello", label: "Cellophanieren", hint: "nach dem Umschlag-Druck", abteilung: "cello" },
  { typ: "binden", label: "Binden (Wire-O)", hint: "Durchmesser (+ Aufhänger) → Loops/Farbe → Farbe", abteilung: "binden" },
  { typ: "konfektion", label: "Konfektionieren (Multiloft)", hint: "Cover + Inlay + Cover stapeln, Nutzen schneiden", abteilung: "konfektion" },
];

const ABTEILUNGEN: { key: Abteilung; label: string }[] = [
  { key: "druck", label: "Druck" },
  { key: "cello", label: "Cello" },
  { key: "binden", label: "Binden" },
  { key: "konfektion", label: "Konfektion" },
  { key: "versand", label: "Versand" },
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

/**
 * Batch-Schlüssel + Config → [{label, wert}] ohne Leerwerte. `ausblenden`
 * lässt Felder weg, die schon als Gruppen-Überschrift darüber stehen (z.B.
 * Durchmesser/Loops/Farbe bei Binden) - sonst stünden sie doppelt da.
 */
function schluesselTeile(
  typ: string,
  schluessel: string,
  cfg: Record<string, string[]>,
  ausblenden: string[] = [],
) {
  const felder = cfg[typ] ?? [];
  const werte = (schluessel ?? "").split(" | ");
  return felder
    .map((f, i) => ({ f, label: FELD_LABEL[f] ?? f, wert: (werte[i] ?? "").trim() }))
    .filter((x) => x.wert && !ausblenden.includes(x.f));
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
  liefertermin: "Liefertermin",
  loops: "Anzahl Loops",
  spiralfarbe: "Farbe Spirale",
  durchmesser: "Durchmesser",
  teilung: "Teilung",
  aufhaenger: "Aufhänger",
  format: "Format",
};

/** Batches nach einem Schlüssel gruppieren, alphabetisch/numerisch sortiert. */
function groupSorted(bs: Batch[], keyFn: (b: Batch) => string): [string, Batch[]][] {
  const acc: Record<string, Batch[]> = {};
  for (const b of bs) (acc[keyFn(b)] ??= []).push(b);
  return Object.entries(acc).sort((x, y) => x[0].localeCompare(y[0], "de", { numeric: true }));
}

/** Wert eines Batches für eine Sortier-/Gruppier-Dimension. */
function critWert(b: Batch, dim: string, cfg: Record<string, string[]>): string {
  if (dim === "liefertermin") return fruehesterLiefer(b) ?? "9999-99-99";
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

// ---- grafische Kriterien-Chips ------------------------------------------
const SPIRAL_HEX: Record<string, string> = {
  "weiß": "#ffffff",
  weiss: "#ffffff",
  silber: "#c7ccd1",
  silver: "#c7ccd1",
  schwarz: "#1b1b1e",
  black: "#1b1b1e",
  gold: "#d4af37",
  blau: "#2f6feb",
  rot: "#c0392b",
  gruen: "#2e9e5b",
  "grün": "#2e9e5b",
};
const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--panel)",
  fontSize: 12,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

function KriteriumChip({ label, wert }: { label: string; wert: string }) {
  if (label === "Farbe Spirale") {
    const hex = SPIRAL_HEX[wert.toLowerCase()] ?? "var(--muted)";
    return (
      <span style={chip}>
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: hex,
            border: "1px solid var(--border)",
            flex: "none",
          }}
        />
        {wert}
      </span>
    );
  }
  if (label === "Durchmesser") {
    const mm =
      parseFloat((wert.match(/([\d.,]+)\s*mm/) || [])[1]?.replace(",", ".") || "") || 6;
    const r = Math.max(4, Math.min(12, mm * 0.62));
    return (
      <span style={chip} title={wert}>
        <svg width={26} height={26} style={{ flex: "none" }} aria-hidden>
          <circle
            cx={13}
            cy={13}
            r={r}
            fill="none"
            stroke="var(--text)"
            strokeWidth={2}
          />
        </svg>
        {wert.replace(/\s*\(.*\)\s*/, "")}
      </span>
    );
  }
  if (label === "Anzahl Loops") {
    return (
      <span style={chip} title="Loops pro Exemplar">
        <svg width={22} height={14} style={{ flex: "none" }} aria-hidden>
          <path
            d="M2 7c2-6 6-6 8 0s6 6 8 0"
            fill="none"
            stroke="var(--muted)"
            strokeWidth={1.6}
          />
        </svg>
        <strong>{wert}</strong> Loops
      </span>
    );
  }
  if (label === "Aufhänger") {
    return (
      <span style={{ ...chip, color: "var(--accent)", borderColor: "var(--accent)" }}>
        <svg width={12} height={14} style={{ flex: "none" }} aria-hidden>
          <path
            d="M6 13V6M6 6c0-3-4-3-4-1M6 2a1 1 0 100-.01"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
          />
        </svg>
        Aufhänger
      </span>
    );
  }
  if (label === "Teilung") {
    return (
      <span style={chip}>
        <span className="count">Teilung</span> {wert}
      </span>
    );
  }
  return (
    <span style={chip}>
      <span className="count">{label}</span> {wert}
    </span>
  );
}

function KriterienChips({
  typ,
  schluessel,
  cfg,
  ausblenden,
}: {
  typ: string;
  schluessel: string;
  cfg: Record<string, string[]>;
  ausblenden?: string[];
}) {
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, verticalAlign: "middle" }}>
      {schluesselTeile(typ, schluessel, cfg, ausblenden).map((t) => (
        <KriteriumChip key={t.label} label={t.label} wert={t.wert} />
      ))}
    </span>
  );
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

/** Anzahl Abweichungen Auftrag ↔ Druckdaten über beliebig viele Jobs, je Auftrag einmal gezählt. */
function abweichungenGesamt(jobs: Job[]): number {
  const proOrder = new Map<string, { feld: string; text: string }[]>();
  for (const j of jobs) {
    if (j.portal_order_id && j.order?.abweichungen?.length)
      proOrder.set(j.portal_order_id, j.order.abweichungen);
  }
  return [...proOrder.values()].reduce((a, x) => a + x.length, 0);
}

/** Kopfzeile für eine BatchTabelle. */
function BatchTabelleHead() {
  return (
    <thead>
      <tr>
        <th />
        <th>Batch</th>
        <th>Kriterien</th>
        <th>Liefertermin</th>
        <th>Status</th>
        <th style={{ textAlign: "right" }}>Jobs / Menge</th>
        <th>Abw.</th>
      </tr>
    </thead>
  );
}

/** Kompakte, aufklappbare Tabellenansicht einer Batch-Liste. */
function BatchTabelle({
  batches,
  cfg,
  gruppeKuerzel,
  fluxUrlTpl,
  ausblenden,
}: {
  batches: Batch[];
  cfg: Record<string, string[]>;
  gruppeKuerzel: Record<string, string>;
  fluxUrlTpl: string | null;
  ausblenden?: string[];
}) {
  return (
    <div className="table-scroll">
      <table className="data">
        <BatchTabelleHead />
        <tbody>
          {batches.map((b) => (
            <BatchZeile key={b.id} b={b} cfg={cfg} gruppeKuerzel={gruppeKuerzel} fluxUrlTpl={fluxUrlTpl} ausblenden={ausblenden} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchZeile({
  b,
  cfg,
  gruppeKuerzel,
  fluxUrlTpl,
  ausblenden,
}: {
  b: Batch;
  cfg: Record<string, string[]>;
  gruppeKuerzel: Record<string, string>;
  fluxUrlTpl: string | null;
  ausblenden?: string[];
}) {
  const jobs = b.job ?? [];
  const bogen = sum(jobs, (j) => j.netto_bogen ?? 0);
  const expl = sum(jobs, (j) => (j.auflage || 0) + (j.zuschuss || 0));
  const schlaufen = sum(jobs, (j) => j.schlaufen_gesamt ?? 0);
  const lts = jobs.map((j) => j.order?.deliver_date).filter(Boolean).sort() as string[];
  const ltText = lts.length ? fmtDate(lts[0]) : null;
  const abwGesamt = abweichungenGesamt(jobs);
  const mengeTxt =
    b.typ === "druck"
      ? `${bogen.toLocaleString("de-DE")} Bogen`
      : b.typ === "binden"
        ? `${schlaufen.toLocaleString("de-DE")} Schlaufen`
        : `${expl.toLocaleString("de-DE")} Expl.`;

  return (
    <BatchRow
      cols={[
        <strong key="nr">{b.nummer}</strong>,
        <KriterienChips key="k" typ={b.typ} schluessel={b.schluessel} cfg={cfg} ausblenden={ausblenden} />,
        ltText ?? "—",
        <span key="s" className="tag">
          {b.status}
        </span>,
        <span key="m" style={{ whiteSpace: "nowrap" }}>
          {jobs.length} / {mengeTxt}
        </span>,
        abwGesamt > 0 ? (
          <span
            key="a"
            style={{ ...chip, padding: "1px 7px", color: "#b45309", borderColor: "#b45309", background: "#fffbeb" }}
          >
            ⚠ {abwGesamt}
          </span>
        ) : (
          "—"
        ),
      ]}
    >
      <div className="count" style={{ marginBottom: 6 }}>
        {b.flux_order_id ? `flux ${b.flux_order_id} · ` : ""}seit {alterTage(b.created_at)}
      </div>
      <div>
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
                  {j.order?.flux_status && (
                    <>
                      {"  ·  "}
                      <span style={{ ...chip, background: "var(--tag-bg)", padding: "1px 7px" }}>
                        flux: {j.order.flux_status}
                      </span>
                    </>
                  )}
                  {j.order?.abweichungen?.length ? (
                    <>
                      {"  "}
                      <span
                        style={{ ...chip, padding: "1px 7px", color: "#b45309", borderColor: "#b45309", background: "#fffbeb" }}
                        title={j.order.abweichungen.map((a) => a.text).join("\n")}
                      >
                        ⚠ {j.order.abweichungen.length}
                      </span>
                    </>
                  ) : null}
                </summary>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7 }}>
                  {j.order?.abweichungen?.length ? (
                    <div style={{ color: "#b45309", marginBottom: 4 }}>
                      {j.order.abweichungen.map((a, i) => (
                        <div key={i}>⚠ {a.text}</div>
                      ))}
                    </div>
                  ) : null}
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
                  {b.typ === "druck" && j.portal_order_id && (
                    <FluxOrderButton
                      portalOrderId={j.portal_order_id}
                      fluxOrderId={j.order?.flux_order_id ?? null}
                      fluxStatus={j.order?.flux_status ?? null}
                      fluxUrl={
                        fluxUrlTpl && j.flux_order_item_id
                          ? fluxUrlTpl.replace("{orderItemId}", j.flux_order_item_id)
                          : null
                      }
                    />
                  )}
                </div>
              </details>
            );
          })}
          {!jobs.length && <div className="count">Keine Jobs.</div>}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary className="count" style={{ cursor: "pointer", padding: "2px 0" }}>
          Aktionen
        </summary>
        <div style={{ marginTop: 4 }}>
          <BatchActions id={b.id} typ={b.typ} status={b.status} cello={b.cello} />
        </div>
      </details>
    </BatchRow>
  );
}

/** Durchmesser, mit eigener Sondergruppe für "+ Aufhänger" (Kalenderaufhänger
 *  ändert die Fertigung spürbar - deshalb eigene Gruppe statt nur ein Chip). */
function durchmesserAufhKey(b: Batch, cfg: Record<string, string[]>): string {
  const d = critWert(b, "durchmesser", cfg);
  const mitAufhaenger = critWert(b, "aufhaenger", cfg) === "mit";
  return mitAufhaenger ? `${d} + Aufhänger` : d;
}

/** Kleine Überschrift + große fette Zahl/Wert darunter. */
function LabelWert({ label, wert }: { label: string; wert: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.2 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--muted)" }}>
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{wert}</span>
    </span>
  );
}

/** Eine Gruppen-Kopfzeile: Label/Wert, Liefertermin, Abweichungen - je eine
 *  kleine Überschrift mit großem, fettem Wert darunter. */
function GruppenZeile({
  label,
  wert,
  batches,
  indent,
  as: As = "div",
}: {
  label: string;
  wert: string;
  batches: Batch[];
  indent: number;
  as?: "div" | "summary";
}) {
  const liefer = fruehesterLiefer(batches[0]);
  const abw = abweichungenGesamt(batches.flatMap((b) => b.job ?? []));
  return (
    <As
      style={{
        display: "flex",
        gap: 26,
        alignItems: "flex-end",
        padding: "6px 10px",
        marginLeft: indent,
        borderBottom: "1px solid var(--border)",
        cursor: As === "summary" ? "pointer" : undefined,
      }}
    >
      <LabelWert label={label} wert={wert} />
      <LabelWert label="Liefertermin" wert={liefer ? `ab ${fmtDate(liefer)}` : "—"} />
      <LabelWert
        label="Abweichungen"
        wert={abw > 0 ? <span style={{ color: "#b45309" }}>{abw}</span> : "—"}
      />
    </As>
  );
}

/** Flache Job-Tabelle (über alle Batches einer Endgruppe hinweg). */
function JobsTabelle({ batches, gruppeKuerzel }: { batches: Batch[]; gruppeKuerzel: Record<string, string> }) {
  const jobs = batches.flatMap((b) => b.job ?? []);
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Auftrag</th>
            <th>Liefertermin</th>
            <th>Produktgruppe</th>
            <th>Bauteil</th>
            <th style={{ textAlign: "right" }}>Menge</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>
                {j.portal_order_id ? (
                  <a href={`/druckauftraege/${j.portal_order_id}`} target="_blank" rel="noreferrer">
                    {j.order?.external_reference ?? j.portal_order_id.slice(0, 8)}
                  </a>
                ) : (
                  "—"
                )}
                {j.order?.abweichungen?.length ? (
                  <span title={j.order.abweichungen.map((a) => a.text).join("\n")} style={{ color: "#b45309" }}>
                    {" "}
                    ⚠
                  </span>
                ) : null}
              </td>
              <td>{j.order?.deliver_date ? fmtDate(j.order.deliver_date) : "—"}</td>
              <td className="count">
                {(j.order?.gruppe && (gruppeKuerzel[j.order.gruppe] ?? j.order.gruppe)) ?? "—"}
              </td>
              <td>{j.bauteil}</td>
              <td style={{ textAlign: "right" }}>{((j.auflage || 0) + (j.zuschuss || 0)).toLocaleString("de-DE")}</td>
              <td className="count">{j.status}</td>
            </tr>
          ))}
          {!jobs.length && (
            <tr>
              <td colSpan={6} style={{ color: "var(--muted)" }}>
                Keine Jobs.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Feste Gruppierungs-Hierarchie für Binden (Weiterverarbeitung), statt der
 * freien Gruppieren/Untergruppieren-Auswahl: Durchmesser (+ Aufhänger als
 * eigene Sondergruppe) ist immer die oberste Ebene. Darunter, je Modus:
 *   "loops" → Anzahl Loops → Farbe Spirale (3 Ebenen)
 *   "farbe" → Farbe Spirale (2 Ebenen)
 * Gruppenköpfe sind schlanke, immer sichtbare Zeilen (Label/Wert, groß+fett);
 * nur die Jobs-Tabelle ganz unten klappt auf.
 */
function BindenGruppen({
  batches,
  modus,
  cfg,
  gruppeKuerzel,
}: {
  batches: Batch[];
  modus: "loops" | "farbe";
  cfg: Record<string, string[]>;
  gruppeKuerzel: Record<string, string>;
  fluxUrlTpl: string | null;
}) {
  return (
    <>
      {groupSorted(batches, (b) => durchmesserAufhKey(b, cfg)).map(([k1, g1]) => (
        <div key={k1 || "_"} style={{ marginBottom: 6 }}>
          <GruppenZeile label="Durchmesser" wert={k1} batches={g1} indent={0} />
          {modus === "farbe"
            ? groupSorted(g1, (b) => critWert(b, "spiralfarbe", cfg)).map(([k2, g2]) => (
                <div key={k2 || "_"}>
                  <GruppenZeile label="Farbe Spirale" wert={k2} batches={g2} indent={22} />
                  <details style={{ marginLeft: 22 }}>
                    <summary className="count" style={{ cursor: "pointer", padding: "4px 10px" }}>
                      {g2.reduce((n, b) => n + (b.job?.length ?? 0), 0)} Jobs anzeigen
                    </summary>
                    <JobsTabelle batches={g2} gruppeKuerzel={gruppeKuerzel} />
                  </details>
                </div>
              ))
            : groupSorted(g1, (b) => critWert(b, "loops", cfg)).map(([k2, g2]) => (
                <div key={k2 || "_"}>
                  <GruppenZeile label="Anzahl Loops" wert={k2} batches={g2} indent={22} />
                  {groupSorted(g2, (b) => critWert(b, "spiralfarbe", cfg)).map(([k3, g3]) => (
                    <div key={k3 || "_"}>
                      <GruppenZeile label="Farbe Spirale" wert={k3} batches={g3} indent={44} />
                      <details style={{ marginLeft: 44 }}>
                        <summary className="count" style={{ cursor: "pointer", padding: "4px 10px" }}>
                          {g3.reduce((n, b) => n + (b.job?.length ?? 0), 0)} Jobs anzeigen
                        </summary>
                        <JobsTabelle batches={g3} gruppeKuerzel={gruppeKuerzel} />
                      </details>
                    </div>
                  ))}
                </div>
              ))}
        </div>
      ))}
    </>
  );
}

export default async function DruckDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    group?: string;
    group2?: string;
    dir?: string;
    abteilung?: string;
    modus?: string;
  }>;
}) {
  const { sort = "", group = "", group2 = "", dir = "asc", abteilung: abteilungParam, modus: modusParam } =
    await searchParams;
  const ABTEILUNG_KEYS = new Set(ABTEILUNGEN.map((a) => a.key));
  const abteilung: Abteilung = ABTEILUNG_KEYS.has(abteilungParam as Abteilung)
    ? (abteilungParam as Abteilung)
    : "druck";
  const modus: "loops" | "farbe" = modusParam === "farbe" ? "farbe" : "loops";
  const desc = dir === "desc";
  const supabase = await createClient();
  const { data: cfgRow } = await supabase
    .from("setting")
    .select("value")
    .eq("key", "batch_gruppierung")
    .maybeSingle();
  const cfg = (cfgRow?.value as Record<string, string[]>) ?? {};
  const { data: fluxUrlRow } = await supabase
    .from("setting")
    .select("value")
    .eq("key", "flux_order_url_tpl")
    .maybeSingle();
  const fluxUrlTpl = (fluxUrlRow?.value as string | null) ?? null;
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
        "job(id, typ, bauteil, format, papier, cello, netto_bogen, druckbogen, nutzen, auflage, zuschuss, teilung, durchmesser, schlaufen_gesamt, komponenten, status, portal_order_id, flux_order_item_id, " +
        "order:portal_order_id(external_reference, deliver_date, flux_order_id, flux_status, flux_sent_at, abweichungen:resolve_result->abweichungen, blockstaerke_mm:resolve_result->>blockstaerke_mm, gruppe:resolve_result->>gruppe, prodformat:resolve_result->attribute->>format, ausrichtung:resolve_result->attribute->>ausrichtung, ausrichtung_quelle:resolve_result->attribute->>ausrichtung_quelle))",
    )
    .neq("status", "storniert")
    .order("created_at", { ascending: true });
  const batches = (raw ?? []) as unknown as Batch[];

  let versandJobs: {
    id: string;
    bauteil: string;
    auflage: number;
    status: string;
    versand_datum: string | null;
    versand_tracking: string | null;
    created_at: string;
    portal_order_id: string | null;
    order: { external_reference: string | null; deliver_date: string | null } | null;
  }[] = [];
  if (abteilung === "versand") {
    const { data: vRaw } = await supabase
      .from("job")
      .select(
        "id, bauteil, auflage, status, versand_datum, versand_tracking, created_at, portal_order_id, " +
          "order:portal_order_id(external_reference, deliver_date)",
      )
      .eq("typ", "versand")
      .neq("status", "storniert")
      .order("created_at", { ascending: false });
    versandJobs = (vRaw ?? []) as unknown as typeof versandJobs;
  }

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <div className="toolbar" style={{ gap: 8, alignItems: "center" }}>
          <Link href="/druck/plan" className="ghost" style={{ padding: "7px 12px" }}>
            Belegungs-Board →
          </Link>
          <Link href="/druckauftraege" className="ghost" style={{ padding: "7px 12px" }}>
            Druckaufträge →
          </Link>
        </div>
      </div>

      <div className="toolbar" style={{ gap: 6, marginTop: 4 }}>
        {ABTEILUNGEN.map((a) => {
          const href = a.key === "druck" ? "/druck" : `/druck?abteilung=${a.key}`;
          const aktiv = a.key === abteilung;
          return (
            <Link
              key={a.key}
              href={href}
              className={aktiv ? undefined : "ghost"}
              style={{ padding: "7px 14px" }}
            >
              {a.label}
            </Link>
          );
        })}
      </div>

      {abteilung === "binden" ? (
        <div className="toolbar" style={{ gap: 6, margin: "10px 0", alignItems: "center" }}>
          <span className="count">Gruppieren nach</span>
          <Link
            href="/druck?abteilung=binden&modus=loops"
            className={modus === "loops" ? undefined : "ghost"}
            style={{ padding: "6px 12px" }}
          >
            Durchmesser + Anzahl Loops
          </Link>
          <Link
            href="/druck?abteilung=binden&modus=farbe"
            className={modus === "farbe" ? undefined : "ghost"}
            style={{ padding: "6px 12px" }}
          >
            Durchmesser + Farbe Spirale
          </Link>
        </div>
      ) : abteilung !== "versand" ? (
        <div style={{ margin: "10px 0" }}>
          <SortControls />
        </div>
      ) : null}

      <p className="lead">
        {abteilung === "druck" &&
          "Batches sammeln Arbeitsvorgänge auftragsübergreifend. Druck-Batches sind nach Anzahl Loops · Farbe Spirale · Durchmesser gruppiert (aus der Wire-O-Zeile); der flux-Versand läuft je Auftrag im Druckauftrag."}
        {abteilung === "cello" && "Batches sammeln Arbeitsvorgänge auftragsübergreifend, nach dem Umschlag-Druck."}
        {abteilung === "binden" &&
          "Durchmesser (mit eigener Gruppe für Kalenderaufhänger) ist immer die oberste Ebene - darunter je nach Auswahl Loops → Farbe oder direkt Farbe."}
        {abteilung === "konfektion" && "Multiloft: Cover + Inlay + Cover stapeln, Nutzen schneiden."}
        {abteilung === "versand" && "Versand-Arbeitsvorgänge je Auftrag (ein Vorgang deckt normalerweise die volle Menge ab, zusätzliche bei Teillieferungen)."}
      </p>

      {abteilung === "versand" ? (
        versandJobs.length === 0 ? (
          <p className="lead">Keine Versand-Vorgänge.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Auftrag</th>
                  <th>Vorgang</th>
                  <th style={{ textAlign: "right" }}>Menge</th>
                  <th>Liefertermin</th>
                  <th>Status</th>
                  <th>Tracking</th>
                </tr>
              </thead>
              <tbody>
                {versandJobs.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {v.portal_order_id ? (
                        <a href={`/druckauftraege/${v.portal_order_id}`} target="_blank" rel="noreferrer">
                          {v.order?.external_reference ?? v.portal_order_id.slice(0, 8)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{v.bauteil}</td>
                    <td style={{ textAlign: "right" }}>{v.auflage.toLocaleString("de-DE")}</td>
                    <td>{v.order?.deliver_date ? fmtDate(v.order.deliver_date) : "—"}</td>
                    <td className="count">{v.status}</td>
                    <td className="count">{v.versand_tracking ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          {batches.length === 0 && (
            <p className="lead">Noch keine Batches. In einem Auftrag „Jobs erzeugen" klicken.</p>
          )}

          {TYPEN.filter((t) => t.abteilung === abteilung).map(({ typ, label, hint }) => {
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

              if (abteilung === "binden") {
                return (
                  <div key={bucket.label} style={{ marginTop: 10 }}>
                    <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--muted)" }}>
                      {bucket.label} · {bl.length}
                    </h3>
                    <BindenGruppen
                      batches={bl}
                      modus={modus}
                      cfg={cfg}
                      gruppeKuerzel={gruppeKuerzel}
                      fluxUrlTpl={fluxUrlTpl}
                    />
                  </div>
                );
              }

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
                  {gruppen.map(([gk, gb]) => {
                    const gruppenAbw = abweichungenGesamt(gb.flatMap((b) => b.job ?? []));
                    return group ? (
                      <details key={gk || "_"} open style={{ marginBottom: 14 }}>
                        <summary
                          style={{
                            cursor: "pointer",
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
                            {DIM_LABEL[group] ?? group}:{" "}
                            {group === "liefertermin" ? fmtDate(gk) : gk}{" "}
                            <span className="count">· {gb.length}</span>
                          </span>
                          {fruehesterLiefer(gb[0]) && (
                            <span style={{ color: "var(--accent)" }}>
                              Liefertermin ab {fmtDate(fruehesterLiefer(gb[0]))}
                            </span>
                          )}
                          {gruppenAbw > 0 && (
                            <span
                              style={{ ...chip, padding: "1px 7px", color: "#b45309", borderColor: "#b45309", background: "#fffbeb" }}
                              title="Abweichungen Auftrag ↔ Druckdaten in dieser Gruppe"
                            >
                              ⚠ {gruppenAbw} {gruppenAbw === 1 ? "Abweichung" : "Abweichungen"}
                            </span>
                          )}
                        </summary>
                        <div style={{ marginTop: 4 }}>
                          {group2 ? (
                            Object.entries(
                              gb.reduce<Record<string, Batch[]>>((acc, b) => {
                                const k = critWert(b, group2, cfg);
                                (acc[k] ??= []).push(b);
                                return acc;
                              }, {}),
                            )
                              .sort((x, y) => x[0].localeCompare(y[0], "de", { numeric: true }))
                              .map(([sk, sb]) => (
                                <details key={sk || "_"} open style={{ marginLeft: 14, marginBottom: 10 }}>
                                  <summary
                                    style={{
                                      cursor: "pointer",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: "var(--muted)",
                                      margin: "6px 0 4px",
                                    }}
                                  >
                                    {DIM_LABEL[group2] ?? group2}: {sk} · {sb.length}
                                  </summary>
                                  <div style={{ marginTop: 4 }}>
                                    <BatchTabelle batches={sb} cfg={cfg} gruppeKuerzel={gruppeKuerzel} fluxUrlTpl={fluxUrlTpl} />
                                  </div>
                                </details>
                              ))
                          ) : (
                            <BatchTabelle batches={gb} cfg={cfg} gruppeKuerzel={gruppeKuerzel} fluxUrlTpl={fluxUrlTpl} />
                          )}
                        </div>
                      </details>
                    ) : (
                      <div key={gk || "_"}>
                        <BatchTabelle batches={gb} cfg={cfg} gruppeKuerzel={gruppeKuerzel} fluxUrlTpl={fluxUrlTpl} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        );
      })}
        </>
      )}
    </>
  );
}
