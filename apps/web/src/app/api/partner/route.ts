import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Debitoren/Kreditoren für Auswahlfelder (z. B. Akonto in /bank): Suche nach Name oder Nummer.
 * GET /api/partner?art=debitor|kreditor&q=bolanz  → [{ id, name, nummer }] (max. 20)
 */
export async function GET(req: NextRequest) {
  const art = req.nextUrl.searchParams.get("art") === "kreditor" ? "kreditor" : "debitor";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().replace(/[%,()\\]/g, " ").trim();
  const spalte = art === "debitor" ? "customer_number" : "supplier_number";
  const sb = await createClient();
  let query = sb.from("organization").select(`id, name, ${spalte}`).not(spalte, "is", null).order("name").limit(20);
  if (q) {
    const woerter = q.split(/\s+/).filter(Boolean).slice(0, 4);
    for (const w of woerter) query = /^\d+$/.test(w) ? query.ilike(spalte, `${w}%`) : query.ilike("name", `%${w}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    ((data ?? []) as unknown as Record<string, string | null>[]).map((o) => ({ id: o.id, name: o.name, nummer: o[spalte] })),
  );
}
