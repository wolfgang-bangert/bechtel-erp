"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { autoAssignAction, movePlanBatch, setBatchDauer } from "./actions";

export type Maschine = {
  id: string;
  name: string;
  typ: string;
  farbe: string | null;
  kapazitaet_bogen_h: number | null;
  druckverfahren: string | null;
  max_farben: number | null;
  geladen: { papier: string | null; format: string | null }[] | null;
};
export type PlanJob = {
  netto_bogen: number | null;
  auflage: number;
  zuschuss: number;
  schlaufen_gesamt: number | null;
};
export type PlanBatch = {
  id: string;
  nummer: string;
  typ: string;
  schluessel: string | null;
  cello: string;
  cello_seiten: number;
  papier: string | null;
  druckbogen: string | null;
  druckverfahren: string | null;
  status: string;
  maschine_id: string | null;
  dauer_minuten: number | null;
  plan_reihenfolge: number | null;
  created_at: string;
  flux_order_id: string | null;
  job: PlanJob[];
};

const TYPEN: { typ: string; label: string }[] = [
  { typ: "cello", label: "Cellophanieren" },
  { typ: "binden", label: "Binden" },
];

const PHASES = [
  { key: "warteschlange", label: "Warteschlange", states: ["offen", "bereit"] },
  { key: "laeuft", label: "Läuft", states: ["an_flux", "im_druck", "gedruckt", "cellophaniert"] },
  { key: "fertig", label: "Fertig", states: ["abgeschlossen"] },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

function phaseOf(status: string): PhaseKey {
  for (const p of PHASES) if ((p.states as readonly string[]).includes(status)) return p.key;
  return "warteschlange";
}
function alterTage(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return "heute";
  if (d < 2) return "1 Tag";
  return `${Math.floor(d)} Tage`;
}
const sum = (js: PlanJob[], f: (j: PlanJob) => number) => js.reduce((a, j) => a + f(j), 0);

function laneKey(maschineId: string | null) {
  return maschineId ?? "";
}

export function PlanBoard({
  maschinen,
  batches: initial,
}: {
  maschinen: Maschine[];
  batches: PlanBatch[];
}) {
  const router = useRouter();
  const [batches, setBatches] = useState<PlanBatch[]>(initial);
  const [typ, setTyp] = useState<string>("druck");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCell, setDropCell] = useState<string>(""); // `${laneKey}|${phase}`
  const [err, setErr] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [pending, start] = useTransition();

  const lanes = useMemo<Maschine[]>(() => {
    const ms = maschinen.filter((m) => m.typ === typ);
    return [
      ...ms,
      {
        id: "",
        name: "Ohne Maschine",
        typ,
        farbe: null,
        kapazitaet_bogen_h: null,
        druckverfahren: null,
        max_farben: null,
        geladen: null,
      },
    ];
  }, [maschinen, typ]);

  const shown = useMemo(
    () => batches.filter((b) => b.typ === typ && (b.job?.length ?? 0) > 0),
    [batches, typ],
  );

  function cellBatches(maschineId: string, phase: PhaseKey): PlanBatch[] {
    return shown
      .filter((b) => laneKey(b.maschine_id) === maschineId && phaseOf(b.status) === phase)
      .sort(
        (a, b) =>
          (a.plan_reihenfolge ?? 1e9) - (b.plan_reihenfolge ?? 1e9) ||
          a.nummer.localeCompare(b.nummer),
      );
  }

  function laneLoad(maschineId: string) {
    const inLane = shown.filter(
      (b) => laneKey(b.maschine_id) === maschineId && b.status !== "abgeschlossen",
    );
    const min = inLane.reduce((a, b) => a + (b.dauer_minuten ?? 0), 0);
    const bogen = inLane.reduce((a, b) => a + sum(b.job, (j) => j.netto_bogen ?? 0), 0);
    return { anz: inLane.length, min, bogen };
  }

  function drop(maschineId: string, phase: PhaseKey, beforeId?: string) {
    setDropCell("");
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const moved = batches.find((b) => b.id === id);
    if (!moved) return;

    const targetStatusUnchanged = phaseOf(moved.status) === phase;
    const nextStatus = targetStatusUnchanged
      ? moved.status
      : phase === "warteschlange"
        ? "bereit"
        : phase === "laeuft"
          ? "im_druck"
          : "abgeschlossen";

    // Ziel-Lane-Reihenfolge zusammenbauen
    const current = cellBatches(maschineId, phase).filter((b) => b.id !== id);
    const idx = beforeId ? current.findIndex((b) => b.id === beforeId) : -1;
    const orderedIds =
      idx >= 0
        ? [...current.slice(0, idx).map((b) => b.id), id, ...current.slice(idx).map((b) => b.id)]
        : [...current.map((b) => b.id), id];

    // optimistisch
    setBatches((prev) =>
      prev.map((b) => {
        if (b.id === id)
          return { ...b, maschine_id: maschineId || null, status: nextStatus };
        return b;
      }),
    );
    setBatches((prev) =>
      prev.map((b) => {
        const p = orderedIds.indexOf(b.id);
        return p >= 0 ? { ...b, plan_reihenfolge: p } : b;
      }),
    );

    start(async () => {
      const r = await movePlanBatch({
        batchId: id,
        maschineId: maschineId || null,
        phase: targetStatusUnchanged ? "" : phase,
        orderedIds,
      });
      if (!r.ok) {
        setErr(r.error ?? "Fehler beim Speichern");
        router.refresh();
      } else {
        setErr("");
        router.refresh();
      }
    });
  }

  function saveDauer(id: string, raw: string) {
    const v = raw.trim() === "" ? null : Number(raw);
    setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, dauer_minuten: v } : b)));
    start(async () => {
      await setBatchDauer(id, v);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="toolbar" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {TYPEN.map((t) => {
          const n = batches.filter((b) => b.typ === t.typ && b.status !== "abgeschlossen").length;
          return (
            <button
              key={t.typ}
              className={typ === t.typ ? undefined : "ghost"}
              onClick={() => setTyp(t.typ)}
              style={{ padding: "6px 12px" }}
            >
              {t.label} <span className="count">{n}</span>
            </button>
          );
        })}
        {typ === "druck" && (
          <button
            className="ghost"
            style={{ padding: "6px 12px" }}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await autoAssignAction();
                setErr(r.ok ? "" : (r.error ?? "Fehler"));
                setNote(r.ok ? (r.note ?? "") : "");
                router.refresh();
              })
            }
          >
            ⚙ Maschinen automatisch zuordnen
          </button>
        )}
        {pending && <span className="count">speichert …</span>}
        {note && <span className="msg-ok">{note}</span>}
        {err && <span className="msg-err">{err}</span>}
      </div>

      {lanes.length <= 1 && (
        <p className="lead">
          Keine Maschine vom Typ „{TYPEN.find((t) => t.typ === typ)?.label}". In{" "}
          <Link href="/einstellungen/maschinen">Maschinen</Link> anlegen.
        </p>
      )}

      <div className="plan-wrap">
        <div className="plan-grid">
          <div className="plan-col-head">Maschine</div>
          {PHASES.map((p) => (
            <div key={p.key} className="plan-col-head">
              {p.label}
            </div>
          ))}

          {lanes.map((lane) => {
            const load = laneLoad(lane.id);
            return (
              <div key={lane.id || "none"} style={{ display: "contents" }}>
                <div
                  className="plan-lane-head"
                  style={{ borderLeftColor: lane.farbe ?? "var(--border)" }}
                >
                  <strong>{lane.name}</strong>
                  {lane.id && (
                    <div className="count" style={{ marginTop: 2 }}>
                      {[
                        lane.druckverfahren,
                        lane.max_farben ? `${lane.max_farben}-farbig` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {lane.geladen && lane.geladen.length > 0 ? (
                        <div style={{ marginTop: 2 }}>
                          gerüstet:{" "}
                          {lane.geladen
                            .map((g) => [g.papier, g.format].filter(Boolean).join(" "))
                            .join(" • ")}
                        </div>
                      ) : (
                        lane.druckverfahren && <div style={{ marginTop: 2 }}>nichts gerüstet</div>
                      )}
                    </div>
                  )}
                  <div className="count" style={{ marginTop: 4 }}>
                    {load.anz} Batches
                    {load.min > 0 && ` · ~${Math.round(load.min / 60)} h`}
                    {load.bogen > 0 && ` · ${load.bogen.toLocaleString("de-DE")} Bogen`}
                  </div>
                </div>

                {PHASES.map((phase) => {
                  const cellId = `${lane.id}|${phase.key}`;
                  const list = cellBatches(lane.id, phase.key);
                  return (
                    <div
                      key={cellId}
                      className={`plan-cell${dropCell === cellId ? " drop" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropCell(cellId);
                      }}
                      onDragLeave={() => setDropCell((c) => (c === cellId ? "" : c))}
                      onDrop={(e) => {
                        e.preventDefault();
                        drop(lane.id, phase.key);
                      }}
                    >
                      {list.map((b) => {
                        const expl = sum(b.job, (j) => (j.auflage || 0) + (j.zuschuss || 0));
                        const bogen = sum(b.job, (j) => j.netto_bogen ?? 0);
                        const schlaufen = sum(b.job, (j) => j.schlaufen_gesamt ?? 0);
                        return (
                          <div
                            key={b.id}
                            className={`plan-card${dragId === b.id ? " dragging" : ""}`}
                            draggable
                            onDragStart={() => setDragId(b.id)}
                            onDragEnd={() => {
                              setDragId(null);
                              setDropCell("");
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDropCell(cellId);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              drop(lane.id, phase.key, b.id);
                            }}
                            style={{ borderLeftColor: lane.farbe ?? "var(--muted)" }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                              <Link href={`/druck#${b.nummer}`} style={{ fontWeight: 600 }}>
                                {b.nummer}
                              </Link>
                              <span className="count">{b.job.length} Jobs</span>
                            </div>
                            <div className="pc-meta">
                              {[
                                b.schluessel?.split(" | ")[0],
                                b.cello !== "keine" && `Cello ${b.cello}`,
                                b.papier,
                                b.druckbogen,
                                b.druckverfahren,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            <div className="pc-meta">
                              {b.typ === "druck" && bogen > 0 && `${bogen.toLocaleString("de-DE")} Bogen · `}
                              {b.typ === "binden" && schlaufen > 0 && `${schlaufen.toLocaleString("de-DE")} Schlaufen · `}
                              {expl.toLocaleString("de-DE")} Expl. · seit {alterTage(b.created_at)}
                              {b.flux_order_id && ` · flux ${b.flux_order_id}`}
                            </div>
                            <label className="pc-meta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              Dauer
                              <input
                                className="pc-dauer"
                                type="number"
                                min={0}
                                defaultValue={b.dauer_minuten ?? ""}
                                onBlur={(e) => {
                                  const raw = e.target.value;
                                  if (raw !== String(b.dauer_minuten ?? "")) saveDauer(b.id, raw);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onDragStart={(e) => e.preventDefault()}
                              />
                              min
                            </label>
                          </div>
                        );
                      })}
                      {!list.length && <span className="count">–</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
