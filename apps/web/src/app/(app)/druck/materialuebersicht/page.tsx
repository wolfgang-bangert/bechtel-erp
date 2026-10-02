import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import {
  aggregiereMaterialbedarf,
  type MaterialGruppe,
  type MaterialOrderInput,
} from "@werk/shared/opri";

export const dynamic = "force-dynamic";

type OrderRow = MaterialOrderInput & { portal_state: string | null };

type BezugInfo = {
  id: string;
  bezeichnung: string;
  bestand: number;
  einheit: string;
  lagerort: string | null;
  lieferant: { name: string } | null;
  druckbogen: { code: string } | null;
};
// Schlüssel: materialId||druckbogenCode - fasst mehrere Materialbezüge mit
// demselben Material+Druckbogenformat zusammen (z.B. "80g Offset SRAeco" von
// zwei verschiedenen Lieferanten), unabhängig von Bezeichnung/Lieferant.
type BezuegeMap = Map<string, BezugInfo[]>;

const bezugSchluessel = (materialId: string, druckbogenCode: string | null) => `${materialId}||${druckbogenCode ?? ""}`;

const ANSICHTEN = [
  { key: "offen", label: "Offen (nicht FINISHED)" },
  { key: "monat", label: "Erledigt nach Monat" },
  { key: "alle", label: "Alle zusammen" },
] as const;
type Ansicht = (typeof ANSICHTEN)[number]["key"];

function monatLabel(d: string | null): string {
  const t = d ? new Date(d) : null;
  if (!t || Number.isNaN(t.getTime())) return "Ohne Liefertermin";
  return t.toLocaleDateString("de-DE", { year: "numeric", month: "long" });
}

function monatSortKey(d: string | null): string {
  const t = d ? new Date(d) : null;
  if (!t || Number.isNaN(t.getTime())) return "0000-00";
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}

export default async function MaterialuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const { ansicht: ansichtRaw } = await searchParams;
  const ansicht: Ansicht = ANSICHTEN.some((a) => a.key === ansichtRaw) ? (ansichtRaw as Ansicht) : "offen";

  const supabase = await createClient();
  let query = supabase
    .from("portal_order")
    .select("id, external_reference, deliver_date, portal_state, resolve_result")
    .not("resolve_result", "is", null);
  if (ansicht === "offen") query = query.or("portal_state.is.null,portal_state.neq.FINISHED");
  if (ansicht === "monat") query = query.eq("portal_state", "FINISHED");

  const { data, error } = await query;
  const orders = (data ?? []) as unknown as OrderRow[];

  // Materialbezug je vorkommendem Material laden - reine Zusatzanzeige, beeinflusst
  // die Bedarfs-Gruppen oben nicht: fehlt ein Bezug, bleibt die Bedarfs-Zeile trotzdem sichtbar.
  const materialIds = [
    ...new Set(
      orders.flatMap((o) => (o.resolve_result?.materialliste ?? []).map((z) => z.material_id).filter((x): x is string => !!x)),
    ),
  ];
  let bezuegeByMaterial: BezuegeMap = new Map();
  if (materialIds.length > 0) {
    // Nur Druckbogen-Bezüge (fertig geschnitten, druckfertig) - Rohbogen ist ein interner
    // Zwischenschritt (Umbuchen), den ein Auftrag nicht direkt "braucht".
    const { data: bezuegeRaw } = await supabase
      .from("material_bezug")
      .select(
        "id, material_id, bezeichnung, bestand, einheit, lagerort, lieferant:lieferant_org_id(name), druckbogen:druckbogen_id(code)",
      )
      .in("material_id", materialIds)
      .not("druckbogen_id", "is", null)
      .eq("is_active", true);
    const bezuege = (bezuegeRaw ?? []) as unknown as (BezugInfo & { material_id: string })[];
    bezuegeByMaterial = new Map();
    for (const b of bezuege) {
      const schluessel = bezugSchluessel(b.material_id, b.druckbogen?.code ?? null);
      const liste = bezuegeByMaterial.get(schluessel) ?? [];
      liste.push(b);
      bezuegeByMaterial.set(schluessel, liste);
    }
  }

  return (
    <div className="content-wide bd-page">
      <div className="bd-head">
        <div>
          <h1>Materialübersicht</h1>
          <p className="bd-lead" style={{ marginBottom: 16, maxWidth: 760 }}>
            Materialbedarf aus den aufgelösten Aufträgen (opri:resolve), je Material aufsummiert -
            damit klar ist, welches Material für die kommenden Aufträge gebraucht wird. Aufklappen
            zeigt die Beiträge der einzelnen Aufträge.
          </p>
        </div>
        <Link href="/druck" className="bd-btn bd-btn-secondary">
          ← Dashboard
        </Link>
      </div>

      <nav className="bd-tabs">
        {ANSICHTEN.map((a) =>
          a.key === ansicht ? (
            <span key={a.key} className="bd-tab active">
              {a.label}
            </span>
          ) : (
            <Link key={a.key} href={`/druck/materialuebersicht?ansicht=${a.key}`} className="bd-tab">
              {a.label}
            </Link>
          ),
        )}
      </nav>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      {ansicht === "monat" ? (
        <MonatsAnsicht orders={orders} bezuegeByMaterial={bezuegeByMaterial} />
      ) : (
        <MaterialGruppenListe
          gruppen={aggregiereMaterialbedarf(orders)}
          bezuegeByMaterial={bezuegeByMaterial}
          leerText={
            ansicht === "offen"
              ? "Keine offenen Aufträge mit aufgelösten Materialien."
              : "Keine Aufträge mit aufgelösten Materialien."
          }
        />
      )}
    </div>
  );
}

