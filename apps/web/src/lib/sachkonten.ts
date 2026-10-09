import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Alle Sachkonten laden - seitenweise, weil PostgREST höchstens 1000 Zeilen liefert (es gibt über 1.200;
 * ohne Paging fehlten alle Konten hinter "8140", z. B. 880, 8400, 9xxx). Numerisch sortiert ("880" vor
 * "1000"). Rückgabe wie eine Supabase-Abfrage ({ data, error }), damit es ein direkter Ersatz ist.
 */
export async function alleSachkonten<T extends { number: string } = { number: string; name: string }>(
  sb: SupabaseClient,
  spalten = "number, name",
  nurAktiv = false,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    let q = sb.from("ledger_account").select(spalten).order("number").range(f, f + 999);
    if (nurAktiv) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) return { data: out, error };
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  out.sort((a, b) => a.number.localeCompare(b.number, "de", { numeric: true }));
  return { data: out, error: null };
}
