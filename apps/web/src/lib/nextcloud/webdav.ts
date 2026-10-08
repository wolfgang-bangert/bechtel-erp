/**
 * Schlanker WebDAV-Zugriff auf die Nextcloud (nur was der Hotfolder braucht: Ordner listen/anlegen,
 * Datei laden, verschieben). Zugang über ein Nextcloud-App-Passwort aus der Server-Umgebung:
 *   NEXTCLOUD_URL           z. B. https://cloud.example.de
 *   NEXTCLOUD_USER          Nextcloud-Benutzername (dem der Hotfolder gehört)
 *   NEXTCLOUD_APP_PASSWORD  App-Passwort (Nextcloud → Einstellungen → Sicherheit)
 */

export type DavEintrag = { name: string; ordner: boolean; contentType: string | null };

type Zugang = { basis: string; auth: string };

export function nextcloudKonfiguriert(): boolean {
  return !!(process.env.NEXTCLOUD_URL && process.env.NEXTCLOUD_USER && process.env.NEXTCLOUD_APP_PASSWORD);
}

function zugang(): Zugang {
  const url = process.env.NEXTCLOUD_URL;
  const user = process.env.NEXTCLOUD_USER;
  const pw = process.env.NEXTCLOUD_APP_PASSWORD;
  if (!url || !user || !pw) throw new Error("Nextcloud ist nicht eingerichtet (NEXTCLOUD_URL/_USER/_APP_PASSWORD).");
  return {
    basis: `${url.replace(/\/+$/, "")}/remote.php/dav/files/${encodeURIComponent(user)}`,
    auth: "Basic " + Buffer.from(`${user}:${pw}`).toString("base64"),
  };
}

/** Pfad wie "werk-Eingang/Verträge/a.pdf" → URL (jedes Segment kodiert) */
const davUrl = (z: Zugang, pfad: string) =>
  `${z.basis}/${pfad
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;

async function dav(methode: string, pfad: string, init: { headers?: Record<string, string>; body?: string } = {}) {
  const z = zugang();
  return fetch(davUrl(z, pfad), {
    method: methode,
    headers: { Authorization: z.auth, ...init.headers },
    body: init.body,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
}

const fehler = (aktion: string, pfad: string, res: Response) =>
  new Error(
    res.status === 401
      ? "Nextcloud lehnt die Anmeldung ab - Benutzer/App-Passwort prüfen."
      : `Nextcloud: ${aktion} „${pfad}“ fehlgeschlagen (HTTP ${res.status}).`,
  );

/** Ordnerinhalt (eine Ebene). null = Ordner existiert nicht. */
export async function ordnerListen(pfad: string): Promise<DavEintrag[] | null> {
  const res = await dav("PROPFIND", pfad, {
    headers: { Depth: "1", "Content-Type": "application/xml" },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontenttype/></d:prop></d:propfind>`,
  });
  if (res.status === 404) return null;
  if (res.status !== 207) throw fehler("Ordner lesen", pfad, res);
  const xml = await res.text();
  const eintraege: DavEintrag[] = [];
  const responses = xml.match(/<(?:\w+:)?response[\s>][\s\S]*?<\/(?:\w+:)?response>/g) ?? [];
  for (const r of responses) {
    const href = r.match(/<(?:\w+:)?href>([^<]*)<\/(?:\w+:)?href>/)?.[1];
    if (!href) continue;
    const teile = href.replace(/\/+$/, "").split("/");
    const name = decodeURIComponent(teile[teile.length - 1] ?? "");
    eintraege.push({
      name,
      ordner: /<(?:\w+:)?collection\s*\/>/.test(r),
      contentType: r.match(/<(?:\w+:)?getcontenttype>([^<]*)</)?.[1] ?? null,
    });
  }
  // erster Eintrag ist der Ordner selbst
  return eintraege.slice(1);
}

/** Ordner anlegen, falls er fehlt (405 = gibt es schon). */
export async function ordnerAnlegen(pfad: string): Promise<void> {
  const res = await dav("MKCOL", pfad);
  if (res.status !== 201 && res.status !== 405) throw fehler("Ordner anlegen", pfad, res);
}

export async function dateiLaden(pfad: string): Promise<Buffer> {
  const res = await dav("GET", pfad);
  if (!res.ok) throw fehler("Datei laden", pfad, res);
  return Buffer.from(await res.arrayBuffer());
}

/** Datei verschieben; liegt am Ziel schon eine gleichnamige Datei, bekommt sie einen Zeitstempel davor. */
export async function dateiVerschieben(von: string, nach: string): Promise<void> {
  const z = zugang();
  const versuch = (ziel: string) =>
    dav("MOVE", von, { headers: { Destination: davUrl(z, ziel), Overwrite: "F" } });
  let res = await versuch(nach);
  if (res.status === 412) {
    const i = nach.lastIndexOf("/");
    const stempel = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
    res = await versuch(`${nach.slice(0, i + 1)}${stempel}_${nach.slice(i + 1)}`);
  }
  if (res.status !== 201 && res.status !== 204) throw fehler("Verschieben", von, res);
}
