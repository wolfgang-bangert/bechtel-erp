/**
 * Aus einem flux-Produkt (mit `services`) die auswählbaren Overrides ableiten.
 * flux liefert manche Services mehrfach mit je einer Option → Optionen mergen.
 */
export type SvcOption = { id: string; name: string };
export type ProductSvc = { id: string; name: string; defaultOptionId?: string; options: SvcOption[] };
export type ProductLite = { name: string; description?: string; services: ProductSvc[] };

export type SvcGroup = { name: string; options: string[]; def?: string };

const isPaper = (n: string) => /papiersorte|papertype/i.test(n);

function group(services: ProductSvc[], keep: (name: string) => boolean): SvcGroup[] {
  const m = new Map<string, { options: string[]; def?: string }>();
  for (const sv of services) {
    if (!keep(sv.name)) continue;
    const g = m.get(sv.name) ?? { options: [] as string[], def: undefined as string | undefined };
    for (const o of sv.options) if (o.name && !g.options.includes(o.name)) g.options.push(o.name);
    const def = sv.options.find((x) => x.id === sv.defaultOptionId);
    if (def && !g.def) g.def = def.name;
    m.set(sv.name, g);
  }
  return [...m.entries()].map(([name, g]) => ({ name, ...g }));
}

/** Papier-Service (kurze produkteigene Liste). */
export function paperGroup(product?: ProductLite): SvcGroup | null {
  const gs = group(product?.services ?? [], isPaper);
  return gs.find((g) => g.options.length > 0) ?? gs[0] ?? null;
}

/** Nicht-Papier-Services. */
export function otherGroups(product?: ProductLite): SvcGroup[] {
  return group(product?.services ?? [], (n) => !isPaper(n));
}

/** Einen benannten Service herausgreifen (z.B. "Beidseitig", "Farbiger Druck"). */
export function groupByName(product: ProductLite | undefined, name: string): SvcGroup | null {
  return otherGroups(product).find((g) => g.name.toLowerCase() === name.toLowerCase()) ?? null;
}
