import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtEur } from "@/lib/format";
import { kontoNamen } from "@/lib/konten/namen";
import { vortragVorschlaege } from "@/lib/konten/vortrag";
import { vortragLoeschen } from "./actions";
import { VortragForm } from "./VortragForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saldovorträge · werk" };

/** Saldovorträge (Anfangsbestände 01.01.) je Konto pflegen, mit Vorschlägen aus Vorjahreszahlungen. */
export default async function VortraegePage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const sp = await searchParams;
  const jahr = /^\d{4}$/.test(sp.jahr ?? "") ? Number(sp.jahr) : new Date().getFullYear();
  const sb = await createClient();
  const [{ data: vortraege }, vorschlaege] = await Promise.all([
    sb.from("konto_vortrag").select("id, konto, saldo, notiz").eq("jahr", jahr).order("konto"),
    vortragVorschlaege(sb, jahr),
  ]);
  const vorhanden = new Map((vortraege ?? []).map((v) => [v.konto, Number(v.saldo)]));
  const namen = await kontoNamen(sb, [...(vortraege ?? []).map((v) => v.konto), ...vorschlaege.map((v) => v.konto)]);

  return (
    <>
      <h1>Saldovorträge {jahr}</h1>
      <p className="lead">
        Anfangsbestände zum 01.01.{jahr} – werk führt keine Vorjahresbuchungen. Die Werte stehen in der Summen- und
        Saldenliste bzw. Bilanz {jahr - 1} vom Steuerberater. Kontoabruf und Lohn-Übersicht rechnen sie ein. Verbindlichkeiten
        (Lohnsteuer, USt, SV) stehen im <strong>Haben</strong>, Forderungen und Bankguthaben im <strong>Soll</strong>.
      </p>
      <form className="toolbar" method="get">
        <select name="jahr" defaultValue={String(jahr)}>
          {[0, 1, 2].map((d) => {
            const j = String(new Date().getFullYear() - d);
            return (
              <option key={j} value={j}>
                {j}
              </option>
            );
          })}
        </select>
        <button type="submit">Anzeigen</button>
        <Link href={`/konten?jahr=${jahr}`}>← Kontoabruf</Link>
      </form>

      {vorschlaege.length > 0 && (
        <>
          <h2>Vorschläge aus Zahlungen für Vorjahreszeiträume</h2>
          <div className="rows">
            {vorschlaege.map((v) => (
              <div key={v.konto} className="row" style={{ flexWrap: "wrap", gap: 10 }}>
                <span>
                  <strong>{v.konto}</strong> {namen.get(v.konto) ?? ""} – {v.grund}
                  {vorhanden.has(v.konto) && <span className="count"> (Vortrag schon erfasst: {fmtEur(Math.abs(vorhanden.get(v.konto)!))} {vorhanden.get(v.konto)! >= 0 ? "S" : "H"})</span>}
                </span>
                <VortragForm jahr={jahr} konto={v.konto} betrag={Math.abs(v.saldo)} seite={v.saldo >= 0 ? "S" : "H"} notiz={v.grund} knopf="übernehmen" />
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Erfasste Vorträge</h2>
      <div className="rows">
        {(vortraege ?? []).map((v) => (
          <div key={v.id} className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <span style={{ minWidth: 260 }}>
              <Link href={`/konten/${v.konto}?jahr=${jahr}`}>{v.konto}</Link> <span className="count">{namen.get(v.konto) ?? ""}</span>
            </span>
            <VortragForm jahr={jahr} konto={v.konto} betrag={Math.abs(Number(v.saldo))} seite={Number(v.saldo) >= 0 ? "S" : "H"} notiz={v.notiz} />
            <form action={vortragLoeschen}>
              <input type="hidden" name="id" value={v.id} />
              <button type="submit" className="ghost" style={{ padding: "3px 8px" }} title="Vortrag löschen">
                ✕
              </button>
            </form>
          </div>
        ))}
        {(vortraege ?? []).length === 0 && <p className="count">Noch keine Vorträge für {jahr}.</p>}
      </div>

      <h2>Vortrag hinzufügen</h2>
      <VortragForm jahr={jahr} knopf="+ Hinzufügen" />
    </>
  );
}
