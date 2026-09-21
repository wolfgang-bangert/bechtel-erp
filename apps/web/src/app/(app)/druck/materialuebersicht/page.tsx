import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { materialBedarf, type MaterialZeile } from "@werk/shared/opri";

export const dynamic = "force-dynamic";

type Beitrag = {
  orderId: string;
  externalReference: string | null;
  deliverDate: string | null;
  menge: number;
  einheit: string;
  herleitung: string | null;
};

type Gruppe = {
  schluessel: string;
  label: string;
  einheit: string;
  gesamt: number;
  beitraege: Beitrag[];
};

export default async function MaterialuebersichtPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portal_order")
    .select("id, external_reference, deliver_date, resolve_result")
    .or("portal_state.is.null,portal_state.neq.FINISHED")
    .not("resolve_result", "is", null);

  const orders = (data ?? []) as unknown as {
    id: string;
    external_reference: string | null;
    deliver_date: string | null;
    resolve_result: { materialliste?: MaterialZeile[] } | null;
  }[];

  const gruppen = new Map<string, Gruppe>();
  for (const o of orders) {
    for (const z of o.resolve_result?.materialliste ?? []) {
      if (z.ungeloest) continue;
      const b = materialBedarf(z);
      if (!b.menge) continue;

      const label = [z.material_kurz || z.material || z.regel, z.grammatur, z.format]
        .filter(Boolean)
        .join(" · ");
      const schluessel = `${label}||${b.einheit}`;

      const g = gruppen.get(schluessel) ?? {
        schluessel,
        label,
        einheit: b.einheit,
        gesamt: 0,
        beitraege: [],
      };
      g.gesamt += b.menge;
      g.beitraege.push({
        orderId: o.id,
        externalReference: o.external_reference,
        deliverDate: o.deliver_date,
        menge: b.menge,
        einheit: b.einheit,
        herleitung: b.herleitung,
      });
      gruppen.set(schluessel, g);
    }
  }

  const sortiert = [...gruppen.values()]
    .map((g) => ({
      ...g,
      beitraege: g.beitraege.sort((a, b) => (a.deliverDate ?? "9999").localeCompare(b.deliverDate ?? "9999")),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "de", { numeric: true }));

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Materialübersicht</h1>
        <Link href="/druck" className="ghost" style={{ padding: "7px 12px" }}>
          ← Dashboard
        </Link>
      </div>
      <p className="lead">
        Tatsächlicher Materialbedarf über alle Aufträge, die noch nicht den Status FINISHED haben
        - je Material aufsummiert. Aufklappen zeigt die Beiträge der einzelnen Aufträge.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      {sortiert.length === 0 ? (
        <p className="lead">Keine offenen Aufträge mit aufgelösten Materialien.</p>
      ) : (
        <div className="rows">
          <div className="row head">
            <span className="w-name">Material</span>
            <span style={{ width: 160 }}>Gesamtbedarf</span>
          </div>
          {sortiert.map((g) => (
            <details key={g.schluessel} style={{ marginBottom: 6 }}>
              <summary
                style={{
                  cursor: "pointer",
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                  padding: "8px 10px",
                  background: "var(--tag-bg)",
                  borderRadius: 6,
                }}
              >
                <span className="w-name">
                  {g.label || "—"} <span className="count">· {g.beitraege.length} Aufträge</span>
                </span>
                <span style={{ width: 160, fontWeight: 600 }}>
                  {g.gesamt.toLocaleString("de-DE")} {g.einheit}
                </span>
              </summary>
              <div className="table-scroll" style={{ marginTop: 6 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Auftrag</th>
                      <th>Liefertermin</th>
                      <th style={{ textAlign: "right" }}>Menge</th>
                      <th>Herleitung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.beitraege.map((b, i) => (
                      <tr key={i}>
                        <td>
                          <Link href={`/druckauftraege/${b.orderId}`}>
                            {b.externalReference ?? b.orderId.slice(0, 8)}
                          </Link>
                        </td>
                        <td>{b.deliverDate ? fmtDate(b.deliverDate) : "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          {b.menge.toLocaleString("de-DE")} {b.einheit}
                        </td>
                        <td className="count">{b.herleitung ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
