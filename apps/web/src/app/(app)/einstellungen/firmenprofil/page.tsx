import { createClient } from "@/lib/supabase/server";
import { CompanyProfileForm, type CompanyProfile } from "./ui";

export const dynamic = "force-dynamic";

export default async function FirmenprofilPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("setting")
    .select("value")
    .eq("key", "company.profile")
    .maybeSingle();

  const profile = (data?.value ?? {}) as CompanyProfile;

  return (
    <>
      <h1>Firmenprofil</h1>
      <p className="lead">
        Erscheint auf Rechnungen und im DATEV-Export. Wird als
        <code> setting / company.profile </code> gespeichert.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <CompanyProfileForm profile={profile} />
    </>
  );
}
