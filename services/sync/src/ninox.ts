import { env } from "./env";

export type NinoxRecord = {
  id: number;
  fields: Record<string, unknown>;
};

function ninoxDbUrl(path: string): string {
  const n = env.ninox;
  return `${n.base()}/teams/${n.team()}/databases/${n.database()}${path}`;
}

async function nxGet(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(ninoxDbUrl(path));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.ninox.key()}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ninox ${res.status} ${res.statusText} bei ${path} — ${body.slice(0, 200)}`);
  }
  return res;
}

/** Alle Datensätze einer Tabelle, seitenweise (perPage 500). */
export async function fetchNinoxRecords(
  tableId: string,
  onPage: (rows: NinoxRecord[], meta: { page: number; loaded: number }) => Promise<void>,
): Promise<void> {
  const perPage = 500;
  let page = 0;
  let loaded = 0;
  for (;;) {
    const res = await nxGet(`/tables/${tableId}/records`, { page, perPage });
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) throw new Error(`Ninox: unerwartete Antwort (Seite ${page})`);
    const rows = json as NinoxRecord[];
    loaded += rows.length;
    await onPage(rows, { page, loaded });
    if (rows.length < perPage) break;
    page += 1;
    if (page > 100) throw new Error("Ninox: zu viele Seiten (Abbruch)");
  }
}
