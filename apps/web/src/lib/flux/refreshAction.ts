"use server";

import { revalidatePath } from "next/cache";
import { fluxCatalog } from "@/lib/flux/catalog";

export type State = { ok?: boolean; error?: string };

// Seiten, die den flux-Katalog anzeigen (Produkte/Papiersorten/Drucker/Standbögen).
const SEITEN = [
  "/einstellungen/opri-produkte",
  "/einstellungen/opri-regeln",
  "/einstellungen/maschinen",
  "/einstellungen/materialkatalog",
  "/einstellungen/standbogen",
];

/**
 * flux-Katalog jetzt frisch abrufen (umgeht den 5-Minuten-Cache) und die
 * Seiten, die ihn anzeigen, neu rendern lassen. Kein Server-Neustart nötig –
 * der In-Memory-Cache lebt im selben Prozess und wird hier direkt überschrieben.
 */
export async function refreshFluxCatalogAction(_prev: State, _fd: FormData): Promise<State> {
  const cat = await fluxCatalog({ fresh: true });
  for (const p of SEITEN) revalidatePath(p);
  if (!cat.ok) return { error: cat.error ?? "flux nicht erreichbar" };
  return { ok: true };
}
