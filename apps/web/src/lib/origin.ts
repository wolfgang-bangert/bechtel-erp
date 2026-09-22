import { headers } from "next/headers";

/**
 * Öffentliche Basis-URL für Auth-Redirects (Einladung, Passwort vergessen).
 * WERK_DOMAIN bevorzugt (feste Umgebungsvariable, dieselbe wie für Caddy,
 * siehe ops/Caddyfile + docker-compose.yml) - Header-basierte Erkennung
 * hinter dem Reverse Proxy lieferte in Produktion "0.0.0.0:3000" statt der
 * echten Domain. Header-Fallback bleibt nur für die lokale Entwicklung
 * (dort ist WERK_DOMAIN nicht gesetzt).
 */
export async function siteOrigin(): Promise<string> {
  if (process.env.WERK_DOMAIN) return `https://${process.env.WERK_DOMAIN}`;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("host")}`;
}
