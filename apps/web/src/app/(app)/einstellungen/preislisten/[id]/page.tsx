import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PreisZelle, PreisLoeschen } from "../PreisZelle";
import { NeuerPreisForm } from "./NeuerPreisForm";

export const dynamic = "force-dynamic";

const LIMIT = 400;

export default async function PreislisteDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kategorie?: string; format?: string; auflage?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: liste } = await supabase
    .from("preis_liste")
    .select("id, name, lieferant, gueltig_ab, gueltig_bis, aufschlag_prozent, basis_liste_id, is_active, notiz")
    .eq("id", id)
    .maybeSingle();
  if (!liste) notFound();

  const { count: gesamt } = await supabase
    .from("preis")
    .select("*", { count: "exact", head: true })
    .eq("liste_id", id);

  // Kategorien: bekannte Menge + was per count tatsächlich vorkommt
  const KANDIDATEN = [
    "Wochenkalender",
    "Wandkalender",
    "Tischkalender",
    "Wochentischkalender",
    "Speisekarte",
    "Spiralbooklet",
    "Multiloft",
  ];
  const katChecks = await Promise.all(
    KANDIDATEN.map(async (k) => {
      const { count } = await supabase
        .from("preis")
        .select("*", { count: "exact", head: true })
        .eq("liste_id", id)
        .eq("kategorie", k);
      return { k, count: count ?? 0 };
    }),
  );
  const kategorien = katChecks.filter((c) => c.count > 0).map((c) => c.k);

  let q = supabase
    .from("preis")
    .select("id, kategorie, produktgruppe, format, blatt, sorte, farbigkeit, spalten_key, auflage, preis_netto")
    .eq("liste_id", id)
    .order("kategorie")
    .order("format")
    .order("spalten_key")
    .order("auflage")
    .limit(LIMIT);
  if (sp.kategorie) q = q.eq("kategorie", sp.kategorie);
  if (sp.format) q = q.ilike("format", `%${sp.format}%`);
  if (sp.auflage) q = q.eq("auflage", Number(sp.auflage));
  const { data: preise } = await q;
  const rows = preise ?? [];

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{liste.name}</h1>
        <Link href="/einstellungen/preislisten" className="ghost" style={{ padding: "7px 12px" }}>
          ← Liste
        </Link>
      </div>
      <p className="lead">
        gültig {liste.gueltig_ab} – {liste.gueltig_bis ?? "unbefristet"}
        {Number(liste.aufschlag_prozent) ? ` · aus Basis +${liste.aufschlag_prozent} %` : ""} ·{" "}
        <strong>{gesamt ?? 0}</strong> Preiszeilen{liste.lieferant ? ` · Herkunft ${liste.lieferant}` : ""}
      </p>

      <NeuerPreisForm listeId={id} kategorien={kategorien} />

      <form className="toolbar" style={{ gap: 8, alignItems: "flex-end", marginTop: 6 }}>
        <label className="field" style={{ width: 180 }}>
          <span>Kategorie</span>
          <select name="kategorie" defaultValue={sp.kategorie ?? ""}>
            <option value="">alle</option>
            {kategorien.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ width: 110 }}>
          <span>Format</span>
          <input name="format" defaultValue={sp.format ?? ""} placeholder="A5" />
        </label>
        <label className="field" style={{ width: 90 }}>
          <span>Auflage</span>
          <input name="auflage" defaultValue={sp.auflage ?? ""} inputMode="numeric" />
        </label>
        <button type="submit">Filtern</button>
        <Link href={`/einstellungen/preislisten/${id}`} className="ghost" style={{ padding: "7px 12px" }}>
          zurücksetzen
        </Link>
      </form>

      <p className="count" style={{ marginTop: 6 }}>
        {rows.length} Zeilen{rows.length >= LIMIT ? ` (max ${LIMIT} — Filter enger setzen)` : ""}
      </p>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th>Gruppe</th>
              <th>Format</th>
              <th>Blatt</th>
              <th>Sorte</th>
              <th>Farbe</th>
              <th>Spalten-Key</th>
              <th style={{ textAlign: "right" }}>Auflage</th>
              <th style={{ textAlign: "right" }}>Preis netto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.kategorie}</td>
                <td className="count">{p.produktgruppe ?? "—"}</td>
                <td className="count">{p.format ?? "—"}</td>
                <td className="count">{p.blatt ?? "—"}</td>
                <td className="count">{p.sorte ?? "—"}</td>
                <td className="count">{p.farbigkeit ?? "—"}</td>
                <td className="count">{p.spalten_key}</td>
                <td style={{ textAlign: "right" }}>{p.auflage}</td>
                <td style={{ textAlign: "right" }}>
                  <PreisZelle id={p.id as string} listeId={id} wert={Number(p.preis_netto)} />
                </td>
                <td>
                  <PreisLoeschen id={p.id as string} listeId={id} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={10} style={{ color: "var(--muted)" }}>Keine Zeilen für diesen Filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
