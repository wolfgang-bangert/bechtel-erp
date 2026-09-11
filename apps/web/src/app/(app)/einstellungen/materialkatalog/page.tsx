import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";
import { FluxRefreshButton } from "@/lib/flux/FluxRefreshButton";
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
  const [{ data, error }, cat, { data: rollen }, { data: formate }] = await Promise.all([
    supabase
      .from("material")
      .select("id, name, name_kurz, attribute, flux_paper_type, rolle:rolle_id(name)")
      .eq("is_active", true)
      .order("name"),
    fluxCatalog(),
    supabase.from("material_rolle").select("id, name").order("sort"),
    supabase.from("format").select("code, name").order("code"),
  ]);
  const rollenList = (rollen ?? []) as { id: string; name: string }[];
  const papierRolleId = rollenList.find((r) => r.name === "Papier")?.id ?? null;
  const formatCodes = (formate ?? []) as { code: string; name: string }[];
  const mats = (data ?? []) as unknown as Mat[];
  const rows = mats
    .map((m) => {
      const d = m.attribute?.dicke_mm;
      const dicke = typeof d === "number" ? d : typeof d === "string" ? Number(d) : null;
      return {
        id: m.id,
        name: m.name,
        name_kurz: m.name_kurz,
        rolle: m.rolle?.name ?? null,
        grammatur: (m.attribute?.Grammatur_g as string | number | undefined)?.toString() ?? null,
        oberflaeche: (m.attribute?.["Oberfläche"] as string | undefined) ?? null,
        dicke_mm: Number.isFinite(dicke) ? (dicke as number) : null,
        format: (m.attribute?.Format ?? m.attribute?.format) as string | undefined ?? null,
        flux_paper_type: m.flux_paper_type,
      };
    })
    .sort((a, b) => {
      const pa = /papier|umschlag|deckblatt/i.test(a.rolle ?? "") ? 0 : 1;
      const pb = /papier|umschlag|deckblatt/i.test(b.rolle ?? "") ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const da = a.dicke_mm == null ? 0 : 1;
      const db = b.dicke_mm == null ? 0 : 1;
      return da - db || a.name.localeCompare(b.name, "de");
    });

  const mapped = rows.filter((r) => r.flux_paper_type).length;
  const dickeFehlt = rows.filter((r) => r.dicke_mm == null).length;

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Materialkatalog</h1>
        <FluxRefreshButton />
      </div>
      <p className="lead">
        <strong>Dicke (mm)</strong>: Basis der Blockstärkenberechnung (Wire-O) — fehlt sie bei
        einem blockrelevanten Papier, wird die Blockstärke zu niedrig.{" "}
        <strong>Format</strong>: Ziel für Regeln mit Herkunft „aus Format" (z.B. Tischaufsteller
        je Kalenderformat).{" "}
        <strong>flux-Papiersorte</strong> (Name wie flux <code>/paper-types</code>): der Resolver
        ergänzt sie automatisch am Druckjob.
      </p>

      <div className="toolbar">
        <span className={dickeFehlt ? "msg-err" : "count"}>
          {dickeFehlt ? `${dickeFehlt} ohne Dicke` : "alle mit Dicke"}
        </span>
        <span className="count">
          {mapped}/{rows.length} flux-Papiersorte zugeordnet
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
      <datalist id="format-codes">
        {formatCodes.map((f) => (
          <option key={f.code} value={f.code}>{f.name}</option>
        ))}
      </datalist>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Material</th>
              <th>Rolle</th>
              <th>Eigenschaft</th>
              <th>Format</th>
              <th>Dicke mm</th>
              <th>flux-Papiersorte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <PaperRow key={m.id} m={m} />
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>Kein Material.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
