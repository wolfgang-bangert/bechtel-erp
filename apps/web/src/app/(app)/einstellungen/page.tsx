import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Tile = { href: string; title: string; hint: string; count?: number };

export default async function EinstellungenPage() {
  const supabase = await createClient();

  const [account, tax, cc, seq, profile] = await Promise.all([
    supabase.from("ledger_account").select("*", { count: "exact", head: true }),
    supabase.from("tax_code").select("*", { count: "exact", head: true }),
    supabase.from("cost_center").select("*", { count: "exact", head: true }),
    supabase.from("number_sequence").select("*", { count: "exact", head: true }),
    supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle(),
  ]);

  const p = (profile.data?.value ?? {}) as Record<string, unknown>;

  const tiles: Tile[] = [
    { href: "/einstellungen/sachkonten", title: "Sachkonten", hint: "SKR03-Konten für Kontierung & DATEV", count: account.count ?? 0 },
    { href: "/einstellungen/steuerschluessel", title: "Steuerschlüssel", hint: "Sätze & DATEV-BU-Schlüssel", count: tax.count ?? 0 },
    { href: "/einstellungen/kostenstellen", title: "Kostenstellen", hint: "für Auswertung & DATEV", count: cc.count ?? 0 },
    { href: "/einstellungen/nummernkreise", title: "Nummernkreise", hint: "Präfixe, Stellen, Jahres-Reset", count: seq.count ?? 0 },
    { href: "/einstellungen/firmenprofil", title: "Firmenprofil", hint: p.name ? String(p.name) : "noch nicht gesetzt" },
  ];

  return (
    <>
      <h1>Einstellungen</h1>
      <p className="lead">Buchhaltungs-Stammdaten und Konfiguration.</p>

      <div className="rows">
        {tiles.map((t) => (
          <div className="row" key={t.href}>
            <span className="w-name">
              <strong>{t.title}</strong>
              <span style={{ color: "var(--muted)", marginLeft: 8 }}>{t.hint}</span>
            </span>
            {typeof t.count === "number" && <span className="tag">{t.count}</span>}
            <Link href={t.href}>öffnen</Link>
          </div>
        ))}
      </div>
    </>
  );
}
