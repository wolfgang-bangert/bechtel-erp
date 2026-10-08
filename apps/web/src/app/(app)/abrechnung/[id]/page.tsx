import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PositionRow, type Pos } from "./PositionRow";
import { abweichung } from "@/lib/abrechnung/abweichung";
import { FestschreibenButton } from "./FestschreibenButton";

export const dynamic = "force-dynamic";

const FILTER = [
  { key: "alle", label: "Alle" },
  { key: "geaendert", label: "Geändert" },
  { key: "rekla", label: "Rekla" },
  { key: "ohne_preis", label: "Ohne Preis" },
  { key: "ohne_begruendung", label: "Ohne Begründung" },
] as const;

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function AbrechnungDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const { id } = await params;
  const { f = "alle" } = await searchParams;
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

  // Versanddatum, Preisquelle und Preisliste aus dem Auftrag nachladen
  const orderIds = (posRaw ?? []).map((p) => p.portal_order_id).filter((x): x is string => !!x);
  const { data: orders } = orderIds.length
    ? await supabase.from("portal_order").select("id, versand_datum, preis_quelle, preis_id").in("id", orderIds)
    : { data: [] };
  const preisIds = [...new Set((orders ?? []).map((o) => o.preis_id).filter((x): x is string => !!x))];
  const { data: preise } = preisIds.length
    ? await supabase.from("preis").select("id, liste:liste_id(name)").in("id", preisIds)
    : { data: [] };
  const listeByPreis = new Map(
    (preise ?? []).map((p) => {
      const l = p.liste as unknown as { name: string } | { name: string }[] | null;
      return [p.id as string, (Array.isArray(l) ? l[0]?.name : l?.name) ?? null] as const;
    }),
  );
  const orderById = new Map((orders ?? []).map((o) => [o.id as string, o]));

  const alle = (posRaw ?? []).map((p) => {
    const o = p.portal_order_id ? orderById.get(p.portal_order_id) : undefined;
    return {
      ...p,
      abrechnung_id: id,
      versand_datum: (o?.versand_datum as string | null) ?? null,
      preis_quelle: (o?.preis_quelle as string | null) ?? null,
      preisliste: o?.preis_id ? (listeByPreis.get(o.preis_id as string) ?? null) : null,
    } as unknown as Pos;
  });

  const istGeaendert = (p: Pos) => Math.abs(abweichung(p)) > 0.004;
  const treffer: Record<string, (p: Pos) => boolean> = {
    alle: () => true,
    geaendert: istGeaendert,
    rekla: (p) => p.ist_rekla,
    ohne_preis: (p) => !p.ist_rekla && (p.preis_netto == null || Number(p.preis_netto) === 0),
    ohne_begruendung: (p) => istGeaendert(p) && !p.rekla_vermerk?.trim(),
  };
  const zaehler = Object.fromEntries(FILTER.map((x) => [x.key, alle.filter(treffer[x.key]).length]));
  const pos = alle.filter(treffer[f] ?? treffer.alle);

  const locked = abr.status === "festgeschrieben";
  const rekla = alle.filter((p) => p.ist_rekla).length;
  const berechnet = alle.length - rekla;
  const listensumme = alle.reduce((a, p) => a + (p.ist_rekla ? 0 : Number(p.preis_netto ?? 0)), 0);
  const nachlass = Math.round((Number(abr.summe_netto) - listensumme) * 100) / 100;

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
        Versandzeitraum {abr.von} – {abr.bis} · {alle.length} Positionen ({berechnet} berechnet,{" "}
        {rekla} Rekla) · Summe <strong>{eur(Number(abr.summe_netto))} € netto</strong>
        {abr.festgeschrieben_at ? ` · festgeschrieben ${abr.festgeschrieben_at.slice(0, 16).replace("T", " ")}` : ""}
      </p>
      <p className="count" style={{ marginTop: -6 }}>
        Listenpreise (ohne Rekla) {eur(listensumme)} € · Abweichung durch Änderungen/Rekla{" "}
        {nachlass > 0 ? "+" : ""}
        {eur(nachlass)} €
        {zaehler.ohne_begruendung > 0 && (
          <strong style={{ color: "var(--danger, #c33)" }}>
            {" "}· {zaehler.ohne_begruendung} Abweichung(en) ohne Begründung
          </strong>
        )}
      </p>

      <div className="toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
        {!locked && <FestschreibenButton id={abr.id} />}
        <Link href={`/api/abrechnung/${abr.id}/aufstellung`} target="_blank" className="ghost" style={{ padding: "7px 12px" }}>
          Aufstellung als PDF{locked ? "" : " (Vorschau)"}
        </Link>
        {!locked && (
          <span className="count">
            „✓" speichert Betrag und Begründung. „✕" nimmt die Position raus, der Auftrag wird wieder frei.
          </span>
        )}
      </div>

      <div className="toolbar" style={{ gap: 6, flexWrap: "wrap" }}>
        {FILTER.map((x) => (
          <Link
            key={x.key}
            href={x.key === "alle" ? `/abrechnung/${abr.id}` : `/abrechnung/${abr.id}?f=${x.key}`}
            className={f === x.key || (x.key === "alle" && !treffer[f]) ? "" : "ghost"}
            style={{ padding: "4px 10px" }}
          >
            {x.label} ({zaehler[x.key]})
          </Link>
        ))}
      </div>

      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Auftrag / Versand</th>
              <th>Bezeichnung</th>
              <th>Preisliste</th>
              <th style={{ textAlign: "right" }}>Listenpreis</th>
              <th style={{ textAlign: "right" }}>Betrag netto</th>
              <th style={{ textAlign: "right" }}>Abweichung</th>
              <th>Begründung</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pos.map((p) => (
              <PositionRow key={p.id} p={p} locked={locked} />
            ))}
            {!pos.length && (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)" }}>Keine Positionen.</td>
              </tr>
            )}
          </tbody>
          {alle.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: "right", fontWeight: 600 }}>Summe netto (alle Positionen)</td>
                <td style={{ textAlign: "right" }} className="count">{eur(listensumme)} €</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{eur(Number(abr.summe_netto))} €</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
