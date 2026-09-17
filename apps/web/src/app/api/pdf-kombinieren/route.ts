import { requireStaff } from "@/lib/auth";
import { getObjectBytes } from "@/lib/storage";
import { seitenNebeneinander } from "@werk/shared/pdf/kombinieren";

const PREFIX = "tmp/pdf-kombinieren/";

/**
 * Baut aus der temporär hochgeladenen PDF (key) zwei gewählte Seiten
 * nebeneinander (links/rechts) und liefert das Ergebnis direkt als Download -
 * kein Zwischenspeichern in S3 nötig, das Ergebnis existiert nur im Response.
 */
export async function GET(req: Request) {
  await requireStaff();

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") ?? "";
  const links = Number(searchParams.get("links"));
  const rechts = Number(searchParams.get("rechts"));

  if (!key.startsWith(PREFIX)) {
    return new Response("Ungültiger Schlüssel.", { status: 400 });
  }
  if (!Number.isInteger(links) || !Number.isInteger(rechts)) {
    return new Response("Linke/rechte Seite fehlt oder ungültig.", { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await getObjectBytes(key);
  } catch {
    return new Response("Datei nicht gefunden - evtl. schon gelöscht, bitte erneut hochladen.", {
      status: 404,
    });
  }

  let out: Uint8Array;
  try {
    out = await seitenNebeneinander(bytes, links, rechts);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Fehler beim Kombinieren.", { status: 400 });
  }

  return new Response(Buffer.from(out), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="kombiniert.pdf"',
    },
  });
}
