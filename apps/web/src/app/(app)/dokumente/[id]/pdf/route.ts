import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";

/** PDF eines Ablage-Dokuments öffnen: Weiterleitung auf einen kurzlebigen Speicher-Link. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("dokument").select("storage_key").eq("id", id).maybeSingle();
  if (!data?.storage_key) return new NextResponse("Dokument nicht gefunden.", { status: 404 });
  const url = await signedGetUrl(data.storage_key, 600);
  if (!url) return new NextResponse("Speicher nicht konfiguriert.", { status: 500 });
  return NextResponse.redirect(url);
}