function MonatsAnsicht({ orders, bezuegeByMaterial }: { orders: OrderRow[]; bezuegeByMaterial: BezuegeMap }) {
  const monate = new Map<string, { label: string; sortKey: string; orders: OrderRow[] }>();
  for (const o of orders) {
    const sortKey = monatSortKey(o.deliver_date);
    const m = monate.get(sortKey) ?? { label: monatLabel(o.deliver_date), sortKey, orders: [] };
    m.orders.push(o);
    monate.set(sortKey, m);
  }
  const sortiert = [...monate.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  if (sortiert.length === 0) {
    return <p className="bd-mute">Keine erledigten Aufträge mit aufgelösten Materialien.</p>;
  }

  return (
    <div>
      {sortiert.map((m) => (
        <details key={m.sortKey} className="bd-acc" style={{ marginBottom: 10 }}>
          <summary style={{ fontWeight: 600 }}>
            {m.label} <span className="bd-mute" style={{ fontWeight: 400 }}>· {m.orders.length} Aufträge</span>
          </summary>
          <div style={{ padding: "8px 0 4px 10px" }}>
            <MaterialGruppenListe
              gruppen={aggregiereMaterialbedarf(m.orders)}
              bezuegeByMaterial={bezuegeByMaterial}
              leerText="Keine aufgelösten Materialien."
            />
          </div>
        </details>
      ))}
    </div>
  );
}

function MaterialGruppenListe({
  gruppen,
  bezuegeByMaterial,
  leerText,
}: {
  gruppen: MaterialGruppe[];
  bezuegeByMaterial: BezuegeMap;
  leerText: string;
}) {
  if (gruppen.length === 0) return <p className="bd-mute">{leerText}</p>;

  return (
    <div>
      <div className="bd-acc-head">
        <span style={{ flex: 1 }}>Material</span>
        <span style={{ width: 160 }}>Gesamtbedarf</span>
      </div>
      {gruppen.map((g) => {
        const bezuege = g.materialId ? bezuegeByMaterial.get(bezugSchluessel(g.materialId, g.druckbogen)) : undefined;
        const bezugGesamt = bezuege?.reduce((sum, b) => sum + b.bestand, 0) ?? 0;
        return (
        <details key={g.schluessel} className="bd-acc" style={{ marginBottom: 6 }}>
          <summary style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ flex: 1 }}>
              {g.label || "—"}
              {g.druckbogen && <span className="bd-count" style={{ marginLeft: 8 }}>{g.druckbogen}</span>}{" "}
              <span className="bd-mute">· {g.beitraege.length} Aufträge</span>
            </span>
            <span style={{ width: 160, fontWeight: 600 }}>
              {g.gesamt.toLocaleString("de-DE")} {g.einheit}
            </span>
          </summary>
          <p className="bd-hint" style={{ margin: "8px 0 0" }}>
            Materialbezug:{" "}
            {bezuege && bezuege.length > 0 ? (
              <>
                <strong>{bezugGesamt.toLocaleString("de-DE")} {bezuege[0].einheit} gesamt</strong>
                {" ("}
                {bezuege
                  .map(
                    (b) =>
                      `${b.lieferant?.name ?? "—"} – ${b.bezeichnung}: ${b.bestand.toLocaleString("de-DE")} ${b.einheit}${b.lagerort ? ` @ ${b.lagerort}` : ""}`,
                  )
                  .join(" · ")}
                {")"}
              </>
            ) : (
              "kein Materialbezug hinterlegt"
            )}
          </p>
          <div className="table-scroll" style={{ marginTop: 6 }}>
            <table className="bd-table">
              <thead>
                <tr>
                  <th>Auftrag</th>
                  <th>Liefertermin</th>
                  <th className="bd-num">Menge</th>
                  <th>Herleitung</th>
                </tr>
              </thead>
              <tbody>
                {g.beitraege.map((b, i) => (
                  <tr key={i}>
                    <td>
                      <Link className="bd-link" href={`/druckauftraege/${b.orderId}`}>
                        {b.externalReference ?? b.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{b.deliverDate ? fmtDate(b.deliverDate) : "—"}</td>
                    <td className="bd-num">
                      {b.menge.toLocaleString("de-DE")} {b.einheit}
                    </td>
                    <td className="bd-mute">{b.herleitung ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        );
      })}
    </div>
  );
}
