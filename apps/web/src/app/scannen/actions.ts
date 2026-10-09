"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { dokumentAnlegen, dokumentErkennungAnstossen } from "@/lib/belege";
import { DOKUMENT_KATEGORIEN, istDokumentKategorie } from "@/lib/dokumente";
import { uploadIncoming } from "../(app)/eingangsrechnungen/actions";

export type ScanState = {
  ok?: boolean;
  error?: string;
  /** Ziel, in dem das Dokument gelandet ist (für den Erfolgshinweis) */
  ziel?: "eingangsrechnung" | "dokument";
  url?: string | null;
  doppelt?: boolean;
};

const s = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

/**
 * Gescanntes Dokument (im Browser aus den Handy-Fotos zu einem PDF zusammengesetzt) ablegen.
 * - Ziel "eingangsrechnung": derselbe Weg wie der manuelle Upload auf /eingangsrechnungen
 *   (incoming_document "captured" + KI-Extraktion über sync_request).
 * - Ziel "dokument": Dokumentablage (Tabelle dokument) mit Kategorie, Titel, Datum, Firma.
 */
export async function scanSpeichern(_prev: ScanState, fd: FormData): Promise<ScanState> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Kein Dokument – bitte zuerst eine Seite aufnehmen." };
  const ziel = s(fd, "ziel") === "dokument" ? "dokument" : "eingangsrechnung";
  // nur echte PDFs annehmen (gilt auch für "Fertiges PDF wählen")
  const kopf = Buffer.from(await file.slice(0, 1024).arrayBuffer());
  if (kopf.indexOf("%PDF") === -1) return { error: "Die Datei ist kein PDF." };

  if (ziel === "eingangsrechnung") {
    const inFd = new FormData();
    inFd.append("file", file, file.name);
    const r = await uploadIncoming({}, inFd);
    if (r.error) return { error: r.error };
    return {
      ok: true,
      ziel,
      doppelt: !r.count,
      url: r.uploaded?.[0]?.url ?? null,
    };
  }

  const kategorie = s(fd, "kategorie") ?? "sonstiges";
  if (!istDokumentKategorie(kategorie)) return { error: "Unbekannte Kategorie." };
  const titel = s(fd, "titel") ?? DOKUMENT_KATEGORIEN[kategorie];
  const datum = s(fd, "datum");
  if (datum && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { error: "Datum ungültig." };
  const partner = s(fd, "partner");
  const seiten = Number(s(fd, "seiten") ?? "") || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let r;
  try {
    r = await dokumentAnlegen(supabase, Buffer.from(await file.arrayBuffer()), file.name, {
      kategorie,
      titel,
      datum,
      partner,
      notiz: s(fd, "notiz"),
      seiten,
      quelle: "scan",
      erfasstVon: user?.id ?? null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (r.status === "doppelt") return { ok: true, ziel, doppelt: true };

  await dokumentErkennungAnstossen(supabase);
  revalidatePath("/dokumente");
  return { ok: true, ziel, url: await signedGetUrl(r.key, 1800) };
}
