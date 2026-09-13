import { timingSafeEqual } from "node:crypto";

/**
 * Prüft den `X-Werk-Secret`-Header gegen `N8N_SHARED_SECRET`.
 * Genutzt von den `/api/n8n/*`-Routen, die n8n ohne Login aufruft
 * (Bank-Sync anstoßen, Status abfragen, Fehler melden).
 */
export function checkN8nSecret(req: Request): boolean {
  const secret = process.env.N8N_SHARED_SECRET;
  if (!secret) return false; // ohne konfiguriertes Secret grundsätzlich zu
  const header = req.headers.get("x-werk-secret") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
