import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FaelligTable, type FaelligOrder, type Gruppe } from "./FaelligTable";
import { PortalPullButton } from "../druckauftraege/PortalPullButton";

export const dynamic = "force-dynamic";

const TAGE = 30;
const TZ = "Europe/Berlin";
const isoTag = (d: Date | string) =>
  new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ }); // YYYY-MM-DD

const WOTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

type Row = {
  received_at: string;
  portal_state: string | null;
  pc1: string | null; // raw.createdAt        (API-Pull)
  pc2: string | null; // raw.api_createdAt_raw (Xano-Import)
};

/** Zeitpunkt, zu dem onlineprinters den Auftrag bereitgestellt hat. */
const eingangTag = (r: Row) => isoTag(r.pc1 ?? r.pc2 ?? r.received_at);

const GRUPPEN: { key: Gruppe; label: string; cls: string }[] = [
  { key: "heute", label: "heute raus", cls: "due-heute" },
  { key: "1tag", label: "1 Tag überfällig", cls: "due-1" },
  { key: "2-4", label: "2–4 Tage überfällig", cls: "due-2-4" },
  { key: "5plus", label: "5+ Tage überfällig", cls: "due-5plus" },
  { key: "zukunft", label: "Zukunft", cls: "due-zukunft" },
];

/** Tage zwischen heute (00:00, Servertimezone Europe/Berlin) und Liefertermin. */
function tageUeberfaellig(deliverIso: string): number {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const liefer = new Date(deliverIso);
  liefer.setHours(0, 0, 0, 0);
  return Math.round((heute.getTime() - liefer.getTime()) / 86400000);
}

function gruppeVon(tage: number): Gruppe {
  if (tage < 0) return "zukunft";
  if (tage === 0) return "heute";
  if (tage === 1) return "1tag";
  if (tage <= 4) return "2-4";
  return "5plus";
}

