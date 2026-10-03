import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type OrderRow = {
  order_number: string | null;
  state: string | null;
  order_date: string | null;
  net_total: number | null;
  organization: { name: string | null } | null;
};

/**
 * Auftragssuche (Keyline-Spiegel) für die Auftragszuordnung von Belegzeilen.
 * Suche nach Auftragsnummer (mit/ohne Bindestriche, "W7-MN-2S" = "W7MN2S") oder
 * Kundenname; ohne Suchtext die neuesten Aufträge.
 */
export async function GET(req: Request) {
  await requireStaff();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const supabase = await createClient();

  const select = "order_number, state, order_date, net_total, organization:organization_id ( name )";
  const base = () =>
    supabase.from("sales_order").select(select).not("order_number", "is", null).order("order_date", { ascending: false, nullsFirst: false }).limit(30);

  let rows: OrderRow[] = [];
  if (!q) {
    rows = ((await base()).data ?? []) as unknown as OrderRow[];
  } else {
    const norm = q.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const byNumber = norm ? await base().ilike("order_number", `%${norm}%`) : { data: [] };
    const like = `%${q.replace(/[%,]/g, "")}%`;
    const { data: orgs } = await supabase.from("organization").select("id").ilike("name", like).limit(50);
    const orgIds = (orgs ?? []).map((o) => o.id);
    const byCustomer = orgIds.length ? await base().in("organization_id", orgIds) : { data: [] };
    const seen = new Set<string>();
    for (const r of [...(byNumber.data ?? []), ...(byCustomer.data ?? [])] as unknown as OrderRow[]) {
      if (r.order_number && !seen.has(r.order_number)) {
        seen.add(r.order_number);
        rows.push(r);
      }
    }
    rows = rows.slice(0, 30);
  }

  return Response.json(
    rows.map((r) => ({
      order_number: r.order_number,
      customer: r.organization?.name ?? null,
      order_date: r.order_date,
      net_total: r.net_total,
      state: r.state,
    })),
  );
}
