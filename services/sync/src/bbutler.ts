import { env } from "./env";

/**
 * BuchhaltungsButler API v1.
 * - Alle Aufrufe sind POST (auch Lesezugriffe).
 * - Auth: HTTP Basic mit  <API Client>:<API Secret>
 * - Zusätzlich muss  api_key  im Body stehen (wählt den Mandanten aus).
 * - Antwortform (beobachtet): { success: boolean, data: [...], rows?: number }
 * Doku: https://app.buchhaltungsbutler.de/docs/api/v1/
 */
export async function bbPost<T = unknown>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<{ success: boolean; data: T; rows?: number; raw: unknown }> {
  const url = `${env.bbutler.base()}/${path.replace(/^\/+/, "")}`;
  const auth = Buffer.from(`${env.bbutler.client()}:${env.bbutler.secret()}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ api_key: env.bbutler.apiKey(), ...params }),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`BuchhaltungsButler ${res.status} bei ${path}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(
      `BuchhaltungsButler ${res.status} bei ${path}: ${JSON.stringify(json).slice(0, 400)}`,
    );
  }

  const obj = json as Record<string, unknown>;
  return {
    success: obj.success !== false,
    data: (obj.data ?? obj.result ?? obj.rows ?? []) as T,
    rows: typeof obj.rows === "number" ? (obj.rows as number) : undefined,
    raw: json,
  };
}

/**
 * Seitenweise alle Datensätze holen. BB nutzt (je nach Endpunkt) limit/offset;
 * wir paginieren defensiv, bis eine Seite kürzer als limit ist.
 */
export async function bbGetAll<T = Record<string, unknown>>(
  path: string,
  params: Record<string, unknown> = {},
  pageSize = 200,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await bbPost<T[]>(path, { ...params, limit: pageSize, offset });
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
    if (offset > 100_000) break; // Sicherheitsnetz
  }
  return out;
}
