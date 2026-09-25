import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unterMindestbestand } from "@werk/shared/material/bezug";
import { BezuegeTable, UmbuchenForm, type Bezug, type Lieferant } from "./ui";

export const dynamic = "force-dynamic";

export default async function MaterialBezuegePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: material } = await supabase
    .from("material")
    .select("id, name, name_kurz")
    .eq("id", id)
    .maybeSingle();
  if (!material) notFound();

  const [{ data: bezuegeRaw }, { data: lieferantenRaw }] = await Promise.all([
    supabase
      .from("material_bezug")
      .select(
        "id, material_id, lieferant_org_id, bezeichnung, format, lagerort, einheit, bestand, mindestbestand, einkaufspreis, quelle_bezug_id, nutzen",
      )
      .eq("material_id", id)
      .order("bezeichnung"),
    supabase.from("organization").select("id, name").in("relation", ["supplier", "both"]).order("name"),
  ]);

  const bezuege = (bezuegeRaw ?? []) as Bezug[];
  const lieferanten = (lieferantenRaw ?? []) as Lieferant[];
  const kritisch = bezuege.filter((b) => unterMindestbestand(b.bestand, b.mindestbestand));
  const quellen = bezuege.filter((b) => !b.quelle_bezug_id);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{material.name_kurz || material.name}</h1>
        <Link href="/einstellungen/materialkatalog" className="ghost" style={{ padding: "7px 12px" }}>
          ← Materialkatalog
        </Link>
      </div>
      <p className="lead">
        Bezugsquellen (gelagertes/geliefertes Material) zu diesem Material - ein Material kann
        mehrere Lieferanten/Formate haben. "Geschnitten aus" + Nutzen verknüpft einen Druckbogen
        mit seinem Rohbogen, "Umbuchen" bucht den Bestand beim Schneiden bewusst um.
      </p>

      {kritisch.length > 0 && (
        <div className="banner-warn">
          {kritisch.length} Bezug{kritisch.length === 1 ? "" : "üge"} unter Mindestbestand:{" "}
          {kritisch.map((b) => b.bezeichnung).join(", ")}
        </div>
      )}

      <BezuegeTable materialId={id} bezuege={bezuege} lieferanten={lieferanten} />

      {quellen.map((q) => {
        const ziele = bezuege.filter((b) => b.quelle_bezug_id === q.id);
        return ziele.length > 0 ? (
          <UmbuchenForm key={q.id} materialId={id} quelle={q} ziele={ziele} />
        ) : null;
      })}
    </>
  );
}
