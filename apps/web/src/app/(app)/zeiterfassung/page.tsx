import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  arbZgHinweise,
  berlinTag,
  berlinUhr,
  fmtStunden,
  fmtTag,
  minuten,
  pausenMinuten,
  type ZeitEintrag,
} from "@/lib/zeit";
import { StempelKnoepfe } from "./StempelKnoepfe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zeiterfassung · werk" };

/** Eigene Zeiterfassung: stempeln + die letzten 14 Tage. Jeder sieht nur seine eigenen Zeiten (RLS). */
export default async function ZeiterfassungPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: pid } = await supabase.rpc("meine_personal_id");

  if (!pid) {
    return (
      <>
        <h1>Zeiterfassung</h1>
        <div className="banner-warn">
          Dein werk-Login ist noch mit keiner Person im Personal verknüpft. Bitte in der Geschäftsleitung melden.
        </div>
      </>
    );
  }

  const seit = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("zeit_eintrag")
    .select("id, personal_id, beginn, ende, ende_grund, quelle, notiz")
    .eq("personal_id", pid as string)
    .gte("beginn", seit)
    .order("beginn", { ascending: false });
  const eintraege = (data ?? []) as ZeitEintrag[];

  const offen = eintraege.find((e) => !e.ende);
  const letzter = eintraege[0];
  const heute = berlinTag(new Date());
  const zustand: "aus" | "da" | "pause" = offen
    ? "da"
    : letzter && letzter.ende_grund === "pause" && berlinTag(letzter.beginn) === heute
      ? "pause"
      : "aus";

  const tage = new Map<string, ZeitEintrag[]>();
  for (const e of eintraege) tage.set(berlinTag(e.beginn), [...(tage.get(berlinTag(e.beginn)) ?? []), e]);
  const heuteMin = (tage.get(heute) ?? []).reduce((a, e) => a + minuten(e), 0);

  return (
    <>
      <h1>Zeiterfassung</h1>
      <p className="lead">
        {zustand === "da" && <>Eingestempelt seit <strong>{berlinUhr(offen!.beginn)}</strong>. </>}
        {zustand === "pause" && <>In der Pause seit <strong>{berlinUhr(letzter.ende!)}</strong>. </>}
        {zustand === "aus" && <>Nicht eingestempelt. </>}
        Heute bisher: <strong>{fmtStunden(heuteMin)}</strong>
      </p>

      <StempelKnoepfe zustand={zustand} />

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <h2>Letzte 14 Tage</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Zeiten</th>
              <th style={{ textAlign: "right" }}>Pause</th>
              <th style={{ textAlign: "right" }}>Arbeitszeit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...tage.entries()].map(([tag, bl]) => {
              const sortiert = [...bl].sort((a, b) => a.beginn.localeCompare(b.beginn));
              const arbeit = bl.reduce((a, e) => a + minuten(e), 0);
              const pause = pausenMinuten(bl);
              const hinweise = arbZgHinweise(arbeit, pause);
              return (
                <tr key={tag}>
                  <td>{fmtTag(tag)}</td>
                  <td className="wrap">
                    {sortiert.map((e) => `${berlinUhr(e.beginn)}–${e.ende ? berlinUhr(e.ende) : "…"}`).join(", ")}
                  </td>
                  <td style={{ textAlign: "right" }}>{pause ? fmtStunden(pause) : "–"}</td>
                  <td style={{ textAlign: "right" }}>
                    <strong>{fmtStunden(arbeit)}</strong>
                  </td>
                  <td className="count">{hinweise.join(", ")}</td>
                </tr>
              );
            })}
            {tage.size === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Noch keine Zeiten erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="count">Falsch gestempelt? Korrekturen macht die Geschäftsleitung.</p>
    </>
  );
}
