/**
 * Lesezugriff auf die flux-Kataloge (Produkte, Papiersorten, Drucker, Standbögen)
 * für die Template-Pflege. Server-only. Kurzes In-Memory-Caching, damit die
 * Einstellungsseiten flux nicht bei jedem Render abfragen.
 * Server-only (liest FLUX_API_* aus der Umgebung).
 */
const BASE = process.env.FLUX_API_BASE;
const KEY = process.env.FLUX_API_KEY;

export type FluxServiceOption = { id: string; name: string };
export type FluxService = {
  id: string;
  name: string;
  defaultOptionId?: string;
  options: FluxServiceOption[];
};
export type FluxProduct = {
  id: string;
  name: string;
  description?: string;
  useStandardWorksteps?: boolean;
  services: FluxService[];
};
export type FluxSignature = {
  id: string;
  name: string;
  sheetSize?: { name?: string; width?: number; height?: number };
};
export type FluxPrinter = { id: string; name: string; status?: unknown; color?: boolean };

export type FluxCatalog = {
  ok: boolean;
  error?: string;
  products: FluxProduct[];
  paperTypes: string[];
  printers: FluxPrinter[];
  signatures: FluxSignature[];
};

type Cache = { at: number; data: FluxCatalog };
let cache: Cache | null = null;
const TTL_MS = 5 * 60_000;

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { apikey: KEY ?? "", "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`flux ${path} → ${r.status}`);
  return (await r.json()) as T;
}

function normServices(raw: unknown): FluxService[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((o) => {
      const opts = Array.isArray(o.options)
        ? (o.options as unknown[])
            .map((x) => {
              if (x == null) return null;
              if (typeof x === "string") return { id: x, name: x };
              const xo = x as Record<string, unknown>;
              return { id: String(xo.id ?? ""), name: String(xo.name ?? xo.id ?? "") };
            })
            .filter((x): x is FluxServiceOption => !!x)
        : [];
      return {
        id: String(o.id ?? o.serviceId ?? ""),
        name: String(o.name ?? o.id ?? o.serviceId ?? ""),
        defaultOptionId: o.defaultOptionId ? String(o.defaultOptionId) : undefined,
        options: opts,
      };
    });
}

export async function fluxCatalog(): Promise<FluxCatalog> {
  if (!BASE || !KEY) {
    return { ok: false, error: "FLUX_API_BASE/FLUX_API_KEY nicht gesetzt", products: [], paperTypes: [], printers: [], signatures: [] };
  }
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  try {
    const [prodRaw, paperRaw, printRaw, sigRaw] = await Promise.all([
      get<Record<string, unknown>[]>("/products?detailedServices=true"),
      get<Record<string, string[]>>("/paper-types"),
      get<Record<string, unknown>[]>("/printers"),
      get<Record<string, unknown>[]>("/signatures"),
    ]);

    const products: FluxProduct[] = (Array.isArray(prodRaw) ? prodRaw : [])
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? ""),
        description: p.description ? String(p.description) : undefined,
        useStandardWorksteps: Boolean(p.useStandardWorksteps),
        services: normServices(p.services),
      }))
      .filter((p) => p.name)
      .sort((a, b) => {
        const oa = a.name.toLowerCase().startsWith("opri_") ? 0 : 1;
        const ob = b.name.toLowerCase().startsWith("opri_") ? 0 : 1;
        return oa - ob || a.name.localeCompare(b.name, "de");
      });

    const paperTypes = (
      paperRaw && typeof paperRaw === "object" ? Object.values(paperRaw).flat() : []
    ).filter((x): x is string => typeof x === "string" && x.length > 0);

    const printers: FluxPrinter[] = (Array.isArray(printRaw) ? printRaw : [])
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? p.id ?? ""),
        color: p.color as boolean | undefined,
      }))
      .filter((p) => p.name);

    const signatures: FluxSignature[] = (Array.isArray(sigRaw) ? sigRaw : [])
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => {
        const ss = s.sheetSize as Record<string, unknown> | undefined;
        return {
          id: String(s.id ?? ""),
          name: String(s.name ?? ""),
          sheetSize: ss
            ? { name: ss.name ? String(ss.name) : undefined, width: Number(ss.width) || undefined, height: Number(ss.height) || undefined }
            : undefined,
        };
      })
      .filter((s) => s.name);

    const data: FluxCatalog = { ok: true, products, paperTypes, printers, signatures };
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      products: [],
      paperTypes: [],
      printers: [],
      signatures: [],
    };
  }
}
