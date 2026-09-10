import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";
import { StandbogenTable, type Standbogen } from "./ui";

export const dynamic = "force-dynamic";

export default async function StandbogenPage() {
  const supabase = await createClient();

  const [{ data: rows, error }, { data: orders }, { data: bogenRows }, cat] = await Promise.all([
    supabase
      .from("standbogen")
      .select(
        "id, bezeichnung, format, ausrichtung, flux_signature, druckbogen, nutzen, notiz, aktiv, sortierung",
      )
      .order("sortierung")
      .order("format"),
    supabase.from("portal_order").select("f:resolve_result->attribute->>format"),
    supabase.from("druckbogen").select("code").eq("is_active", true).order("code"),
    fluxCatalog({ fresh: true }).catch(() => null),
  ]);

  // Formate, die real in Auflösungen vorkommen – das sind die Match-Strings
  const formate = [
    ...new Set(
      ((orders ?? []) as { f: string | null }[]).map((o) => o.f).filter((x): x is string => !!x),
    ),
  ].sort();
  const boegen = ((bogenRows ?? []) as { code: string }[]).map((b) => b.code);
  const signaturen = (cat?.signatures ?? []).map((s) => s.name).sort();

  return (
    <>
      <h1>Standbögen</h1>
      <p className="lead">
        Der Standbogen ist das komplette Ausschießen (Bogenformat, Seitengröße, Anordnung, Marken,
        Reihenfolge) — <strong>inkl. der 90°-Drehung</strong>: je nachdem, ob das PDF hoch- oder
        querformatig angeliefert wird, ein eigener Standbogen. Der Resolver matcht{" "}
        <strong>Format + angelieferte PDF-Ausrichtung</strong> (<code>pdf_meta.ausrichtung</code>) und
        setzt <code>flux_signature</code>, <code>druckbogen</code> und <code>nutzen</code> auf den
        Druckzeilen. Vorrang: Standbogen → <code>vernutzung</code> / <code>flux_template.signature</code>{" "}
        (Fallback) → manueller Override beim Auftrag. Ausrichtung leer = gilt für beide.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}
      {cat && !cat.ok && (
        <div className="banner-err">flux-Katalog nicht geladen ({cat.error}) – Signature als Freitext.</div>
      )}

      <StandbogenTable
        rows={(rows ?? []) as Standbogen[]}
        formate={formate}
        signaturen={signaturen}
        boegen={boegen}
      />
    </>
  );
}
