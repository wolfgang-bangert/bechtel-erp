import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { darfAnsehen, moduleForPath, MODULE_LABEL, type ModuleLevels } from "@/lib/modules";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Frischt die Supabase-Session bei jedem Request auf und schützt alle Routen
 * außer /login und /auth. Ohne gültige Session -> Redirect auf /login.
 */
export async function updateSession(request: NextRequest) {
  // Vom Client mitgeschickte Werte nie vertrauen - nur die Middleware setzt diese Header.
  request.headers.delete("x-werk-level");
  let response = NextResponse.next({ request });
  let pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          pendingCookies = cookiesToSet;
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/start";
    return NextResponse.redirect(url);
  }

  // Modulrechte: kein Zugriff -> Hinweisseite bzw. 403; "nur ansehen" -> Schreibzugriffe der Anwendung
  // werden im Server-Client gesperrt (Header x-werk-level, siehe lib/supabase/server.ts).
  if (user && !isPublic) {
    try {
      const mod = moduleForPath(path);
      if (mod) {
        const { data, error } = await supabase.rpc("my_module_levels");
        // Fehler beim Laden der Rechte (z. B. Datenbank kurz nicht erreichbar): nicht aussperren
        if (!error) {
          const levels = (data ?? {}) as ModuleLevels;
          if (!darfAnsehen(levels, mod)) {
            const bereich = mod === "admin" ? "Mitarbeiter-Verwaltung" : MODULE_LABEL[mod];
            if (path.startsWith("/api/") || request.method !== "GET") {
              return new NextResponse("Kein Zugriff auf diesen Bereich.", { status: 403 });
            }
            const url = request.nextUrl.clone();
            url.pathname = "/kein-zugriff";
            url.search = `?bereich=${encodeURIComponent(bereich)}`;
            return NextResponse.redirect(url);
          }
          if (mod !== "admin" && levels[mod] === "view") {
            request.headers.set("x-werk-level", "view");
            response = NextResponse.next({ request });
            pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          }
        }
      }
    } catch {
      /* Rechteprüfung nie die ganze Anwendung lahmlegen lassen */
    }
  }

  return response;
}
