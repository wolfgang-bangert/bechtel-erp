import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Supabase-Client für Server Components, Route Handlers und Server Actions.
 * Nutzt die Session-Cookies des Requests -> RLS greift als der angemeldete Nutzer.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const nurAnsicht = (await headers()).get("x-werk-level") === "view";

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Aufruf aus einer Server Component ohne Response -> ignorieren,
            // die Middleware aktualisiert die Session ohnehin.
          }
        },
      },
    },
  );
  return nurAnsicht ? schreibSperre(client) : client;
}

/** Tabellen, die auch im Nur-Ansicht-Modus geschrieben werden dürfen (z. B. Hinweise als gelesen markieren). */
const SCHREIBEN_ERLAUBT = new Set(["notification", "notification_read"]);
const SCHREIB_METHODEN = new Set(["insert", "update", "upsert", "delete"]);

// Jede Kette (.eq().select().single() ...) endet in einem Fehlerergebnis statt in einem Schreibzugriff.
function fehlerKette(): unknown {
  const fehler = { data: null, error: { message: "Nur Ansicht: dieses Modul darf mit deinem Zugang nicht bearbeitet werden.", code: "42501" } };
  const kette: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === "then" ? (res: (v: unknown) => unknown) => res(fehler) : kette),
    apply: () => kette,
  });
  return kette;
}

/**
 * Nur-Ansicht-Zugang: Schreibzugriffe über den Server-Client (insert/update/upsert/delete) liefern einen Fehler.
 * Das ersetzt keine Datenbank-Rechte (RLS), sperrt aber alle Bearbeiten-Funktionen der Oberfläche.
 */
function schreibSperre<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => {
          const query = (target as unknown as { from: (t: string) => object }).from(table);
          if (SCHREIBEN_ERLAUBT.has(table)) return query;
          return new Proxy(query, {
            get(q, m) {
              if (typeof m === "string" && SCHREIB_METHODEN.has(m)) return () => fehlerKette();
              const v = (q as Record<string | symbol, unknown>)[m];
              return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(q) : v;
            },
          });
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
