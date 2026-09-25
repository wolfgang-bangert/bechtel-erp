import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormateEditor, type Format, type Bogen, type Rohbogen } from "./ui";

export const dynamic = "force-dynamic";

export default async function FormatePage() {
  const supabase = await createClient();
  const [{ data: formate }, { data: boegen }, { data: rohboegen }] = await Promise.all([
    supabase.from("format").select("id, code, name, breite_mm, hoehe_mm, kategorie, is_active").order("kategorie").order("code"),
    supabase.from("druckbogen").select("id, code, name, breite_mm, hoehe_mm, greifer_mm, is_default, is_active").order("breite_mm"),
    supabase.from("rohbogen").select("id, code, name, breite_mm, hoehe_mm, is_active").order("breite_mm"),
  ]);

  return (
    <>
      <h1>Formate & Druckbögen</h1>
      <p className="lead">
        Endformate + Bogenformate zum Drucken. Rohbögen sind die vom Lieferanten gekauften,
        ungeschnittenen Bogenformate, aus denen Druckbögen geschnitten werden (siehe{" "}
        <Link href="/einstellungen/materialkatalog">Materialkatalog</Link> → Materialbezüge). Die
        Nutzen-Zuordnung (wie viele Endformate auf welchen Bogen) unter{" "}
        <Link href="/einstellungen/vernutzung">Vernutzung</Link>. DIN-Maße sind gesetzt;
        halb/Quadrat/Sonder bitte prüfen.
      </p>
      <FormateEditor
        formate={(formate ?? []) as Format[]}
        boegen={(boegen ?? []) as Bogen[]}
        rohboegen={(rohboegen ?? []) as Rohbogen[]}
      />
    </>
  );
}
