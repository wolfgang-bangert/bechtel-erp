import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ladeAufstellungWochen } from "@/lib/abrechnung/aufstellung";
import { erzeugeAufstellungPdf } from "@werk/shared/pdf/aufstellung";

/** Aufstellung einer Wochen-Abrechnung als PDF (vor dem Festschreiben als Vorschau). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();

  const { data: abr } = await supabase.from("abrechnung").select("jahr, kw, invoice_id").eq("id", id).maybeSingle();
  if (!abr) return new Response("Abrechnung nicht gefunden.", { status: 404 });

  const [{ wochen, offen }, { data: setting }, { data: portal }] = await Promise.all([
    ladeAufstellungWochen(supabase, [id]),
    supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle(),
    supabase.from("portal").select("organization:organization_id(name)").eq("code", "onlineprinters").maybeSingle(),
  ]);
  const profile = (setting?.value ?? {}) as { name?: string; legal_name?: string };
  const org = portal?.organization as unknown as { name: string } | { name: string }[] | null | undefined;
  const orgName = (Array.isArray(org) ? org[0]?.name : org?.name) ?? "Onlineprinters";

  const pdf = await erzeugeAufstellungPdf({
    absenderName: profile.legal_name || profile.name || "Bechtel Druck",
    empfaengerName: orgName,
    vorschau: offen,
    wochen,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Aufstellung-KW${abr.kw}-${abr.jahr}.pdf"`,
    },
  });
}
