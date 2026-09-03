import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegelForm, type Regel } from "../RegelForm";
import { loadRegelOpts } from "../loadOpts";

export const dynamic = "force-dynamic";

export default async function RegelEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, opts] = await Promise.all([
    supabase.from("opri_material_regel").select("*").eq("id", id).maybeSingle(),
    loadRegelOpts(),
  ]);
  if (!data) notFound();

  return (
    <>
      <h1>Regel: {(data as { name: string }).name}</h1>
      <p className="lead">
        <Link href="/einstellungen/opri-regeln">← Übersicht</Link>
      </p>
      <RegelForm regel={data as unknown as Regel} {...opts} />
    </>
  );
}
