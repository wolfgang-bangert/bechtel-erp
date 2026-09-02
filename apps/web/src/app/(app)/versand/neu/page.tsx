import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewShipmentForm } from "./ui";

export const dynamic = "force-dynamic";

type Search = { q?: string; org?: string };

export default async function NeueSendungPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const orgId = sp.org ?? "";
  const supabase = await createClient();

  // Schritt 1: Kunde suchen
  if (!orgId) {
    let results: { id: string; name: string; customer_number: string | null; city: string | null }[] =
      [];
    if (q) {
      const like = `%${q.replace(/[%,]/g, "")}%`;
      const { data } = await supabase
        .from("organization")
        .select("id, name, customer_number, addresses:address(city, is_default)")
        .or(`name.ilike.${like},customer_number.ilike.${like}`)
        .order("name")
        .limit(30);
      results = (data ?? []).map((o) => {
        const addrs = (o.addresses ?? []) as { city: string | null; is_default: boolean }[];
        const city = addrs.find((a) => a.is_default)?.city ?? addrs[0]?.city ?? null;
        return { id: o.id, name: o.name, customer_number: o.customer_number, city };
      });
    }

    return (
      <>
        <h1>Neue Sendung</h1>
        <p className="lead">Zuerst den Kunden wählen (Adresse kommt aus der Kundentabelle).</p>

        <form method="get" className="toolbar">
          <input name="q" defaultValue={q} placeholder="Kundenname oder -nummer" autoFocus />
          <button type="submit">Suchen</button>
          <Link className="ghost" href="/versand" style={{ padding: "7px 12px" }}>
            Abbrechen
          </Link>
        </form>

        {q && (
          <div className="rows">
            {results.map((o) => (
              <Link key={o.id} className="row" href={`/versand/neu?org=${o.id}`}>
                <span className="w-name">{o.name}</span>
                <span className="tag">{o.customer_number ?? "ohne Nr"}</span>
                <span style={{ color: "var(--muted)" }}>{o.city ?? ""}</span>
              </Link>
            ))}
            {!results.length && <div className="row">Keine Treffer.</div>}
          </div>
        )}
      </>
    );
  }

  // Schritt 2: Sendung erfassen
  const [
    { data: org },
    { data: addresses },
    { data: contacts },
    { data: carriers },
    { data: orders },
    { data: companySetting },
  ] = await Promise.all([
    supabase.from("organization").select("id, name").eq("id", orgId).maybeSingle(),
    supabase
      .from("address")
      .select("id, kind, is_default, line1, line2, street, house_number, address_addition, zip, city, country")
      .eq("organization_id", orgId)
      .order("is_default", { ascending: false }),
    supabase
      .from("contact")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId)
      .order("is_primary", { ascending: false }),
    supabase.from("carrier").select("id, name, art").eq("is_active", true).order("name"),
    supabase
      .from("sales_order")
      .select("id, order_number, order_date")
      .eq("organization_id", orgId)
      .order("order_date", { ascending: false })
      .limit(50),
    supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle(),
  ]);

  const cp = (companySetting?.value ?? {}) as {
    name?: string;
    address?: { line1?: string; zip?: string; city?: string; country?: string };
  };
  const bechtelSender = [cp.name, cp.address?.line1, [cp.address?.zip, cp.address?.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  if (!org) {
    return (
      <>
        <h1>Neue Sendung</h1>
        <div className="banner-err">Kunde nicht gefunden.</div>
        <Link href="/versand/neu">← zurück zur Suche</Link>
      </>
    );
  }

  return (
    <>
      <h1>Neue Sendung — {org.name}</h1>
      <p className="lead">
        <Link href="/versand/neu?q=">anderer Kunde</Link>
      </p>
      <NewShipmentForm
        orgId={org.id}
        orgName={org.name}
        addresses={(addresses ?? []).map((a) => ({
          id: a.id,
          kind: a.kind,
          is_default: a.is_default,
          street: a.street ?? a.line1 ?? "",
          house_number: a.house_number ?? "",
          address_addition: a.address_addition ?? a.line2 ?? "",
          zip: a.zip ?? "",
          city: a.city ?? "",
          country: a.country ?? "DE",
        }))}
        contacts={(contacts ?? []).map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
        }))}
        carriers={(carriers ?? []) as { id: string; name: string; art: string }[]}
        orders={(orders ?? []).map((o) => ({
          id: o.id,
          label: `${o.order_number ?? o.id.slice(0, 8)}${o.order_date ? ` · ${o.order_date}` : ""}`,
        }))}
        bechtelSender={bechtelSender || "Firmenprofil unvollständig"}
      />
    </>
  );
}
