import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VernutzungEditor, type Row, type Opt } from "./ui";

export const dynamic = "force-dynamic";

export default async function VernutzungPage() {
  const supabase = await createClient();
  const [{ data: rows }, { data: formate }, { data: boegen }] = await Promise.all([
    supabase
      .from("vernutzung")
      .select("id, format_id, druckbogen_id, nutzen, anordnung, gedreht, randzugabe_mm, ist_standard, quelle, notiz"),
    supabase.from("format").select("id, code, name, breite_mm, hoehe_mm").eq("is_active", true).order("code"),
    supabase.from("druckbogen").select("id, code, breite_mm, hoehe_mm").eq("is_active", true).order("breite_mm"),
  ]);

  const fOpts: Opt[] = (formate ?? []).map((f) => ({
    id: f.id as string,
    label: `${f.name}${f.breite_mm ? ` (${f.breite_mm}×${f.hoehe_mm} mm)` : " — Maße fehlen"}`,
  }));
  const bOpts: Opt[] = (boegen ?? []).map((b) => ({
    id: b.id as string,
    label: `${b.code} (${b.breite_mm}×${b.hoehe_mm})`,
  }));

  return (
    <>
      <h1>Vernutzung</h1>
      <p className="lead">
        Nutzen je Endformat auf einem Druckbogen. „Vorschläge erzeugen" rechnet die
        Geometrie (beide Ausrichtungen); manuelle Zeilen bleiben unangetastet.
        Formate/Bögen unter <Link href="/einstellungen/formate">Formate & Druckbögen</Link>.
      </p>
      <VernutzungEditor rows={(rows ?? []) as Row[]} formate={fOpts} boegen={bOpts} />
    </>
  );
}
