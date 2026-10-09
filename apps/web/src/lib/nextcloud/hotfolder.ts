import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { dokumentAnlegen, eingangsbelegErfassen, extraktionAnstossen } from "@/lib/belege";
import type { DokumentKategorie } from "@/lib/dokumente";
import { dateiLaden, dateiVerschieben, ordnerAnlegen, ordnerListen } from "./webdav";

/**
 * Nextcloud-Hotfolder: PDFs aus den Unterordnern von NEXTCLOUD_HOTFOLDER (Default "werk-Eingang")
 * abholen, in werk anlegen und danach in den Unterordner "erledigt" verschieben.
 * Ausgelöst per Knopf (Eingangsrechnungen/Dokumente) oder von n8n (POST /api/n8n/trigger).
 * Fehlende Ordner werden beim ersten Lauf angelegt, damit sie in der Nextcloud zu sehen sind.
 */

export const HOTFOLDER_ZIELE: { ordner: string; ziel: "eingangsrechnung" | DokumentKategorie }[] = [
  { ordner: "Eingangsrechnungen", ziel: "eingangsrechnung" },
  { ordner: "Rapporte", ziel: "rapport" },
  { ordner: "Lieferscheine", ziel: "lieferschein" },
  { ordner: "Personal", ziel: "personal" }, // nur mit Modul Personal (sonst bleibt der Ordner liegen)
  { ordner: "Sonstiges", ziel: "sonstiges" },
];

const ERLEDIGT = "erledigt";
const MAX_JE_LAUF = 50; // ein Knopfdruck soll nicht minutenlang laufen; der Rest kommt beim nächsten Mal

export const hotfolderName = () => (process.env.NEXTCLOUD_HOTFOLDER || "werk-Eingang").replace(/^\/+|\/+$/g, "");

export type HotfolderErgebnis = {
  eingangsrechnungen: number;
  dokumente: number;
  doppelt: number;
  /** Dateien, die kein PDF sind - bleiben liegen */
  uebersprungen: string[];
  fehler: string[];
  /** Limit erreicht - es liegt noch mehr im Ordner */
  mehr: boolean;
};

const istPdf = (name: string, contentType: string | null) =>
  /\.pdf$/i.test(name) || contentType === "application/pdf";

async function seitenZaehlen(bytes: Buffer): Promise<number | null> {
  try {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    return null;
  }
}

export async function hotfolderAbholen(
  sb: SupabaseClient,
  erfasstVon: string | null = null,
  opts: { personal?: boolean } = {},
): Promise<HotfolderErgebnis> {
  const mitPersonal = opts.personal ?? true;
  const basis = hotfolderName();
  const erg: HotfolderErgebnis = { eingangsrechnungen: 0, dokumente: 0, doppelt: 0, uebersprungen: [], fehler: [], mehr: false };
  let verarbeitet = 0;

  if ((await ordnerListen(basis)) === null) await ordnerAnlegen(basis);

  for (const { ordner, ziel } of HOTFOLDER_ZIELE) {
    if (ziel === "personal" && !mitPersonal) continue; // Personal-Dokumente holt nur, wer das Modul Personal hat
    const pfad = `${basis}/${ordner}`;
    let inhalt = await ordnerListen(pfad);
    if (inhalt === null) {
      await ordnerAnlegen(pfad);
      await ordnerAnlegen(`${pfad}/${ERLEDIGT}`);
      continue;
    }
    if (!inhalt.some((e) => e.ordner && e.name === ERLEDIGT)) await ordnerAnlegen(`${pfad}/${ERLEDIGT}`);
    inhalt = inhalt.filter((e) => !e.ordner && !e.name.startsWith("."));

    for (const datei of inhalt) {
      if (!istPdf(datei.name, datei.contentType)) {
        erg.uebersprungen.push(`${ordner}/${datei.name}`);
        continue;
      }
      if (verarbeitet >= MAX_JE_LAUF) {
        erg.mehr = true;
        break;
      }
      verarbeitet++;
      const quelle = `${pfad}/${datei.name}`;
      try {
        const bytes = await dateiLaden(quelle);
        // Inhalt prüfen, nicht nur Name/Typangabe: echte PDFs beginnen mit "%PDF"
        if (bytes.subarray(0, 1024).indexOf("%PDF") === -1) {
          erg.uebersprungen.push(`${ordner}/${datei.name}`);
          continue;
        }
        const r =
          ziel === "eingangsrechnung"
            ? await eingangsbelegErfassen(sb, bytes, datei.name)
            : await dokumentAnlegen(sb, bytes, datei.name, {
                kategorie: ziel,
                titel: datei.name.replace(/\.pdf$/i, ""),
                seiten: await seitenZaehlen(bytes),
                quelle: "upload",
                erfasstVon,
              });
        if (r.status === "doppelt") erg.doppelt++;
        else if (ziel === "eingangsrechnung") erg.eingangsrechnungen++;
        else erg.dokumente++;
        // erst nach erfolgreichem Anlegen (oder als Dublette erkannt) aus dem Eingang nehmen
        await dateiVerschieben(quelle, `${pfad}/${ERLEDIGT}/${datei.name}`);
      } catch (e) {
        erg.fehler.push(`${ordner}/${datei.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (erg.eingangsrechnungen > 0) await extraktionAnstossen(sb);
  return erg;
}

/** Ergebnis als ein Satz für Knopf-Rückmeldung und n8n */
export function hotfolderText(e: HotfolderErgebnis): string {
  const teile: string[] = [];
  if (e.eingangsrechnungen) teile.push(`${e.eingangsrechnungen} Eingangsrechnung(en)`);
  if (e.dokumente) teile.push(`${e.dokumente} Dokument(e)`);
  let t = teile.length ? `✓ ${teile.join(" und ")} geholt` : "Nichts Neues in der Nextcloud";
  if (e.doppelt) t += `, ${e.doppelt} schon vorhanden (trotzdem nach „erledigt“ verschoben)`;
  if (e.eingangsrechnungen) t += " – die KI-Erkennung läuft";
  if (e.mehr) t += ". Es liegt noch mehr im Ordner – bitte nochmal holen";
  return t + ".";
}
