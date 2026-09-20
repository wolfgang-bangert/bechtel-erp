import { createClient } from "@/lib/supabase/server";
import { FluxWebhookEventTable, type FluxWebhookEvent } from "./ui";

export const dynamic = "force-dynamic";

export default async function FluxWebhooksPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flux_webhook_event")
    .select(
      "id, key, label, gruppe, opri_bezug, status_optionen, aktiv_in_flux, verarbeitet_in_werk, notiz, sortierung",
    );

  return (
    <>
      <h1>flux-Webhooks</h1>
      <p className="lead">
        Katalog aller Events, die sich in flux als Webhook aktivieren lassen (aus der flux-UI
        übertragen, flux bietet dafür keine API). "aktiv in flux" und Notiz pflegst du hier
        manuell, als Abgleich mit dem, was in flux tatsächlich angeschaltet ist. "opri-Auftrag"
        markiert Events, die sich einem Portal-Auftrag zuordnen lassen.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <FluxWebhookEventTable rows={(data ?? []) as FluxWebhookEvent[]} />
    </>
  );
}
