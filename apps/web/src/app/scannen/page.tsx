import { createClient } from "@/lib/supabase/server";
import { ScanClient } from "./ScanClient";

export const metadata = { title: "Scannen · werk" };

export default async function ScannenPage({
  searchParams,
}: {
  searchParams: Promise<{ ziel?: string }>;
}) {
  const { ziel } = await searchParams;
  const supabase = await createClient();
  // Vorschläge für das Feld "Firma" (Lieferanten/Handwerker)
  const { data: orgs } = await supabase
    .from("organization")
    .select("name")
    .in("relation", ["supplier", "both"])
    .order("name")
    .limit(2000);

  return (
    <ScanClient
      startZiel={ziel === "dokument" ? "dokument" : "eingangsrechnung"}
      firmen={Array.from(new Set((orgs ?? []).map((o) => o.name as string)))}
    />
  );
}
