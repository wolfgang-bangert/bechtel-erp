/**
 * Nimmt Supabase-Einladungs-/Passwort-Reset-Links entgegen (?code=... oder
 * ?error=...), tauscht sie gegen eine Session und leitet zum Passwort-Setzen
 * weiter. Von der Middleware als öffentlicher Pfad behandelt (/auth/*).
 *
 * origin() statt new URL(request.url).origin: Route Handler sehen hinter dem
 * Reverse Proxy die interne Bind-Adresse (0.0.0.0:3000) statt der echten
 * Domain - derselbe Fehler wie beim Einladen/Passwort-vergessen-Versand,
 * hier aber beim ZURÜCK-Leiten statt beim Versenden.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const origin = await siteOrigin();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/einstellungen/passwort?neu=1`);
    }
  }

  // Supabase hängt bei Fehlern z.B. error_code=otp_expired an - durchreichen,
  // damit auf der Login-Seite der tatsächliche Grund sichtbar ist.
  const errorCode = searchParams.get("error_code");
  const fehler = errorCode ? `link-ungueltig-${errorCode}` : "link-abgelaufen";
  return NextResponse.redirect(`${origin}/login?fehler=${fehler}`);
}
