import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";
import { PaperRow } from "./PaperRow";
import { NewMaterialForm } from "./NewMaterialForm";

export const dynamic = "force-dynamic";

type Mat = {
  id: string;
  name: string;
  name_kurz: string | null;
  attribute: Record<string, unknown> | null;
  flux_paper_type: string | null;
  rolle: { name: string } | null;
};

export default async function MaterialkatalogPage() {
  const supabase = await createClient();
  const [{ data, error }, cat, { data: rollen }] = await Promise.all([
    supabase
      .from("material")
      .select("id, name, name_kurz, attribute, flux_paper_type, rolle:rolle_id(name)")
      .eq("is_active", true)
      .order("name"),
    fluxCatalog(),
    supabase.from("material_rolle").select("id, name").order("sort"),
  ]);
  const rollenList = (rollen ?? []) as { id: string; name: string }[];
  const papierRolleId = rollenList.find((r) => r.name === "Papier")?.id ?? null;
  const mats = (data ?? []) as unknown as Mat[];
  const rows = mats
    .map((m) => ({
      id: m.id,
      name: m.name,
      name_kurz: m.name_kurz,
      rolle: m.rolle?.name ?? null,
      grammatur: (m.attribute?.Grammatur_g as string | number | undefined)?.toString() ?? null,
      oberflaeche: (m.attribute?.["Oberfläche"] as string | undefined) ?? null,
      flux_paper_type: m.flux_paper_type,
    }))
    .sort((a, b) => {
      const pa = /papier|umschlag|deckblatt/i.test(a.rolle ?? "") ? 0 : 1;
      const pb = /papier|umschlag|deckblatt/i.test(b.rolle ?? "") ? 0 : 1;
      return pa - pb || a.name.localeCompare(b.name, "de");
    });

  const mapped = rows.filter((r) => r.flux_paper_type).length;

  return (
    <>
      <h1>Materialkatalog — flux-Papiersorte</h1>
      <p className="lead">
        Ordne jedem Papier die flux-Papiersorte zu (Name wie in flux <code>/paper-types</code>).
        Der Resolver ergänzt sie dann automatisch am Druckjob – das flux-Template braucht kein
        Papier mehr, nur Format/Nutzen/Farbigkeit.
      </p>

      <div className="toolbar">
        <span className="count">
          {mapped}/{rows.length} zugeordnet
        </span>
        {cat.ok ? (
          <span className="count">{cat.paperTypes.length} flux-Papiersorten</span>
        ) : (
          <span className="msg-err">flux-Katalog: {cat.error}</span>
        )}
      </div>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <NewMaterialForm rollen={rollenList} papierRolleId={papierRolleId} />

      <datalist id="flux-papertypes">
        {cat.paperTypes.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Material</th>
              <th>Rolle</th>
              <th>Eigenschaft</th>
              <th>flux-Papiersorte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <PaperRow key={m.id} m={m} />
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} style={{ color: "var(--muted)" }}>Kein Material.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
