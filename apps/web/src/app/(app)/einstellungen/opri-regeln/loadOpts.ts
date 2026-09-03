import { createClient } from "@/lib/supabase/server";

export async function loadRegelOpts() {
  const supabase = await createClient();
  const [{ data: gruppen }, { data: stamm }, { data: material }, { data: rollen }] = await Promise.all([
    supabase.from("opri_produkt_gruppe").select("id, kuerzel, name").order("kuerzel"),
    supabase.from("opri_stammartikel").select("id, sku, name").order("sku").limit(2000),
    supabase.from("material").select("id, name, name_kurz").eq("is_active", true).order("name"),
    supabase.from("material_rolle").select("name").order("sort"),
  ]);
  return {
    gruppen: (gruppen ?? []).map((g) => ({ id: g.id as string, label: `${g.kuerzel} — ${g.name}` })),
    stammartikel: (stamm ?? []).map((s) => ({ id: s.id as string, label: `${s.sku} — ${s.name}` })),
    material: (material ?? []).map((m) => ({
      id: m.id as string,
      label: (m.name_kurz as string) || (m.name as string),
    })),
    rollen: (rollen ?? []).map((r) => r.name as string),
  };
}
