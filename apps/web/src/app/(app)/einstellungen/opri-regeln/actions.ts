"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseFluxServices } from "@/lib/flux/parseServices";

export type State = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};
const int = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

export async function saveRegel(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const name = s(fd, "name");
  const ebene = s(fd, "ebene");
  if (!name || !ebene) return { error: "Name und Ebene sind Pflicht." };

  let bedingung: unknown = {};
  const bedRaw = s(fd, "bedingung");
  if (bedRaw) {
    try {
      bedingung = JSON.parse(bedRaw);
    } catch {
      return { error: "Bedingung ist kein gültiges JSON." };
    }
  }

  const bedrucktRaw = s(fd, "bedruckt");
  const payload = {
    name,
    ebene,
    gruppe_id: ebene === "gruppe" ? s(fd, "gruppe_id") : null,
    stammartikel_id: ebene === "stammartikel" ? s(fd, "stammartikel_id") : null,
    option_match: ebene === "option" ? s(fd, "option_match") : null,
    bedingung,
    modus: s(fd, "modus") ?? "hinzufuegen",
    material_rolle: s(fd, "material_rolle"),
    verwendung: s(fd, "verwendung"),
    herkunft: s(fd, "herkunft"),
    material_id: s(fd, "herkunft") === "katalog_fix" ? s(fd, "material_id") : null,
    mengen_formel: s(fd, "mengen_formel") ?? "auflage",
    einheit: s(fd, "einheit") ?? "stück",
    vernutzung_format: s(fd, "vernutzung_format"),
    flux_product: s(fd, "flux_product"),
    flux_services: parseFluxServices(fd),
    grammatur: s(fd, "grammatur"),
    format: s(fd, "format"),
    produktionshinweis: s(fd, "produktionshinweis"),
    zaehlt_zur_blockstaerke: fd.get("zaehlt_zur_blockstaerke") != null,
    seite: s(fd, "seite"),
    bedruckt: bedrucktRaw === "ja" ? true : bedrucktRaw === "nein" ? false : null,
    prio: int(fd, "prio") ?? 100,
    is_active: fd.get("is_active") != null,
    notiz: s(fd, "notiz"),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("opri_material_regel").update(payload).eq("id", id)
    : await supabase.from("opri_material_regel").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/opri-regeln");
  redirect("/einstellungen/opri-regeln");
}

export async function deleteRegel(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("opri_material_regel").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/opri-regeln");
  redirect("/einstellungen/opri-regeln");
}
