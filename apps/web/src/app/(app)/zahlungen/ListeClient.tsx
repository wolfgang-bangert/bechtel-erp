"use client";

import { useActionState, useMemo, useState } from "react";
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

export type Konto = { id: string; iban: string; label: string };

export function ListeClient({ vorschlaege, konten, heute }: { vorschlaege: Vorschlag[]; konten: Konto[]; heute: string }) {
  const [state, action, pending] = useActionState(zahlungslaufErzeugen, empty);
  const vorauswahl = (v: Vorschlag) => !v.bereits_im_lauf && v.iban_gueltig && v.iban_quelle === "beleg" && v.dringlichkeit !== "spaeter" && !v.iban_warnung;
  const [sel, setSel] = useState<Set<string>>(new Set(vorschlaege.filter(vorauswahl).map((v) => v.id)));
  const [betraege, setBetraege] = useState<Record<string, string>>(() => Object.fromEntries(vorschlaege.map((v) => [v.id, v.betrag.toFixed(2).replace(".", ",")])));
  const [konto, setKonto] = useState(konten.find((k) => /GOPS|61050000/.test(k.iban + k.label) || /^DE\d{2}61050000/.test(k.iban))?.id ?? konten[0]?.id ?? "");
  const kontoIban = konten.find((k) => k.id === konto)?.iban ?? "";
  const [bic, setBic] = useState(KONTO_BIC[kontoIban.slice(4, 12)] ?? "");

  const [suche, setSuche] = useState("");
  const num = (s: string) => Number(s.replace(",", ".")) || 0;
  const summe = useMemo(() => Math.round(vorschlaege.filter((v) => sel.has(v.id)).reduce((a, v) => a + num(betraege[v.id] ?? "0"), 0) * 100) / 100, [sel, betraege, vorschlaege]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const treffer = useMemo(() => {
    const q = norm(suche);
    return q ? vorschlaege.filter((v) => norm(v.supplier_name).includes(q) || norm(v.doc_number ?? "").includes(q)) : vorschlaege;
  }, [suche, vorschlaege]);
  const waehlbar = treffer.filter((v) => !v.bereits_im_lauf && v.iban_gueltig);
  const alleAngehakt = waehlbar.length > 0 && waehlbar.every((v) => sel.has(v.id));
  const setzeAlle = (an: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const v of waehlbar) an ? n.add(v.id) : n.delete(v.id);
      return n;
    });
  const gruppen = (["ueberfaellig", "skonto", "faellig", "spaeter"] as const).map((g) => ({ g, rows: treffer.filter((v) => v.dringlichkeit === g) })).filter((x) => x.rows.length);

  return (
    <form action={action}>
      <div className="toolbar" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
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
        <button type="submit" disabled={pending || sel.size === 0}>
          {pending ? "…" : `SEPA-Datei erzeugen (${sel.size} gewählt · ${eur(summe)} €)`}
        </button>
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>

      <div className="toolbar" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <input
          type="search"
          placeholder="Suchen: Lieferant oder Rechnungsnummer"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          style={{ width: 320 }}
        />
        <button type="button" className="ghost" onClick={() => setzeAlle(true)} style={{ padding: "5px 10px" }}>
          Alle anwählen
        </button>
        <button type="button" className="ghost" onClick={() => setzeAlle(false)} style={{ padding: "5px 10px" }}>
          Alle abwählen
        </button>
        <span className="count">
          {suche ? `${treffer.length} von ${vorschlaege.length} Treffern · ` : ""}Anwählen/Abwählen gilt für die angezeigten Rechnungen
        </span>
      </div>

      <div className="table-scroll" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr>
              <th><input type="checkbox" checked={alleAngehakt} onChange={(e) => setzeAlle(e.target.checked)} aria-label="Alle angezeigten wählen" /></th><th>Lieferant</th><th>Rechnung</th><th>Datum</th><th>Fällig</th><th>Skonto bis</th>
              <th style={{ textAlign: "right" }}>offen</th><th style={{ textAlign: "right" }}>zu zahlen</th><th>Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {gruppen.map(({ g, rows }) => (
              <GruppeRows key={g} titel={`${GRUPPE[g]} (${rows.length})`}>
                {rows.map((v) => (
                  <tr key={v.id} style={v.bereits_im_lauf ? { opacity: 0.5 } : undefined}>
                    <td>
                      <input type="checkbox" name="sel" value={v.id} checked={sel.has(v.id)} disabled={v.bereits_im_lauf || !v.iban_gueltig} onChange={() => toggle(v.id)} />
                    </td>
                    <td className="wrap">{v.supplier_name}</td>
                    <td><Link href={`/eingangsrechnungen/${v.id}`}>{v.doc_number ?? "—"}</Link></td>
                    <td className="count">{de(v.doc_date)}</td>
                    <td className="count">{de(v.faellig)}</td>
                    <td className="count">{v.skonto_bis ? `${de(v.skonto_bis)}${v.skonto_prozent ? ` (${v.skonto_prozent} %)` : ""}` : "–"}</td>
                    <td style={{ textAlign: "right" }} className="count">{eur(v.offen)} €</td>
                    <td style={{ textAlign: "right" }}>
                      <input
                        name={`betrag_${v.id}`}
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
      {/* ausgeblendete (durch die Suche gefilterte) angehakte Rechnungen bleiben im Formular */}
      {vorschlaege
        .filter((v) => sel.has(v.id) && !treffer.includes(v))
        .map((v) => (
          <span key={v.id}>
            <input type="hidden" name="sel" value={v.id} />
            <input type="hidden" name={`betrag_${v.id}`} value={betraege[v.id] ?? ""} />
          </span>
        ))}
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
