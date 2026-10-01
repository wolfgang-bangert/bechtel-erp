import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { erzeugeOnlineprintersCsv } from "@werk/shared/fakturierung/csv";

/**
 * Eigenständiger CSV-Download (unabhängig vom PDF-Anhang) - z.B. für den
 * direkten Upload ins Onlineprinters-Portal. Muster: api/pdf-kombinieren/route.ts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();

  const { data: rechnung } = await supabase
    .from("invoice")
    .select("invoice_number, invoice_date")
    .eq("id", id)
    .maybeSingle();
  if (!rechnung?.invoice_number || !rechnung.invoice_date) {
    return new Response("Rechnung noch nicht abgeschlossen.", { status: 400 });
  }

  const { data: abrechnungen } = await supabase.from("abrechnung").select("id").eq("invoice_id", id);
  const abrechnungIds = (abrechnungen ?? []).map((a) => a.id as string);
  const { data: positionen } = abrechnungIds.length
    ? await supabase.from("abrechnung_position").select("referenz, betrag_netto").in("abrechnung_id", abrechnungIds)
    : { data: [] };

  const csv = erzeugeOnlineprintersCsv(
    (positionen ?? [])
      .filter((p) => p.referenz)
      .map((p) => ({ order_number: p.referenz as string, order_price: Number(p.betrag_netto) })),
    rechnung.invoice_number,
    rechnung.invoice_date,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${rechnung.invoice_number}.csv"`,
    },
  });
}
