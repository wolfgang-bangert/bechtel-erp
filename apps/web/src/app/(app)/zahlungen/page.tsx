import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ladeVorschlaege } from "@/lib/zahlungen/vorschlag";
import { ListeClient, type Konto } from "./ListeClient";

export const dynamic = "force-dynamic";

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ZahlungenPage({ searchParams }: { searchParams: Promise<{ ungebucht?: string }> }) {
  const { ungebucht } = await searchParams;
  const supabase = await createClient();
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const auchUngebucht = ungebucht === "1";

  const [vorschlaege, { data: konten }, { data: laeufe }] = await Promise.all([
    ladeVorschlaege(supabase, { ausfuehrung: heute, auchUngebucht }),
    supabase.from("bank_account").select("id, iban, label, kind, is_active").eq("is_active", true).order("label"),
    supabase.from("payment_batch").select("id, created_at, execution_date, item_count, total, status, debtor_iban").order("created_at", { ascending: false }).limit(15),
  ]);
  const girokonten = ((konten ?? []) as unknown as (Konto & { kind: string | null })[]).filter((k) => k.kind !== "darlehen");

  return (
    <div className="content-wide">
      <h1>Zahlungen</h1>
      <p className="lead">
        Offene Eingangsrechnungen auswählen, Beträge bei Bedarf ändern (Skonto ist vorgeschlagen, solange die Frist läuft) und
        eine SEPA-Sammeldatei für das Online-Banking erzeugen. Die Überweisung gibst du dort mit deiner TAN frei.
      </p>
      <div className="toolbar" style={{ gap: 12 }}>
        <Link href={auchUngebucht ? "/zahlungen" : "/zahlungen?ungebucht=1"} className="ghost" style={{ padding: "5px 10px" }}>
          {auchUngebucht ? "Nur gebuchte Rechnungen zeigen" : "Auch noch nicht gebuchte zeigen"}
        </Link>
        <span className="count">{vorschlaege.length} offene Rechnungen · Gutschriften werden nicht verrechnet</span>
      </div>

      <ListeClient vorschlaege={vorschlaege} konten={girokonten} heute={heute} />

      <h2 style={{ marginTop: 28 }}>Bisherige Zahlungsläufe</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr><th>Erzeugt</th><th>Ausführung</th><th>Konto</th><th style={{ textAlign: "right" }}>Zahlungen</th><th style={{ textAlign: "right" }}>Summe</th><th>Status</th></tr>
          </thead>
          <tbody>
            {((laeufe ?? []) as unknown as { id: string; created_at: string; execution_date: string; item_count: number; total: number; status: string; debtor_iban: string }[]).map((l) => (
              <tr key={l.id}>
                <td><Link href={`/zahlungen/${l.id}`}>{l.created_at.slice(0, 16).replace("T", " ")}</Link></td>
                <td className="count">{l.execution_date.split("-").reverse().join(".")}</td>
                <td className="count">{l.debtor_iban}</td>
                <td style={{ textAlign: "right" }}>{l.item_count}</td>
                <td style={{ textAlign: "right" }}>{eur(Number(l.total))} €</td>
                <td><span className="tag">{l.status}</span></td>
              </tr>
            ))}
            {!laeufe?.length && <tr><td colSpan={6} style={{ color: "var(--muted)" }}>Noch keine Zahlungsläufe.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
