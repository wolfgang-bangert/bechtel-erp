"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteObject, getObjectBytes, putObject, signedPutUrl } from "@/lib/storage";
import { seitenNeuZusammenstellen } from "@werk/shared/pdf/seiten";
import { ipKeyAusDateiname } from "@werk/shared/produkt/dateiname";

const ORDNER = new Set(["hauptregister", "unterregister", "inhalt", "deck"]);

/** Neuer, eindeutiger Speicherpfad + kurzlebiger Upload-Link für eine Datei. */
export async function presignArchivUpload(
  produktId: string,
): Promise<{ key: string; url: string } | { error: string }> {
  try {
    const key = `produkte/${produktId}/archiv/${randomUUID()}.pdf`;
    return { key, url: await signedPutUrl(key, "application/pdf") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload-Link konnte nicht erstellt werden." };
  }
}

export type ArchivMeta = {
  key: string;
  name: string;
  size: number;
  ordner: string;
  ipKey: string | null;
  seitenzahl: number | null;
};

/** Nach erfolgreichem Upload: Datei + Archiv-Eintrag anlegen. */
export async function registriereArchivDatei(
  produktId: string,
  m: ArchivMeta,
): Promise<{ ok: true } | { error: string }> {
  if (!ORDNER.has(m.ordner)) return { error: `Unbekannter Ordner "${m.ordner}".` };
  const name = m.name.normalize("NFC");
  const sb = await createClient();

  const { data: file, error: e1 } = await sb
    .from("file")
    .insert({
      kind: "print_data",
      storage_path: m.key,
      filename: name,
      mime: "application/pdf",
      size_bytes: m.size,
    })
    .select("id")
    .single();
  if (e1 || !file) return { error: e1?.message ?? "Datei konnte nicht angelegt werden." };

  const { error: e2 } = await sb.from("produkt_archiv").insert({
    produkt_id: produktId,
    file_id: file.id,
    ordner: m.ordner,
    original_name: name,
    ip_key: m.ipKey,
    seitenzahl: m.seitenzahl,
    size_bytes: m.size,
  });
  if (e2) {
    await sb.from("file").delete().eq("id", file.id);
    await deleteObject(m.key).catch(() => {});
    return { error: e2.code === "23505" ? `"${name}" ist schon im Archiv.` : e2.message };
  }

  revalidatePath(`/produkte/${produktId}/archiv`);
  return { ok: true };
}

export async function loescheArchivDatei(archivId: string, produktId: string): Promise<{ ok?: boolean; error?: string }> {
  const sb = await createClient();
  const { data: a } = await sb
    .from("produkt_archiv")
    .select("file_id, file:file_id(storage_path)")
    .eq("id", archivId)
    .maybeSingle();
  if (!a) return { error: "Eintrag nicht gefunden." };
  const path = (a.file as unknown as { storage_path: string } | null)?.storage_path;

  // file löschen -> Archiv-Eintrag und Verweise aus produktteil_datei fallen per Cascade mit
  const { error } = await sb.from("file").delete().eq("id", a.file_id as string);
  if (error) return { error: error.message };
  if (path) await deleteObject(path).catch(() => {});

  revalidatePath(`/produkte/${produktId}/archiv`);
  revalidatePath(`/produkte/${produktId}`);
  return { ok: true };
}

type ArchivRow = {
  id: string;
  ordner: string;
  original_name: string;
  ip_key: string | null;
  seitenzahl: number | null;
  file_id: string;
  file: { storage_path: string } | null;
};

type TeilRow = {
  id: string;
  typ: string;
  nr: string | null;
  titel: string | null;
  attribute: {
    quelle?: string;
    seite_von?: number;
    seite_bis?: number;
    dateien?: { ip: string }[];
  } | null;
  dateien: { id: string; quelle: string | null }[];
};

const dateiname = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();

/**
 * Aus dem Archiv die Einzeldateien der Produktteile erzeugen:
 *  - Register-Teile (attribute.quelle + Seitenbereich): Reiter-Doppelseite aus
 *    dem Register-Original herauslösen, als eigene PDF ablegen, verknüpfen.
 *  - Inhalts-Teile (attribute.dateien mit IP-Nummern): sind schon Einzeldateien,
 *    werden nur mit dem Original verknüpft.
 * Idempotent: bereits verknüpfte Teile/Dateien werden übersprungen.
 */
export async function erzeugeEinzeldateien(produktId: string): Promise<{
  ok?: boolean;
  error?: string;
  erzeugt: number;
  verknuepft: number;
  uebersprungen: number;
  fehlend: string[];
}> {
  const res = { erzeugt: 0, verknuepft: 0, uebersprungen: 0, fehlend: [] as string[] };
  const sb = await createClient();

  const { data: archivRaw, error: e1 } = await sb
    .from("produkt_archiv")
    .select("id, ordner, original_name, ip_key, seitenzahl, file_id, file:file_id(storage_path)")
    .eq("produkt_id", produktId);
  const { data: teileRaw, error: e2 } = await sb
    .from("produktteil")
    .select("id, typ, nr, titel, attribute, dateien:produktteil_datei(id, quelle)")
    .eq("produkt_id", produktId)
    .order("sortierung");
  if (e1 || e2) return { ...res, error: (e1 ?? e2)!.message };

  const archiv = (archivRaw ?? []) as unknown as ArchivRow[];

  // Einträge ohne IP-Schlüssel (z.B. Dateiname "IP_73 Übersicht ..." mit
  // Leerzeichen statt "_") aus dem Namen nachtragen und dauerhaft speichern.
  for (const a of archiv) {
    if (a.ip_key) continue;
    const key = ipKeyAusDateiname(a.original_name);
    if (!key) continue;
    a.ip_key = key;
    await sb.from("produkt_archiv").update({ ip_key: key }).eq("id", a.id);
  }

  const teile = (teileRaw ?? []) as unknown as TeilRow[];
  const bytesCache = new Map<string, Buffer>();

  const finde = (ordner: string[], key: string) =>
    archiv.find((a) => ordner.includes(a.ordner) && a.ip_key === key);

  for (const t of teile) {
    const a = t.attribute ?? {};
    const vorhanden = new Set((t.dateien ?? []).map((d) => d.quelle));

    if (a.quelle && a.seite_von && a.seite_bis) {
      if (vorhanden.has(a.quelle)) {
        res.uebersprungen++;
        continue;
      }
      const quelleKey = a.quelle.replace(/^IP_/, "");
      const src = finde(["hauptregister", "unterregister"], quelleKey);
      if (!src?.file) {
        res.fehlend.push(`${a.quelle} (für ${t.typ} ${t.nr})`);
        continue;
      }
      let bytes = bytesCache.get(src.id);
      if (!bytes) {
        bytes = await getObjectBytes(src.file.storage_path);
        bytesCache.set(src.id, bytes);
      }
      const refs = [];
      for (let s = a.seite_von; s <= a.seite_bis; s++) refs.push({ dateiIndex: 0, seite: s });
      let pdf: Uint8Array;
      try {
        pdf = await seitenNeuZusammenstellen([bytes], refs);
      } catch (e) {
        res.fehlend.push(`${a.quelle} S.${a.seite_von}-${a.seite_bis}: ${e instanceof Error ? e.message : "Fehler"}`);
        continue;
      }
      const name = dateiname(
        t.typ === "hauptregister" ? `Hauptregister ${t.nr} ${t.titel ?? ""}.pdf` : `${t.nr} ${t.titel ?? ""}.pdf`,
      );
      const key = `produkte/${produktId}/einzel/${randomUUID()}.pdf`;
      await putObject(key, pdf, "application/pdf");
      const { data: file, error: fe } = await sb
        .from("file")
        .insert({
          kind: "print_data",
          storage_path: key,
          filename: name,
          mime: "application/pdf",
          size_bytes: pdf.byteLength,
        })
        .select("id")
        .single();
      if (fe || !file) {
        await deleteObject(key).catch(() => {});
        return { ...res, error: fe?.message ?? "Datei konnte nicht angelegt werden." };
      }
      const { error: le } = await sb.from("produktteil_datei").insert({
        produktteil_id: t.id,
        file_id: file.id,
        reihenfolge: 1,
        quelle: a.quelle,
        seite_von: a.seite_von,
        seite_bis: a.seite_bis,
      });
      if (le) return { ...res, error: le.message };
      res.erzeugt++;
    } else if (a.dateien?.length) {
      let reihenfolge = 0;
      for (const d of a.dateien) {
        reihenfolge++;
        const quelle = `IP_${d.ip}`;
        if (vorhanden.has(quelle)) {
          res.uebersprungen++;
          continue;
        }
        const src = finde(["inhalt", "deck"], d.ip);
        if (!src) {
          res.fehlend.push(`${quelle} (für ${t.nr})`);
          continue;
        }
        const { error: le } = await sb.from("produktteil_datei").insert({
          produktteil_id: t.id,
          file_id: src.file_id,
          reihenfolge,
          quelle,
          seite_von: 1,
          seite_bis: src.seitenzahl,
        });
        if (le) return { ...res, error: le.message };
        res.verknuepft++;
      }
    }
  }

  revalidatePath(`/produkte/${produktId}`);
  revalidatePath(`/produkte/${produktId}/archiv`);
  return { ...res, ok: true };
}
