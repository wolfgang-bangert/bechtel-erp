import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ladeUstva } from "@/lib/ustva";
import { steuernummerBundesschema, ustvaXml } from "@/lib/elsterXml";

export const dynamic = "force-dynamic";

/**
 * ELSTER-XML der Voranmeldung zum Hochladen in Mein ELSTER (kein Versand):
 * GET /api/ustva/xml?monat=2026-06&versteuerung=soll[&berichtigt=1]
 */
export async function GET(req: Request) {
  await requireStaff();
  const sp = new URL(req.url).searchParams;
  const monat = sp.get("monat") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) return new Response("Ungültiger Monat.", { status: 400 });
  const versteuerung = sp.get("versteuerung") === "ist" ? "ist" : "soll";
  const berichtigt = sp.get("berichtigt") === "1";

  const supabase = await createClient();
  const { data } = await supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle();
  const p = (data?.value ?? {}) as {
    name?: string;
    tax_number?: string;
    address?: { line1?: string; zip?: string; city?: string };
  };
  const stnr = steuernummerBundesschema(p.tax_number ?? "");
  if (!stnr)
    return new Response(
      `Steuernummer im Firmenprofil nicht lesbar („${p.tax_number ?? ""}“). Erwartet: 10 Ziffern (BW, z. B. 63077/05356) oder 13-stellig.`,
      { status: 400 },
    );

  const d = await ladeUstva(monat, versteuerung);
  const xml = ustvaXml({
    monat,
    steuernummer: stnr,
    lieferant: { name: p.name ?? "", strasse: p.address?.line1 ?? "", plz: p.address?.zip ?? "", ort: p.address?.city ?? "" },
    e: d.ergebnis,
    berichtigt,
  });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="UStVA_${monat}${berichtigt ? "_berichtigt" : ""}.xml"`,
    },
  });
}
