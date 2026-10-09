import { createClient } from "@/lib/supabase/server";
import { VerschmelzenForm, type Kandidat } from "./VerschmelzenForm";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verknüpfte Datensätze (Tabelle.Spalte aus organization_verweise) lesbar benennen. */
const VERWEIS_LABEL: Record<string, string> = {
  "address.organization_id": "Adressen",
  "contact.organization_id": "Kontakte",
  "organization_external_ref.organization_id": "Fremdsystem-Verweise",
  "user_role.organization_id": "Portal-Zugänge",
  "file.organization_id": "Dateien",
  "sales_order.organization_id": "Aufträge",
  "sales_invoice.organization_id": "Ausgangsrechnungen",
  "invoice.organization_id": "Rechnungen (werk)",
  "incoming_document.supplier_organization_id": "Eingangsrechnungen",
  "shipment.organization_id": "Sendungen",
  "portal.organization_id": "Portale",
  "material.lieferant_org_id": "Material",
  "material_bezug.lieferant_org_id": "Materialbezüge",
  "dokument.organization_id": "Dokumente",
};

export default async function VerschmelzenPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const sp = await searchParams;
  const ids = [...new Set((sp.ids ?? "").split(",").filter((x) => UUID.test(x)))];
  const supabase = await createClient();

  const { data: orgs, error } = ids.length
    ? await supabase
        .from("organization")
        .select("id, name, legal_name, relation, customer_number, supplier_number, vat_id, email, created_at")
        .in("id", ids)
    : { data: [], error: null };

  const { data: refs } = ids.length
    ? await supabase.from("organization_external_ref").select("organization_id, system, external_id").in("organization_id", ids)
    : { data: [] };

  const kandidaten: Kandidat[] = await Promise.all(
    (orgs ?? []).map(async (o) => {
      const { data: v } = await supabase.rpc("organization_verweise", { p_id: o.id });
      const verweise = Object.entries((v ?? {}) as Record<string, number>).map(([k, n]) => ({
        label: VERWEIS_LABEL[k] ?? k,
        anzahl: n,
      }));
      return {
        ...o,
        quellen: (refs ?? []).filter((r) => r.organization_id === o.id).map((r) => `${r.system} ${r.external_id}`),
        verweise,
      };
    }),
  );
  // Vorschlag für die führende: mit Keyline-Verweis, sonst die mit den meisten Verknüpfungen, sonst die älteste
  const gewicht = (k: Kandidat) =>
    (k.quellen.some((q) => q.startsWith("keyline")) ? 1e6 : 0) + k.verweise.reduce((a, v) => a + v.anzahl, 0);
  kandidaten.sort((a, b) => gewicht(b) - gewicht(a) || a.created_at.localeCompare(b.created_at));

  const fehlend = ids.length - kandidaten.length;

  return (
    <>
      <h1>Organisationen verschmelzen</h1>
      <p className="lead">
        Wähle die <strong>führende</strong> Organisation. Alle anderen werden in sie verschmolzen: Aufträge, Rechnungen,
        Eingangsrechnungen, Dokumente, Adressen, Kontakte usw. hängen danach an der führenden, leere Felder (USt-IdNr.,
        E-Mail, Debitor/Kreditor …) werden ergänzt, die anderen Organisationen gelöscht. Jede Verschmelzung wird mit
        einer vollständigen Kopie protokolliert.
      </p>
      {error && <div className="banner-err">Fehler: {error.message}</div>}
      {fehlend > 0 && (
        <div className="banner-warn">
          {fehlend} Organisation(en) aus dem Warenkorb gibt es nicht mehr (schon verschmolzen oder gelöscht).
        </div>
      )}
      {kandidaten.length < 2 ? (
        <p>Zum Verschmelzen mindestens zwei Organisationen in den Warenkorb legen.</p>
      ) : (
        <VerschmelzenForm kandidaten={kandidaten} />
      )}
    </>
  );
}
