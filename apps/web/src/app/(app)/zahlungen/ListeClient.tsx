"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { zahlungslaufErzeugen, type State } from "./actions";
import type { Vorschlag } from "@/lib/zahlungen/vorschlag";

const empty: State = {};
const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const de = (d: string | null) => (d ? d.split("-").reverse().join(".") : "–");
const GRUPPE: Record<Vorschlag["dringlichkeit"], string> = {
  ueberfaellig: "Überfällig",
  skonto: "Skonto läuft in den nächsten 7 Tagen ab",
  faellig: "In den nächsten 7 Tagen fällig",
  spaeter: "Später fällig / ohne Fälligkeit",
};
const KONTO_BIC: Record<string, string> = { "61050000": "GOPSDE6GXXX", "60050101": "SOLADEST600", "61060500": "GENODES1VGP", "70120700": "OBKLDEMXXXX" };
const SPEICHER = "werk.zahlungskorb";

export type Konto = { id: string; iban: string; label: string };

/** Zahlungskorb: Rechnungen aus der Liste in den Korb legen (+), Beträge anpassen, dann daraus den Zahlungslauf erzeugen. */
export function ListeClient({ vorschlaege, konten, heute }: { vorschlaege: Vorschlag[]; konten: Konto[]; heute: string }) {
  const [state, action, pending] = useActionState(zahlungslaufErzeugen, empty);
  const [korb, setKorb] = useState<string[]>([]); // Reihenfolge = Reihenfolge des Hineinlegens
  const [betraege, setBetraege] = useState<Record<string, string>>(() => Object.fromEntries(vorschlaege.map((v) => [v.id, v.betrag.toFixed(2).replace(".", ",")])));
  const [suche, setSuche] = useState("");
  const [konto, setKonto] = useState(konten.find((k) => /^DE\d{2}61050000/.test(k.iban))?.id ?? konten[0]?.id ?? "");
  const kontoIban = konten.find((k) => k.id === konto)?.iban ?? "";
  const [bic, setBic] = useState(KONTO_BIC[kontoIban.slice(4, 12)] ?? "");

  const byId = useMemo(() => new Map(vorschlaege.map((v) => [v.id, v])), [vorschlaege]);
  const imKorb = useMemo(() => new Set(korb), [korb]);

  // Korb merken (Browser), damit er einen Seitenwechsel überlebt; nur noch offene Rechnungen übernehmen
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SPEICHER);
      if (!raw) return;
      const s = JSON.parse(raw) as { korb?: string[]; betraege?: Record<string, string> };
      const ok = (s.korb ?? []).filter((id) => { const v = byId.get(id); return v && !v.bereits_im_lauf && v.iban_gueltig; });
      setKorb(ok);
      if (s.betraege) setBetraege((b) => ({ ...b, ...Object.fromEntries(Object.entries(s.betraege!).filter(([id]) => byId.has(id))) }));
    } catch { /* ohne Speicher weiterarbeiten */ }
  }, [byId]);
  useEffect(() => {
    try { localStorage.setItem(SPEICHER, JSON.stringify({ korb, betraege })); } catch { /* egal */ }
  }, [korb, betraege]);

  const num = (s: string) => Number(s.replace(",", ".")) || 0;
  const summe = useMemo(() => Math.round(korb.reduce((a, id) => a + num(betraege[id] ?? "0"), 0) * 100) / 100, [korb, betraege]);

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const treffer = useMemo(() => {
    const q = norm(suche);
    return q ? vorschlaege.filter((v) => norm(v.supplier_name).includes(q) || norm(v.doc_number ?? "").includes(q)) : vorschlaege;
  }, [suche, vorschlaege]);
  const waehlbar = (v: Vorschlag) => !v.bereits_im_lauf && v.iban_gueltig;
  const hinein = (ids: string[]) => setKorb((k) => [...k, ...ids.filter((id) => !k.includes(id))]);
  const heraus = (ids: string[]) => setKorb((k) => k.filter((id) => !ids.includes(id)));
  const gruppen = (["ueberfaellig", "skonto", "faellig", "spaeter"] as const).map((g) => ({ g, rows: treffer.filter((v) => v.dringlichkeit === g) })).filter((x) => x.rows.length);

  return (
    <form action={action}>
      {/* Zahlungskorb */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--panel)", marginTop: 10 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <strong>🛒 Zahlungskorb: {korb.length} {korb.length === 1 ? "Rechnung" : "Rechnungen"} · {eur(summe)} €</strong>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ghost" disabled={!korb.length} onClick={() => setKorb([])} style={{ padding: "5px 10px" }}>
              Korb leeren
            </button>
          </span>
        </div>

        {korb.length === 0 ? (
          <p className="count" style={{ margin: "8px 0 0" }}>
            Der Korb ist leer. In der Liste unten bei einer Rechnung auf „+ Korb“ klicken. Nichts wird gesendet oder erzeugt, solange du
            unten nicht „SEPA-Datei erzeugen“ drückst.
          </p>
        ) : (
          <div className="table-scroll" style={{ marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
            <table className="data">
              <tbody>
                {korb.map((id) => {
                  const v = byId.get(id);
                  if (!v) return null;
                  return (
                    <tr key={id}>
                      <td className="wrap">{v.supplier_name}</td>
                      <td><Link href={`/eingangsrechnungen/${id}`}>{v.doc_number ?? "—"}</Link></td>
                      <td className="count">offen {eur(v.offen)} €</td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          value={betraege[id] ?? ""}
                          onChange={(e) => setBetraege((b) => ({ ...b, [id]: e.target.value }))}
                          inputMode="decimal"
                          aria-label="Betrag"
                          style={{ width: 90, textAlign: "right" }}
                        />
                        <input type="hidden" name="sel" value={id} />
                        <input type="hidden" name={`betrag_${id}`} value={betraege[id] ?? ""} />
                      </td>
                      <td>{v.mit_skonto && <span className="tag">Skonto −{eur(v.skonto_betrag)} €</span>}</td>
                      <td><button type="button" className="ghost" onClick={() => heraus([id])} style={{ padding: "2px 8px" }} title="Aus dem Korb nehmen">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="toolbar" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
          <label className="count" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            Absenderkonto
            <select name="konto" value={konto} onChange={(e) => { setKonto(e.target.value); const k = konten.find((x) => x.id === e.target.value); setBic(KONTO_BIC[k?.iban.slice(4, 12) ?? ""] ?? ""); }} style={{ width: 280 }}>
              {konten.map((k) => <option key={k.id} value={k.id}>{k.label} · {k.iban}</option>)}
            </select>
          </label>
          <label className="count" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            BIC (optional)
            <input name="bic" value={bic} onChange={(e) => setBic(e.target.value)} style={{ width: 130 }} />
          </label>
          <label className="count" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            Ausführung am
            <input type="date" name="ausfuehrung" defaultValue={heute} style={{ width: 150 }} />
          </label>
          <label className="count" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            Dateiformat
            <select name="format" defaultValue="pain.001.001.03" style={{ width: 150 }}>
              <option value="pain.001.001.03">pain.001.001.03</option>
              <option value="pain.001.001.09">pain.001.001.09</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending || korb.length === 0}
            onClick={() => { try { localStorage.removeItem(SPEICHER); } catch { /* egal */ } }}
          >
            {pending ? "…" : `SEPA-Datei erzeugen (${korb.length} · ${eur(summe)} €)`}
          </button>
          {state.error && <span className="msg-err">{state.error}</span>}
        </div>
      </div>

      {/* Liste */}
      <div className="toolbar" style={{ gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <input type="search" placeholder="Suchen: Lieferant oder Rechnungsnummer" value={suche} onChange={(e) => setSuche(e.target.value)} style={{ width: 320 }} />
        <button type="button" className="ghost" onClick={() => hinein(treffer.filter(waehlbar).map((v) => v.id))} style={{ padding: "5px 10px" }}>
          Alle angezeigten in den Korb
        </button>
        <span className="count">{suche ? `${treffer.length} von ${vorschlaege.length} Treffern` : `${vorschlaege.length} offene Rechnungen`}</span>
      </div>

      <div className="table-scroll" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr>
              <th></th><th>Lieferant</th><th>Rechnung</th><th>Datum</th><th>Fällig</th><th>Skonto bis</th>
              <th style={{ textAlign: "right" }}>offen</th><th style={{ textAlign: "right" }}>zu zahlen</th><th>Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {gruppen.map(({ g, rows }) => (
              <GruppeRows key={g} titel={`${GRUPPE[g]} (${rows.length})`}>
                {rows.map((v) => (
                  <tr key={v.id} style={v.bereits_im_lauf ? { opacity: 0.5 } : imKorb.has(v.id) ? { background: "var(--tag-bg)" } : undefined}>
                    <td>
                      {imKorb.has(v.id) ? (
                        <button type="button" className="ghost" onClick={() => heraus([v.id])} style={{ padding: "3px 8px" }}>✓ im Korb</button>
                      ) : (
                        <button type="button" disabled={!waehlbar(v)} onClick={() => hinein([v.id])} style={{ padding: "3px 8px" }}>+ Korb</button>
                      )}
                    </td>
                    <td className="wrap">{v.supplier_name}</td>
                    <td><Link href={`/eingangsrechnungen/${v.id}`}>{v.doc_number ?? "—"}</Link></td>
                    <td className="count">{de(v.doc_date)}</td>
                    <td className="count">{de(v.faellig)}</td>
                    <td className="count">{v.skonto_bis ? `${de(v.skonto_bis)}${v.skonto_prozent ? ` (${v.skonto_prozent} %)` : ""}` : "–"}</td>
                    <td style={{ textAlign: "right" }} className="count">{eur(v.offen)} €</td>
                    <td style={{ textAlign: "right" }}>
                      <input
                        value={betraege[v.id] ?? ""}
                        onChange={(e) => setBetraege((b) => ({ ...b, [v.id]: e.target.value }))}
                        inputMode="decimal"
                        style={{ width: 90, textAlign: "right" }}
                        aria-label="Betrag"
                      />
                    </td>
                    <td className="count wrap">
                      {v.mit_skonto && <span className="tag">Skonto −{eur(v.skonto_betrag)} €</span>}{" "}
                      {v.status !== "booked" && <span className="tag">noch nicht gebucht</span>}{" "}
                      {v.bereits_im_lauf && <span className="tag">schon im Zahlungslauf</span>}{" "}
                      {!v.iban && <span className="msg-err">IBAN fehlt</span>}
                      {v.iban && !v.iban_gueltig && <span className="msg-err">IBAN ungültig</span>}
                      {v.iban_warnung && <span className="msg-err">⚠ {v.iban_warnung}</span>}
                      {v.iban_quelle === "zahlung" && <span className="tag" title="Beleg enthält keine IBAN">IBAN aus früherer Zahlung</span>}{" "}
                      {v.letzte_zahlung && <span title="Letzte zugeordnete Zahlung an diesen Lieferanten">letzte Zahlung {de(v.letzte_zahlung.datum)} ({eur(v.letzte_zahlung.betrag)} €)</span>}
                    </td>
                  </tr>
                ))}
              </GruppeRows>
            ))}
            {!treffer.length && <tr><td colSpan={9} style={{ color: "var(--muted)" }}>{suche ? "Keine Treffer." : "Keine offenen Eingangsrechnungen."}</td></tr>}
          </tbody>
        </table>
      </div>
    </form>
  );
}

function GruppeRows({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <>
      <tr><td colSpan={9} style={{ fontWeight: 600, paddingTop: 14 }}>{titel}</td></tr>
      {children}
    </>
  );
}
