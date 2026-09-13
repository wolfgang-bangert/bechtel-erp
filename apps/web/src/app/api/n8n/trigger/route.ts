/**
 * POST /api/n8n/trigger
 *
 * Stößt einen Sync-Lauf an (aktuell nur `fints:pull`) – dasselbe wie der
 * "Banken aktualisieren"-Button, nur ohne Login, für den n8n-Zeitplan.
 * Absicherung per `X-Werk-Secret`-Header gegen `N8N_SHARED_SECRET`.
 *
 * Body (optional): { "job": "fints:pull" }  – job ist aktuell die einzige
 * erlaubte Konstante (sync_request.job-Check in der DB).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkN8nSecret } from "@/lib/n8n/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_JOBS = new Set(["fints:pull"]);

export async function POST(req: Request) {
  if (!checkN8nSecret(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let job = "fints:pull";
  try {
    const body = await req.json();
    if (body?.job) job = String(body.job);
  } catch {
    // kein/leerer Body -> Default bleibt fints:pull
  }
  if (!ALLOWED_JOBS.has(job)) {
    return NextResponse.json({ ok: false, error: `unbekannter job: ${job}` }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: offen } = await sb
    .from("sync_request")
    .select("id")
    .eq("job", job)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();
  if (offen) {
    return NextResponse.json({ ok: true, skipped: true, id: offen.id, note: "läuft schon" });
  }

  const { data, error } = await sb
    .from("sync_request")
    .insert({ job, params: {} })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
