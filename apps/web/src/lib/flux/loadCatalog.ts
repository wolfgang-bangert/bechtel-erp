import { fluxCatalog } from "@/lib/flux/catalog";

/** flux-Katalog auf das reduzieren, was Formulare als Client-Payload brauchen. */
export async function loadCatalogForForm() {
  // immer frisch, kein 5-Min-Cache im Editor/Panel
  const c = await fluxCatalog({ fresh: true });
  const products = c.products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    // Optionslisten je Service mitnehmen; nur echte Riesenlisten kappen
    // (dann greift für Papier die globale paperTypes-Liste).
    services: p.services.map((sv) => ({
      id: sv.id,
      name: sv.name,
      defaultOptionId: sv.defaultOptionId,
      options: sv.options.length > 80 ? [] : sv.options,
    })),
  }));
  return {
    catalogError: c.ok ? undefined : c.error,
    products,
    paperTypes: c.paperTypes,
    printers: c.printers.map((p) => p.name),
    signatures: c.signatures.map((sg) => sg.name),
  };
}