type Search = { gruppe?: string };

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const filterGruppe = (sp.gruppe ?? "") as Gruppe | "";

  const supabase = await createClient();

  const [
    { data: faelligData, error: faelligError },
    { data: eingangData, error: eingangError },
    { data: gruppenData },
    { data: lastPull },
  ] = await Promise.all([
    supabase
      .from("portal_order")
      .select(
        "id, external_reference, description, quantity, deliver_date, portal_state, gruppe:resolve_result->>gruppe",
      )
      .not("deliver_date", "is", null)
      .or("portal_state.is.null,portal_state.neq.FINISHED")
      .order("deliver_date", { ascending: true }),
    supabase
      .from("portal_order")
      .select("received_at, portal_state, pc1:raw->>createdAt, pc2:raw->>api_createdAt_raw"),
    supabase.from("opri_produkt_gruppe").select("kuerzel, name"),
    supabase
      .from("sync_request")
      .select("status, requested_at, finished_at, error")
      .eq("job", "portal:pull")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const gruppeName = new Map((gruppenData ?? []).map((g) => [g.kuerzel as string, g.name as string]));

  // ---- Auftrags-Fälligkeit (zentrale Steuerungsebene) -------------------
  const faelligRows: FaelligOrder[] = ((faelligData ?? []) as unknown as {
    id: string;
    external_reference: string | null;
    description: string | null;
    quantity: number | null;
    deliver_date: string;
    portal_state: string | null;
    gruppe: string | null; // Produktgruppen-Kürzel aus resolve_result
  }[]).map((r) => {
    const { gruppe: produktGruppeKuerzel, ...rest } = r;
    const tage = tageUeberfaellig(r.deliver_date);
    const produkt = (produktGruppeKuerzel && gruppeName.get(produktGruppeKuerzel)) || r.description || "—";
    return { ...rest, tage, gruppe: gruppeVon(tage), produkt };
  });

  const counts: Record<Gruppe, number> = { heute: 0, "1tag": 0, "2-4": 0, "5plus": 0, zukunft: 0 };
  for (const r of faelligRows) counts[r.gruppe]++;

  const shown = filterGruppe ? faelligRows.filter((r) => r.gruppe === filterGruppe) : faelligRows;

  // ---- Eingehende Aufträge je Tag (bisheriger Start-Inhalt) -------------
  const rows = (eingangData ?? []) as Row[];
  const proTag = new Map<string, { anzahl: number; finished: number }>();
  for (const r of rows) {
    const k = eingangTag(r);
    const e = proTag.get(k) ?? { anzahl: 0, finished: 0 };
    e.anzahl++;
    if (r.portal_state === "FINISHED") e.finished++;
    proTag.set(k, e);
  }
  const heute = new Date();
  const tage = Array.from({ length: TAGE }, (_, i) => {
    const key = isoTag(new Date(heute.getTime() - i * 86400000));
    const e = proTag.get(key) ?? { anzahl: 0, finished: 0 };
    return {
      key,
      label: new Date(key).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
      wotag: WOTAG[new Date(key).getDay()],
      anzahl: e.anzahl,
      finished: e.finished,
    };
  });
  const max = Math.max(1, ...tage.map((t) => t.anzahl));
  const summe7 = tage.slice(0, 7).reduce((a, t) => a + t.anzahl, 0);
  const summe30 = tage.reduce((a, t) => a + t.anzahl, 0);

  const heuteEingang = tage[0]?.anzahl ?? 0;

  return (
    <>
      <h1 style={{ marginBottom: 4 }}>Start</h1>
      <p className="lead" style={{ marginTop: 0 }}>
        Fälligkeiten und eingehende Aufträge auf einen Blick - Kachel anklicken zum Filtern bzw.
        ausklappen für die Details.
      </p>

      <div className="kachel-grid">
        <section className="kachel">
          <div className="kachel-head">
            <h2>Fälligkeiten</h2>
            <span className="count">{faelligRows.length} offene Aufträge</span>
          </div>
          {faelligError && <div className="banner-err">Fehler beim Laden: {faelligError.message}</div>}

          <div className="toolbar" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {GRUPPEN.map((g) => (
              <Link
                key={g.key}
                href={filterGruppe === g.key ? "/start" : `/start?gruppe=${g.key}`}
                className={g.cls}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "8px 14px",
                  borderRadius: "var(--radius)",
                  border: "1px solid",
                  minWidth: 92,
                  textDecoration: "none",
                  opacity: filterGruppe && filterGruppe !== g.key ? 0.5 : 1,
                }}
              >
                <strong style={{ fontSize: 22, lineHeight: 1 }}>{counts[g.key]}</strong>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{g.label}</span>
              </Link>
            ))}
            {filterGruppe && (
              <Link href="/start" className="ghost" style={{ padding: "6px 12px", alignSelf: "center" }}>
                Alle anzeigen
              </Link>
            )}
          </div>

          <details className="kachel-body" open={!!filterGruppe}>
            <summary className="gruppen-zeile kachel-summary">
              <span className="gruppen-chevron">▸</span>
              Aufträge anzeigen
            </summary>
            <FaelligTable rows={shown} gruppe={filterGruppe || undefined} />
          </details>
        </section>

        <section className="kachel">
          <div className="kachel-head">
            <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2>Eingehende Aufträge</h2>
              <PortalPullButton last={lastPull ?? null} />
            </span>
            <span className="count">{heuteEingang} heute</span>
          </div>
          {eingangError && <div className="banner-err">Fehler beim Laden: {eingangError.message}</div>}
          <p className="lead" style={{ marginTop: 0, marginBottom: 10 }}>
            Bei onlineprinters bereitgestellte Aufträge je Tag. <strong>{summe7}</strong> in den
            letzten 7 Tagen · <strong>{summe30}</strong> in {TAGE} Tagen.
          </p>

          <div className="toolbar" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {[
              { label: "heute", value: heuteEingang },
              { label: "7 Tage", value: summe7 },
              { label: `${TAGE} Tage`, value: summe30 },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "8px 14px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  minWidth: 92,
                }}
              >
                <strong style={{ fontSize: 22, lineHeight: 1 }}>{s.value}</strong>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{s.label}</span>
              </div>
            ))}
          </div>

          <details className="kachel-body">
            <summary className="gruppen-zeile kachel-summary">
              <span className="gruppen-chevron">▸</span>
              Tagesverlauf anzeigen ({TAGE} Tage)
            </summary>
            <div className="rows">
              <div className="row head" style={{ gap: 10 }}>
                <span style={{ width: 96 }}>Tag</span>
                <span style={{ width: 44, textAlign: "right" }}>Anz.</span>
                <span style={{ flex: 1 }} />
                <span style={{ width: 80, textAlign: "right" }}>fertig</span>
              </div>
              {tage.map((t) => {
                const we = t.wotag === "Sa" || t.wotag === "So";
                return (
                  <div
                    className="row"
                    key={t.key}
                    style={{ gap: 10, alignItems: "center", opacity: t.anzahl === 0 ? 0.55 : 1 }}
                  >
                    <span style={{ width: 96, color: we ? "var(--muted)" : undefined }}>
                      {t.wotag} {t.label}
                    </span>
                    <span style={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      <strong>{t.anzahl || "–"}</strong>
                    </span>
                    <span style={{ flex: 1, display: "flex", alignItems: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          height: 10,
                          borderRadius: 3,
                          width: `${(t.anzahl / max) * 100}%`,
                          minWidth: t.anzahl ? 3 : 0,
                          background: "var(--accent)",
                        }}
                      />
                    </span>
                    <span
                      style={{
                        width: 80,
                        textAlign: "right",
                        color: "var(--muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {t.finished || ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        </section>
      </div>

      <p className="lead" style={{ marginTop: 14 }}>
        <Link href="/druckauftraege">Alle Druckaufträge →</Link>
        {"  ·  "}
        <Link href="/druck">Druck-Dashboard →</Link>
      </p>
    </>
  );
}
