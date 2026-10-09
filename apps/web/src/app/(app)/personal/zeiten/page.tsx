import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getModuleLevels } from "@/lib/auth";
import {
  arbZgHinweise,
  berlinLokal,
  berlinTag,
  berlinUhr,
  berlinZuIso,
  fmtStunden,
  fmtTag,
  minuten,
  pausenMinuten,
  type ZeitEintrag,
} from "@/lib/zeit";
import { ZeitForm } from "./ZeitForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zeiten · werk" };

type Search = { monat?: string; person?: string };
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function monatVerschieben(monat: string, d: number): string {
  const [y, m] = monat.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Zeiten aller Mitarbeiter je Monat: Übersicht, Tagesdetails, Korrigieren / Nachtragen (nur Personal-Berechtigte). */
export default async function ZeitenPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const monat = /^\d{4}-\d{2}$/.test(sp.monat ?? "") ? sp.monat! : berlinTag(new Date()).slice(0, 7);
  const person = sp.person ?? "";
  const supabase = await createClient();
  const darfBearbeiten = (await getModuleLevels()).personal === "edit";

  const von = berlinZuIso(`${monat}-01T00:00`)!;
  const bis = berlinZuIso(`${monatVerschieben(monat, 1)}-01T00:00`)!;

  const [{ data: leute }, { data: zeiten, error }, { data: offene }] = await Promise.all([
    supabase.from("personal").select("id, vorname, nachname, wochenstunden, aktiv").order("nachname").order("vorname"),
    supabase
      .from("zeit_eintrag")
      .select("id, personal_id, beginn, ende, ende_grund, quelle, notiz")
      .gte("beginn", von)
      .lt("beginn", bis)
      .order("beginn"),
    supabase.from("zeit_eintrag").select("personal_id, beginn").is("ende", null),
  ]);

  const nameVon = new Map((leute ?? []).map((p) => [p.id, [p.vorname, p.nachname].filter(Boolean).join(" ")]));
  const eintraege = (zeiten ?? []) as ZeitEintrag[];
  const jePerson = new Map<string, ZeitEintrag[]>();
  for (const e of eintraege) jePerson.set(e.personal_id, [...(jePerson.get(e.personal_id) ?? []), e]);

  const sichtbar = (leute ?? []).filter((p) => (person ? p.id === person : p.aktiv || jePerson.has(p.id)));
  const href = (m: string, p = person) => `/personal/zeiten?monat=${m}${p ? `&person=${p}` : ""}`;
  const [jahr, mon] = monat.split("-").map(Number);

  return (
    <>
      <h1>Zeiten</h1>
      <p className="lead">
        Gestempelte Arbeitszeiten aller Mitarbeiter. Pausen sind die Lücken zwischen den Blöcken. Hinweise nach
        Arbeitszeitgesetz (über 6 h ohne 30 min Pause, über 9 h ohne 45 min, über 10 h) sind nur Hinweise.
      </p>

      {offene && offene.length > 0 && (
        <div className="banner-info">
          <strong>Gerade eingestempelt:</strong>{" "}
          {offene.map((o) => `${nameVon.get(o.personal_id) ?? "?"} (seit ${berlinUhr(o.beginn)})`).join(", ")}
        </div>
      )}

      <form className="toolbar" method="get">
        <Link className="ghost" href={href(monatVerschieben(monat, -1))}>
          ←
        </Link>
        <strong>
          {MONATE[mon - 1]} {jahr}
        </strong>
        <Link className="ghost" href={href(monatVerschieben(monat, 1))}>
          →
        </Link>
        <input type="hidden" name="monat" value={monat} />
        <select name="person" defaultValue={person}>
          <option value="">alle Personen</option>
          {(leute ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {nameVon.get(p.id)}
              {p.aktiv ? "" : " (ausgeschieden)"}
            </option>
          ))}
        </select>
        <button type="submit">Anzeigen</button>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      {!person && (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th style={{ textAlign: "right" }}>Tage</th>
                <th style={{ textAlign: "right" }}>Arbeitszeit</th>
                <th>Hinweise</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((p) => {
                const bl = jePerson.get(p.id) ?? [];
                const tage = new Map<string, ZeitEintrag[]>();
                for (const e of bl) tage.set(berlinTag(e.beginn), [...(tage.get(berlinTag(e.beginn)) ?? []), e]);
                const summe = bl.reduce((a, e) => a + minuten(e), 0);
                const hinweise = [...tage.values()].filter(
                  (t) => arbZgHinweise(t.reduce((a, e) => a + minuten(e), 0), pausenMinuten(t)).length > 0,
                ).length;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={href(monat, p.id)}>{nameVon.get(p.id)}</Link>
                    </td>
                    <td style={{ textAlign: "right" }}>{tage.size || "–"}</td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{summe ? fmtStunden(summe) : "–"}</strong>
                    </td>
                    <td className="count">{hinweise ? `${hinweise} Tag(e) mit Hinweis` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {person && (
        <PersonMonat
          personalId={person}
          name={nameVon.get(person) ?? "?"}
          eintraege={jePerson.get(person) ?? []}
          darfBearbeiten={darfBearbeiten}
          monat={monat}
        />
      )}
    </>
  );
}

function PersonMonat({
  personalId,
  name,
  eintraege,
  darfBearbeiten,
  monat,
}: {
  personalId: string;
  name: string;
  eintraege: ZeitEintrag[];
  darfBearbeiten: boolean;
  monat: string;
}) {
  const tage = new Map<string, ZeitEintrag[]>();
  for (const e of eintraege) tage.set(berlinTag(e.beginn), [...(tage.get(berlinTag(e.beginn)) ?? []), e]);
  const summe = eintraege.reduce((a, e) => a + minuten(e), 0);
  const heute = berlinTag(new Date());
  const vorschlag = heute.startsWith(monat) ? heute : `${monat}-01`;

  return (
    <>
      <h2>
        {name} – {fmtStunden(summe)} an {tage.size} Tag(en)
      </h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Blöcke</th>
              <th style={{ textAlign: "right" }}>Pause</th>
              <th style={{ textAlign: "right" }}>Arbeit</th>
              <th>Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {[...tage.entries()].map(([tag, bl]) => {
              const arbeit = bl.reduce((a, e) => a + minuten(e), 0);
              const pause = pausenMinuten(bl);
              return (
                <tr key={tag}>
                  <td style={{ verticalAlign: "top" }}>{fmtTag(tag)}</td>
                  <td>
                    {bl.map((e) =>
                      darfBearbeiten ? (
                        <ZeitForm
                          key={e.id}
                          id={e.id}
                          personalId={personalId}
                          beginn={berlinLokal(e.beginn)}
                          ende={e.ende ? berlinLokal(e.ende) : ""}
                          notiz={e.notiz}
                          quelle={e.quelle}
                        />
                      ) : (
                        <div key={e.id}>
                          {berlinUhr(e.beginn)}–{e.ende ? berlinUhr(e.ende) : "…"} {e.notiz}
                        </div>
                      ),
                    )}
                  </td>
                  <td style={{ textAlign: "right", verticalAlign: "top" }}>{pause ? fmtStunden(pause) : "–"}</td>
                  <td style={{ textAlign: "right", verticalAlign: "top" }}>
                    <strong>{fmtStunden(arbeit)}</strong>
                  </td>
                  <td className="count" style={{ verticalAlign: "top" }}>
                    {arbZgHinweise(arbeit, pause).join(", ")}
                  </td>
                </tr>
              );
            })}
            {tage.size === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Keine Zeiten in diesem Monat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {darfBearbeiten && (
        <>
          <h3>Zeit nachtragen</h3>
          <ZeitForm personalId={personalId} beginn={`${vorschlag}T07:00`} ende={`${vorschlag}T16:00`} />
        </>
      )}
    </>
  );
}
