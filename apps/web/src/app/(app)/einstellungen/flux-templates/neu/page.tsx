import Link from "next/link";
import { TemplateForm } from "../TemplateForm";
import { loadCatalogForForm } from "../loadCatalog";

export const dynamic = "force-dynamic";

export default async function NeuFluxTemplatePage() {
  const cat = await loadCatalogForForm();
  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Neues flux-Template</h1>
        <Link href="/einstellungen/flux-templates" className="ghost" style={{ padding: "7px 12px" }}>
          ← Liste
        </Link>
      </div>
      <TemplateForm {...cat} />
    </>
  );
}
