import { env } from "./env";

export type KeylineOrganization = {
  id: number;
  name: string;
  tax_identifier: string | null;
  email: string | null;
  accounting_email: string | null;
  reference: string | null;
  debitor_identifier: string | null;
  creditor_identifier: string | null;
  preferred_locale: string | null;
  company_registration_number: string | null;
  created_at: string;
  updated_at: string;
};

async function klGet(
  path: string,
  params: Record<string, string | number> = {},
): Promise<Response> {
  const url = new URL(env.keylineBase + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.keylineKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Keyline ${res.status} ${res.statusText} bei ${path} — ${body.slice(0, 200)}`,
    );
  }
  return res;
}

/**
 * Seitenweise alle Organisationen (Keyline liefert 100/Seite und die Header
 * x-keyline-results-total / -per-page / -page).
 */
export async function fetchKeylineOrganizations(
  onPage: (
    rows: KeylineOrganization[],
    meta: { page: number; total: number },
  ) => Promise<void>,
): Promise<void> {
  let page = 1;
  for (;;) {
    const res = await klGet("/customer_relations/organizations", { page });
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) {
      throw new Error(`Keyline: unerwartete Antwort auf Seite ${page}`);
    }
    const rows = json as KeylineOrganization[];
    const total = Number(res.headers.get("x-keyline-results-total") ?? rows.length);
    const perPage = Number(
      res.headers.get("x-keyline-results-per-page") ?? (rows.length || 1),
    );

    await onPage(rows, { page, total });

    if (rows.length === 0 || page * perPage >= total) break;
    page += 1;
  }
}
