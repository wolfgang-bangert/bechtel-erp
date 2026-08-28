import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const supabase = await createClient();

  const [{ data: sequences }, { data: settings }, { count: accountCount }, { count: taxCount }] =
    await Promise.all([
      supabase.from("number_sequence").select("*").order("key"),
      supabase.from("setting").select("*").eq("key", "company.profile").maybeSingle(),
      supabase.from("ledger_account").select("*", { count: "exact", head: true }),
      supabase.from("tax_code").select("*", { count: "exact", head: true }),
    ]);

  const profile = (settings?.value ?? {}) as Record<string, unknown>;

  return (
    <>
      <h1>Einstellungen</h1>
      <p className="lead">Buchhaltungs-Stammdaten und Konfiguration.</p>

      <h2>Kontenverwaltung</h2>
      <div className="rows">
        <div className="row">
          <span className="w-name">Sachkonten (SKR03)</span>
          <span className="tag">{accountCount ?? 0} Konten</span>
          <Link href="/einstellungen/sachkonten">öffnen</Link>
        </div>
        <div className="row">
          <span className="w-name">Steuerschlüssel</span>
          <span className="tag">{taxCount ?? 0} Schlüssel</span>
          <Link href="/einstellungen/steuerschluessel">öffnen</Link>
        </div>
      </div>

      <h2>Nummernkreise (nur Ansicht)</h2>
      <div className="rows">
        <div className="row head">
          <span className="w-code">Schlüssel</span>
          <span className="w-code">Präfix</span>
          <span>Stellen</span>
          <span>Reset</span>
          <span>Stand</span>
        </div>
        {(sequences ?? []).map((s) => (
          <div className="row" key={s.key}>
            <span className="w-code">{s.key}</span>
            <span className="w-code">{s.prefix || "–"}</span>
            <span>{s.padding}</span>
            <span>{s.period === "year" ? "jährlich" : "–"}</span>
            <span>{s.current_value}</span>
          </div>
        ))}
      </div>

      <h2>Firmenprofil (nur Ansicht)</h2>
      <dl className="kv">
        <dt>Name</dt>
        <dd>{String(profile.name || "— noch nicht gesetzt —")}</dd>
        <dt>USt-IdNr</dt>
        <dd>{String(profile.vat_id || "—")}</dd>
        <dt>Steuernummer</dt>
        <dd>{String(profile.tax_number || "—")}</dd>
      </dl>
      <p className="lead" style={{ marginTop: 8 }}>
        Bearbeitung von Kostenstellen, Nummernkreisen und Firmenprofil folgt im
        nächsten Schritt.
      </p>
    </>
  );
}
