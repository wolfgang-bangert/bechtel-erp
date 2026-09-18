"use server";

import { randomUUID } from "node:crypto";
import { deleteObject, putObject, signedGetUrl } from "@/lib/storage";
import { pdfMetadaten } from "@werk/shared/pdf/kombinieren";

const PREFIX = "tmp/pdf-seiten/";

export type HochgeladeneDatei = {
  key: string;
  fileName: string;
  pageCount: number;
  previewUrl: string | null;
};

export type UploadState = {
  ok?: boolean;
  error?: string;
  dateien?: HochgeladeneDatei[];
};

/** Ein oder mehrere PDFs hochladen (temporär, unter tmp/pdf-seiten/) - wird
 *  an die bestehende Liste angehängt, nicht ersetzt (Mehrfach-Merge). */
export async function uploadPdfsAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Keine Datei ausgewählt." };

  const dateien: HochgeladeneDatei[] = [];
  for (const file of files) {
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { error: `${file.name}: nur PDF-Dateien.` };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    let pageCount: number;
    try {
      pageCount = (await pdfMetadaten(bytes)).pageCount;
    } catch {
      return { error: `${file.name}: konnte nicht gelesen werden - ist die Datei beschädigt?` };
    }
    if (pageCount < 1) return { error: `${file.name}: hat keine Seiten.` };

    const key = `${PREFIX}${randomUUID()}.pdf`;
    await putObject(key, bytes, "application/pdf");
    const previewUrl = await signedGetUrl(key, 1800);
    dateien.push({ key, fileName: file.name, pageCount, previewUrl });
  }

  return { ok: true, dateien };
}

export type DeleteState = { ok?: boolean; error?: string };

/** Alle temporären Dateien dieser Sitzung wieder löschen ("fertig, nicht
 *  mehr gebraucht"). keys als JSON-Array im Formularfeld "keys". */
export async function deleteTempPdfsAction(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  let keys: unknown;
  try {
    keys = JSON.parse(String(formData.get("keys") ?? "[]"));
  } catch {
    return { error: "Ungültige Schlüsselliste." };
  }
  if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string" && k.startsWith(PREFIX))) {
    return { error: "Ungültige Schlüssel." };
  }
  try {
    await Promise.all(keys.map((k) => deleteObject(k)));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Löschen fehlgeschlagen." };
  }
  return { ok: true };
}
