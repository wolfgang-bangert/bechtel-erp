import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PositionRow, type Pos } from "./PositionRow";
import { FestschreibenButton } from "./FestschreibenButton";

export const dynamic = "force-dynamic";

export default async function AbrechnungDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: abr } = await supabase
    .from("abrechnung")
    .select("id, jahr, kw, von, bis, status, summe_netto, festgeschrieben_at, notiz")
    .eq("id", id)
    .maybeSingle();
  if (!abr) notFound();

  const { data: posRaw } = await supabase
    .from("abrechnung_position")
    .select(
      "id, portal_order_id, referenz, bezeichnung, kategorie, format, auflage, preis_netto, betrag_netto, ist_rekla, rekla_vermerk, manuell",
    )
    .eq("abrechnung_id", id)
    .order("referenz");
  const pos = (posRaw ?? []).map((p) => ({ ...p, abrechnung_id: id })) as unknown as Pos[];

  const locked = abr.status === "festgeschrieben";
  const rekla = pos.filter((p) => p.ist_rekla).length;
  const berechnet = pos.length - rekla;

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>
          Abrechnung KW {abr.kw}/{abr.jahr}{" "}
          <span className="tag">{abr.status}</span>
        </h1>
        <Link href="/abrechnung" className="ghost" style={{ padding: "7px 12px" }}>
          ← Liste
        </Link>
      </div>
      <p className="lead">
        Versandzeitraum {abr.von} – {abr.bis} · {pos.length} Positionen ({berechnet} berechnet,{" "}
        {rekla} Rekla) · Summe <strong>{Number(abr.summe_netto).toFixed(2)} € netto</strong>
        {abr.festgeschrieben_at ? ` · festgeschrieben ${abr.festgeschrieben_at.slice(0, 16).replace("T", " ")}` : ""}
      </p>

      {!locked && (
        <div className="toolbar" style={{ gap: 8 }}>
          <FestschreibenButton id={abr.id} />
          <span className="count">
            „✓" speichert den Betrag (z.B. Teilschuld bei Rekla). „✕" nimmt die Position raus, der
            Auftrag wird wieder frei.
          </span>
        </div>
      )}

      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Referenz</th>
              <th>Bezeichnung</th>
              <th>Merkmale</th>
              <th style={{ textAlign: "right" }}>Listenpreis</th>
              <th style={{ textAlign: "right" }}>Betrag netto</th>
              <th>Rekla-Vermerk</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pos.map((p) => (
              <PositionRow key={p.id} p={p} locked={locked} />
            ))}
            {!pos.length && (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>Keine Positionen.</td>
              </tr>
            )}
          </tbody>
          {pos.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: "right", fontWeight: 600 }}>Summe netto</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {Number(abr.summe_netto).toFixed(2)} €
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
