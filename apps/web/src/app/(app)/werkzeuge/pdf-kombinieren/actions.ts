"use server";

import { randomUUID } from "node:crypto";
import { deleteObject, putObject, signedGetUrl } from "@/lib/storage";
import { seitenzahl } from "@werk/shared/pdf/kombinieren";

const PREFIX = "tmp/pdf-kombinieren/";

export type UploadState = {
  ok?: boolean;
  error?: string;
  key?: string;
  fileName?: string;
  pageCount?: number;
  previewUrl?: string | null;
};

/** PDF hochladen (temporär, unter tmp/pdf-kombinieren/), Seitenzahl auslesen
 *  und einen kurzlebigen Vorschau-Link erzeugen. */
export async function uploadPdfAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Keine Datei ausgewählt." };
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Nur PDF-Dateien." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let pageCount: number;
  try {
    pageCount = await seitenzahl(bytes);
  } catch {
    return { error: "PDF konnte nicht gelesen werden - ist die Datei beschädigt?" };
  }
  if (pageCount < 1) return { error: "PDF hat keine Seiten." };

  const key = `${PREFIX}${randomUUID()}.pdf`;
  await putObject(key, bytes, "application/pdf");
  const previewUrl = await signedGetUrl(key, 1800);

  return { ok: true, key, fileName: file.name, pageCount, previewUrl };
}

export type DeleteState = { ok?: boolean; error?: string };

/** Temporäre Datei explizit wieder löschen ("fertig, nicht mehr gebraucht"). */
export async function deleteTempPdfAction(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const key = String(formData.get("key") ?? "");
  if (!key.startsWith(PREFIX)) return { error: "Ungültiger Schlüssel." };
  try {
    await deleteObject(key);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Löschen fehlgeschlagen." };
  }
  return { ok: true };
}
