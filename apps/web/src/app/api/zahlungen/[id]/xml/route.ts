import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** SEPA-Sammeldatei (pain.001) eines Zahlungslaufs zum Hochladen im Online-Banking. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("payment_batch").select("msg_id, xml").eq("id", id).maybeSingle();
  if (!data) return new Response("Zahlungslauf nicht gefunden.", { status: 404 });
  return new Response(data.xml as string, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.msg_id}.xml"`,
    },
  });
}
