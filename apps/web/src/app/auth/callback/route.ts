/**
 * Nimmt Supabase-Einladungs-/Passwort-Reset-Links entgegen (?code=...),
 * tauscht sie gegen eine Session und leitet zum Passwort-Setzen weiter.
 * Von der Middleware als öffentlicher Pfad behandelt (/auth/*).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/einstellungen/passwort?neu=1`);
    }
  }

  return NextResponse.redirect(`${origin}/login?fehler=link-abgelaufen`);
}
