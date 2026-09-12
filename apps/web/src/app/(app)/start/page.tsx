import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

export default async function StartPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("portal_order")
    .select("received_at, portal_state, pc1:raw->>createdAt, pc2:raw->>api_createdAt_raw");

  const rows = (data ?? []) as Row[];

  const proTag = new Map<string, { anzahl: number; finished: number }>();
  for (const r of rows) {
    const k = eingangTag(r);
    const e = proTag.get(k) ?? { anzahl: 0, finished: 0 };
    e.anzahl++;
    if (r.portal_state === "FINISHED") e.finished++;
    proTag.set(k, e);
  }

  // lückenlose Tagesreihe, neueste zuerst
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

  return (
    <>
      <h1 style={{ marginBottom: 4 }}>Start</h1>
      <p className="lead" style={{ marginTop: 0 }}>
        Bei onlineprinters bereitgestellte Aufträge je Tag (letzte {TAGE} Tage).{" "}
        <strong>{summe7}</strong> in den letzten 7 Tagen · <strong>{summe30}</strong> in {TAGE} Tagen.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="rows" style={{ maxWidth: 560 }}>
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
                style={{ width: 80, textAlign: "right", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}
              >
                {t.finished || ""}
              </span>
            </div>
          );
        })}
      </div>

      <p className="lead" style={{ marginTop: 14 }}>
        <Link href="/druckauftraege">Alle Druckaufträge →</Link>
        {"  ·  "}
        <Link href="/druck">Druck-Dashboard →</Link>
      </p>
    </>
  );
}
