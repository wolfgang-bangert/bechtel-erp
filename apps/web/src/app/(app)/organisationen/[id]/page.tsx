import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RELATION_LABEL: Record<string, string> = {
  customer: "Kunde",
  supplier: "Lieferant",
  both: "Kunde + Lieferant",
};

export default async function OrganisationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: org, error }, { data: refs }, { data: addresses }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("organization")
        .select("*")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("organization_external_ref")
        .select("system, external_id, is_authoritative, synced_at, metadata")
        .eq("organization_id", id),
      supabase
        .from("address")
        .select("kind, is_default, line1, line2, zip, city, country")
        .eq("organization_id", id),
      supabase
        .from("contact")
        .select("first_name, last_name, email, phone, position, is_primary")
        .eq("organization_id", id),
    ]);

  if (error) {
    return <div className="banner-err">Fehler: {error.message}</div>;
  }
  if (!org) notFound();

  return (
    <>
      <p className="lead">
        <Link href="/organisationen">← Organisationen</Link>
      </p>
      <h1>{org.name}</h1>
      <p className="lead">
        {RELATION_LABEL[org.relation] ?? org.relation}
        {org.customer_segment ? ` · Segment ${org.customer_segment}` : ""}
      </p>

      <h2>Stammdaten</h2>
      <dl className="kv">
        <dt>Anzeigename</dt>
        <dd>{org.name}</dd>
        <dt>Rechtsform / Firmierung</dt>
        <dd>{org.legal_name || "–"}</dd>
        <dt>Debitorennummer</dt>
        <dd>{org.customer_number || "–"}</dd>
        <dt>Kreditorennummer</dt>
        <dd>{org.supplier_number || "–"}</dd>
        <dt>USt-IdNr</dt>
        <dd>
          {org.vat_id || "–"}
          {org.vat_id_valid === true ? " ✓" : org.vat_id_valid === false ? " (ungültig)" : ""}
        </dd>
        <dt>Steuerland</dt>
        <dd>{org.tax_country}</dd>
        <dt>Steuerbehandlung</dt>
        <dd>{org.default_tax_treatment}</dd>
        <dt>E-Mail</dt>
        <dd>{org.email || "–"}</dd>
        <dt>Mahnsperre</dt>
        <dd>{org.dunning_enabled ? "nein" : "ja"}</dd>
      </dl>

      <h2>Herkunft / Fremdsysteme</h2>
      {(refs ?? []).length === 0 ? (
        <p className="lead">In werk angelegt, keine Fremdsystem-Zuordnung.</p>
      ) : (
        <div className="rows">
          {(refs ?? []).map((r) => (
            <div className="row" key={`${r.system}:${r.external_id}`}>
              <span className="w-code">
                <strong>{r.system}</strong>
              </span>
              <span className="w-code">{r.external_id}</span>
              {r.is_authoritative && <span className="tag">führend</span>}
              <span className="count" style={{ fontSize: 12, color: "var(--muted)" }}>
                {r.metadata && Object.keys(r.metadata).length > 0
                  ? Object.entries(r.metadata)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join("  ·  ")
                  : ""}
              </span>
              <span className="count" style={{ fontSize: 12 }}>
                {r.synced_at ? `Sync ${new Date(r.synced_at).toLocaleString("de-DE")}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <h2>Adressen</h2>
      {(addresses ?? []).length === 0 ? (
        <p className="lead">Noch keine Adressen (Sync folgt).</p>
      ) : (
        <div className="rows">
          {(addresses ?? []).map((a, i) => (
            <div className="row" key={i}>
              <span className="w-code">{a.kind}</span>
              <span className="w-name">
                {[a.line1, a.line2, [a.zip, a.city].filter(Boolean).join(" "), a.country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              {a.is_default && <span className="tag">Standard</span>}
            </div>
          ))}
        </div>
      )}

      <h2>Kontakte</h2>
      {(contacts ?? []).length === 0 ? (
        <p className="lead">Noch keine Kontakte (Sync folgt).</p>
      ) : (
        <div className="rows">
          {(contacts ?? []).map((c, i) => (
            <div className="row" key={i}>
              <span className="w-name">
                {c.first_name} {c.last_name}
                {c.position ? ` · ${c.position}` : ""}
              </span>
              <span className="count">{c.email || ""}</span>
              <span className="count">{c.phone || ""}</span>
              {c.is_primary && <span className="tag">primär</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
