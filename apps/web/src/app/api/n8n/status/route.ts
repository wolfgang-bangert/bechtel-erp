/**
 * GET /api/n8n/status?job=fints:pull&claim=1
 *
 * Für den n8n-Überwachungs-Workflow: holt fehlgeschlagene `sync_request`-Zeilen
 * ab, die noch nicht gemeldet wurden (egal ob per n8n-Zeitplan oder dem
 * "Banken aktualisieren"-Button ausgelöst), und markiert sie sofort als
 * gemeldet (`notified_at`), damit dieselbe Zeile nicht zweimal eine
 * Benachrichtigung auslöst. n8n braucht dadurch keinen eigenen Zustand.
 *
 * Liefert je Zeile zusätzlich `consecutive_failures` (1 oder 2): 2, wenn auch
 * der unmittelbar vorherige Lauf desselben Jobs fehlgeschlagen ist – Grundlage
 * für "nur bei wiederholtem Fehlschlag eine E-Mail".
 *
 * Ohne `claim=1`: reine Lesevariante (?id=<uuid>), z. B. zum manuellen Prüfen.
 * Absicherung per `X-Werk-Secret`-Header gegen `N8N_SHARED_SECRET`.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkN8nSecret } from "@/lib/n8n/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!checkN8nSecret(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const sb = createAdminClient();

  if (id) {
    const { data, error } = await sb
      .from("sync_request")
      .select("id, job, status, error, requested_at, finished_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, row: data ?? null });
  }

  const job = url.searchParams.get("job") ?? "fints:pull";
  const claim = url.searchParams.get("claim") === "1";

  const { data: rows, error } = await sb
    .from("sync_request")
    .select("id, job, status, error, requested_at, finished_at")
    .eq("job", job)
    .eq("status", "error")
    .is("notified_at", null)
    .order("requested_at", { ascending: true })
    .limit(20);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ ok: true, rows: [] });

  // je Zeile: war der unmittelbar vorherige Lauf desselben Jobs auch ein Fehler?
  const withCount = await Promise.all(
    rows.map(async (row) => {
      const { data: prev } = await sb
        .from("sync_request")
        .select("status")
        .eq("job", job)
        .lt("requested_at", row.requested_at)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...row, consecutive_failures: prev?.status === "error" ? 2 : 1 };
    }),
  );

  if (claim) {
    await sb
      .from("sync_request")
      .update({ notified_at: new Date().toISOString() })
      .in("id", rows.map((r) => r.id));
  }

  return NextResponse.json({ ok: true, rows: withCount });
}
