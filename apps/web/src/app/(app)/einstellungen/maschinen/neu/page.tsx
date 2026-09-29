import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";
import { MaschineForm } from "../ui";

export const dynamic = "force-dynamic";

export default async function NeueMaschinePage() {
  const supabase = await createClient();
  const [cat, { data: costCenters }] = await Promise.all([
    fluxCatalog(),
    supabase.from("cost_center").select("id, number, name").order("number"),
  ]);

  return (
    <>
      <p className="lead">
        <Link href="/einstellungen/maschinen">← Maschinen</Link>
      </p>
      <h1>Neue Maschine</h1>
      <p className="lead" style={{ marginTop: -6 }}>
        Erst anlegen – Fähigkeiten pflegst du danach auf der Detailseite.
      </p>
      {!cat.ok && <p className="count">flux-Drucker konnten nicht geladen werden: {cat.error}</p>}

      <MaschineForm
        printers={cat.ok ? cat.printers.map((p) => p.name) : []}
        costCenters={(costCenters ?? []).map((c) => ({ id: c.id, label: `${c.number} – ${c.name}` }))}
      />
    </>
  );
}
