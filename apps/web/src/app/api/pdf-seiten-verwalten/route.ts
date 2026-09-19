import { requireStaff } from "@/lib/auth";
import { getObjectBytes } from "@/lib/storage";
import { seitenNeuZusammenstellen, type SeitenRef } from "@werk/shared/pdf/seiten";

const PREFIX = "tmp/pdf-seiten/";

/**
 * Baut aus den temporär hochgeladenen PDFs (keys) die vom Nutzer festgelegte
 * Seitenreihenfolge und liefert das Ergebnis direkt als Download - kein
 * Zwischenspeichern in S3 nötig, das Ergebnis existiert nur im Response.
 *
 * POST statt GET (wie bei /api/pdf-kombinieren), weil die Reihenfolge bei
 * vielen Seiten zu lang für eine URL werden kann.
 */
export async function POST(req: Request) {
  await requireStaff();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Ungültiger Request-Body (JSON erwartet).", { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return new Response("Ungültiger Request-Body.", { status: 400 });
  }
  const { keys, reihenfolge } = body as { keys?: unknown; reihenfolge?: unknown };

  if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string" && k.startsWith(PREFIX))) {
    return new Response("Ungültige Schlüsselliste.", { status: 400 });
  }
  if (
    !Array.isArray(reihenfolge) ||
    !reihenfolge.every(
      (r) =>
        r &&
        typeof r === "object" &&
        Number.isInteger((r as SeitenRef).dateiIndex) &&
        Number.isInteger((r as SeitenRef).seite),
    )
  ) {
    return new Response("Ungültige Reihenfolge.", { status: 400 });
  }

  let dateien: Buffer[];
  try {
    dateien = await Promise.all(keys.map((k) => getObjectBytes(k)));
  } catch {
    return new Response("Datei nicht gefunden - evtl. schon gelöscht, bitte erneut hochladen.", {
      status: 404,
    });
  }

  let out: Uint8Array;
  try {
    out = await seitenNeuZusammenstellen(dateien, reihenfolge as SeitenRef[]);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Fehler beim Zusammenstellen.", { status: 400 });
  }

  return new Response(Buffer.from(out), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="zusammengestellt.pdf"',
    },
  });
}
