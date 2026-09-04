import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";

export const dynamic = "force-dynamic";

export default async function FluxTemplatesPage() {
  const supabase = await createClient();
  const [{ data, error }, cat] = await Promise.all([
    supabase
      .from("flux_template")
      .select("id, name, flux_product, printer_name, paper_type, is_active")
      .order("name"),
    fluxCatalog(),
  ]);
  const rows = (data ?? []) as {
    id: string;
    name: string;
    flux_product: string;
    printer_name: string | null;
    paper_type: string | null;
    is_active: boolean;
  }[];

  return (
    <>
      <h1>flux-Templates</h1>
      <p className="lead">
        Ein Template = flux-Produkt + Services (+ optional Drucker, Standbogen). Das Papier
        kommt aus dem Materialkatalog (<Link href="/einstellungen/materialkatalog">flux-Papiersorte</Link>),
        Override nur wenn nötig. Zuordnung an Materialregel / Stammartikel / Produktgruppe.
      </p>

      <div className="toolbar">
        <Link className="ghost" href="/einstellungen/flux-templates/neu" style={{ padding: "7px 12px" }}>
          + Neues Template
        </Link>
        <span className="count">{rows.length} Templates</span>
        {cat.ok ? (
          <span className="count">flux: {cat.products.length} Produkte</span>
        ) : (
          <span className="msg-err">flux-Katalog: {cat.error}</span>
        )}
      </div>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>flux-Produkt</th>
              <th>Drucker</th>
              <th>Papier-Override</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                <td>
                  <Link href={`/einstellungen/flux-templates/${r.id}`}>{r.name}</Link>
                </td>
                <td className="count">{r.flux_product}</td>
                <td className="count">{r.printer_name ?? "—"}</td>
                <td className="count">{r.paper_type ?? "aus Material"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} style={{ color: "var(--muted)" }}>Noch keine Templates.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
