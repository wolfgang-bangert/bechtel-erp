"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { putObject, signedGetUrl } from "@/lib/storage";
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
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const { data: schon } = await supabase.from("dokument").select("id").eq("file_sha256", sha256).limit(1);
  if (schon && schon.length) return { ok: true, ziel, doppelt: true };

  // Firma nur verknüpfen, wenn der Name eindeutig passt - sonst bleibt es beim Freitext.
  let organizationId: string | null = null;
  if (partner) {
    const { data: orgs } = await supabase.from("organization").select("id").ilike("name", partner.replace(/[\\%_]/g, (c) => "\\" + c)).limit(2);
    if (orgs && orgs.length === 1) organizationId = orgs[0].id;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const key = `dokumente/${new Date().getFullYear()}/${randomUUID()}.pdf`;
  await putObject(key, bytes, "application/pdf");

  const { error } = await supabase.from("dokument").insert({
    kategorie,
    titel,
    dokument_datum: datum,
    partner_name: partner,
    organization_id: organizationId,
    notiz: s(fd, "notiz"),
    file_name: file.name,
    storage_key: key,
    file_sha256: sha256,
    seiten,
    quelle: "scan",
    erfasst_von: user?.id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/dokumente");
  return { ok: true, ziel, url: await signedGetUrl(key, 1800) };
}
