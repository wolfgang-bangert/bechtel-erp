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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function klGet(
  path: string,
  params: Record<string, string | number> = {},
): Promise<Response> {
  const url = new URL(env.keylineBase + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const maxAttempts = 6;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.keylineKey}`,
      },
    });

    if (res.ok) return res;

    // Rate-Limit / vorübergehende Fehler: warten und erneut versuchen
    if ((res.status === 429 || res.status === 503) && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30_000, 1000 * 2 ** attempt);
      await sleep(waitMs);
      continue;
    }

    const body = await res.text().catch(() => "");
    throw new Error(
      `Keyline ${res.status} ${res.statusText} bei ${path} — ${body.slice(0, 200)}`,
    );
  }
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

/** Generischer seitenweiser Abruf einer Keyline-Listen-Ressource. */
export async function fetchKeylinePaged<T = Record<string, unknown>>(
  path: string,
  onPage: (rows: T[], meta: { page: number; total: number }) => Promise<void>,
): Promise<void> {
  let page = 1;
  for (;;) {
    const res = await klGet(path, { page });
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) throw new Error(`Keyline: unerwartete Antwort ${path} Seite ${page}`);
    const rows = json as T[];
    const total = Number(res.headers.get("x-keyline-results-total") ?? rows.length);
    const perPage = Number(
      res.headers.get("x-keyline-results-per-page") ?? (rows.length || 1),
    );
    await onPage(rows, { page, total });
    if (rows.length === 0 || page * perPage >= total) break;
    page += 1;
  }
}

export type KeylineAddress = {
  id: number;
  addressee: string | null;
  street: string | null;
  number: string | null;
  addition: string | null;
  zip_code: string | null;
  town: string | null;
  country_code: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Rechnungs-PDF (nur festgeschriebene Rechnungen). null = kein PDF (404).
 */
export async function fetchKeylineInvoicePdf(invoiceId: number): Promise<Buffer | null> {
  const url = `${env.keylineBase}/accounting/customer_invoices/${invoiceId}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/pdf",
        Authorization: `Bearer ${env.keylineKey}`,
      },
    });
    if (res.status === 404) return null;
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("pdf")) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    if ((res.status === 429 || res.status === 503) && attempt < 6) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`Keyline PDF ${res.status} bei Rechnung ${invoiceId}`);
  }
}

/** Adressen einer Organisation (erste Seite, für die Hauptadresse ausreichend). */
export async function fetchKeylineOrgAddresses(orgId: number): Promise<KeylineAddress[]> {
  const res = await klGet(`/customer_relations/organizations/${orgId}/addresses`, {
    page: 1,
  });
  const json = (await res.json()) as unknown;
  return Array.isArray(json) ? (json as KeylineAddress[]) : [];
}
