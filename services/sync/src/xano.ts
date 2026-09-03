import { env } from "./env";

const H = () => ({ Authorization: `Bearer ${env.xano.token()}`, Accept: "application/json" });

async function meta<T = unknown>(path: string): Promise<T> {
  const r = await fetch(env.xano.metaBase() + path, { headers: H() });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Xano meta ${r.status} bei ${path} — ${body.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

/** Alle Zeilen einer Xano-Tabelle (Metadata-API, seitenweise). */
export async function xanoTableRows<T = Record<string, unknown>>(
  tableId: number,
  workspace = env.xano.workspace(),
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 200; page++) {
    const res = await meta<
      T[] | { items?: T[]; nextPage?: number | null }
    >(`/workspace/${workspace}/table/${tableId}/content?page=${page}&per_page=200`);
    const rows = Array.isArray(res) ? res : (res.items ?? []);
    out.push(...rows);
    if (Array.isArray(res) || !res.nextPage) break;
  }
  return out;
}

/** Tabellenliste eines Workspace (id → name). */
export async function xanoTables(
  workspace = env.xano.workspace(),
): Promise<{ id: number; name: string }[]> {
  const out: { id: number; name: string }[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await meta<
      { id: number; name: string }[] | { items?: { id: number; name: string }[]; nextPage?: number | null }
    >(`/workspace/${workspace}/table?page=${page}&per_page=200`);
    const rows = Array.isArray(res) ? res : (res.items ?? []);
    out.push(...rows.map((r) => ({ id: r.id, name: r.name })));
    if (Array.isArray(res) || !res.nextPage) break;
  }
  return out;
}
