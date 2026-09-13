/**
 * POST /api/n8n/notify
 *
 * Legt eine In-App-Benachrichtigung an (Glocke im Layout). Für den
 * n8n-Überwachungs-Workflow gedacht (Bank-Sync-Fehler), aber generisch
 * gehalten – `source` kennzeichnet den Auslöser.
 *
 * Body: { level?: "info"|"warning"|"error", source: string, title: string,
 *         message: string, context?: object }
 * Absicherung per `X-Werk-Secret`-Header gegen `N8N_SHARED_SECRET`.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkN8nSecret } from "@/lib/n8n/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS = new Set(["info", "warning", "error"]);

export async function POST(req: Request) {
  if (!checkN8nSecret(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const source = String(body.source ?? "").trim();
  const title = String(body.title ?? "").trim();
  const message = String(body.message ?? "").trim();
  const level = LEVELS.has(String(body.level)) ? String(body.level) : "info";
  if (!source || !title || !message) {
    return NextResponse.json(
      { ok: false, error: "source, title und message sind Pflicht" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("notification")
    .insert({
      level,
      source,
      title,
      message,
      context: body.context && typeof body.context === "object" ? body.context : {},
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}
