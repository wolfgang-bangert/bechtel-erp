import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TemplateForm, type Tpl } from "../TemplateForm";
import { loadCatalogForForm } from "../loadCatalog";

export const dynamic = "force-dynamic";

export default async function EditFluxTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, cat] = await Promise.all([
    supabase.from("flux_template").select("*").eq("id", id).maybeSingle(),
    loadCatalogForForm(),
  ]);
  if (!data) notFound();

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{data.name}</h1>
        <Link href="/einstellungen/flux-templates" className="ghost" style={{ padding: "7px 12px" }}>
          ← Liste
        </Link>
      </div>
      <TemplateForm tpl={data as unknown as Tpl} {...cat} />
    </>
  );
}
