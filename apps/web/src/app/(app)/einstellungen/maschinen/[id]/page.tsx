import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";
import { MaschineDetail, type Maschine } from "../ui";
import type { Faehigkeit } from "../FaehigkeitenEditor";

export const dynamic = "force-dynamic";

export default async function MaschineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const maschineQuery = supabase
    .from("maschine")
    .select(
      "id, name, typ, nummer, cost_center_id, flux_printer_name, farbe, kapazitaet_bogen_h, sortierung, aktiv, druckverfahren, max_farben, formate, geladen",
    )
    .eq("id", id)
    .maybeSingle();

  const [{ data: row, error }, cat, { data: costCenters }, { data: faeh }, { data: mfRows }] =
    await Promise.all([
      maschineQuery,
      fluxCatalog(),
      supabase.from("cost_center").select("id, number, name").order("number"),
      supabase
        .from("faehigkeit")
        .select("key, label, taetigkeit, art, einheit, optionen")
        .order("sortierung")
        .order("label"),
      supabase.from("maschine_faehigkeit").select("faehigkeit_key, wert").eq("maschine_id", id),
    ]);

  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!row) notFound();

  const werte: Record<string, unknown> = {};
  for (const r of mfRows ?? []) werte[r.faehigkeit_key as string] = r.wert;

  return (
    <>
      <p className="lead">
        <Link href="/einstellungen/maschinen">← Maschinen</Link>
      </p>
      <h1>{row.name}</h1>
      {!cat.ok && <p className="count">flux-Drucker konnten nicht geladen werden: {cat.error}</p>}

      <MaschineDetail
        row={row as unknown as Maschine}
        printers={cat.ok ? cat.printers.map((p) => p.name) : []}
        costCenters={(costCenters ?? []).map((c) => ({ id: c.id, label: `${c.number} – ${c.name}` }))}
        faehigkeiten={(faeh ?? []) as unknown as Faehigkeit[]}
        werte={werte}
      />
    </>
  );
}
