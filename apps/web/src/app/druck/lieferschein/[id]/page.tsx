import { notFound } from "next/navigation";
import { loadShipmentPrint, senderLine, recipientBlock } from "../../load";

export const dynamic = "force-dynamic";

export default async function LieferscheinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ship, profile } = await loadShipmentPrint(id);
  if (!ship) notFound();
  const rec = ship.rec;

  return (
    <>
      <div className="sender">
        {ship.neutral_versand
          ? " "
          : senderLine(ship, profile) || profile.name || "werk"}
      </div>

      <div className="row2" style={{ marginTop: 24 }}>
        <div>
          <div className="muted" style={{ fontSize: 11 }}>Empfänger</div>
          <div className="addr">{rec ? recipientBlock(rec) : "—"}</div>
          {rec?.contact_name && <div className="muted">z.Hd. {rec.contact_name}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <h1>Lieferschein</h1>
          <div className="muted">zu Sendung {ship.shipment_number ?? id.slice(0, 8)}</div>
          <div className="muted">Datum: {ship.ship_date ?? new Date().toISOString().slice(0, 10)}</div>
          {ship.organization && <div className="muted">Kunde: {ship.organization.name}</div>}
          {ship.carrier && (
            <div className="muted">
              Versand: {ship.carrier.name}
              {ship.carrier_service ? ` · ${ship.carrier_service}` : ""}
            </div>
          )}
          {ship.frankatur && <div className="muted">Frankatur: {ship.frankatur}</div>}
        </div>
      </div>

      <h2>Positionen</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}>Pos</th>
            <th style={{ width: 90 }}>Menge</th>
            <th>Bezeichnung</th>
          </tr>
        </thead>
        <tbody>
          {(rec?.items ?? []).map((it, i) => (
            <tr key={i}>
              <td>{it.position || i + 1}</td>
              <td>
                {Number(it.quantity)}
                {it.unit ? ` ${it.unit}` : ""}
              </td>
              <td>
                {it.description}
                {it.note ? <div className="muted">{it.note}</div> : null}
              </td>
            </tr>
          ))}
          {!rec?.items?.length && (
            <tr>
              <td colSpan={3} className="muted">Keine Positionen erfasst.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Packstücke</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th style={{ width: 90 }}>Art</th>
            <th style={{ width: 80 }}>Gewicht</th>
            <th style={{ width: 120 }}>Maße (cm)</th>
            <th>Tracking-Nr</th>
          </tr>
        </thead>
        <tbody>
          {(rec?.packages ?? []).map((p, i) => (
            <tr key={i}>
              <td>{p.position || i + 1}</td>
              <td>{p.art}</td>
              <td>{p.weight_kg != null ? `${Number(p.weight_kg)} kg` : "—"}</td>
              <td>
                {[p.length_cm, p.width_cm, p.height_cm].some((x) => x != null)
                  ? [p.length_cm, p.width_cm, p.height_cm].map((x) => x ?? "–").join(" × ")
                  : "—"}
              </td>
              <td>{p.tracking_number ?? "—"}</td>
            </tr>
          ))}
          {!rec?.packages?.length && (
            <tr>
              <td colSpan={5} className="muted">Keine Packstücke.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 6 }}>
        {(rec?.packages ?? []).length} Packstück(e) ·{" "}
        {Math.round(
          (rec?.packages ?? []).reduce((s, p) => s + (Number(p.weight_kg) || 0), 0) * 1000,
        ) / 1000}{" "}
        kg gesamt
      </p>

      {ship.notiz && (
        <>
          <h2>Anmerkung</h2>
          <p>{ship.notiz}</p>
        </>
      )}

      <p className="muted" style={{ marginTop: 40 }}>
        Ware dankend erhalten, Datum / Unterschrift: ______________________________
      </p>
    </>
  );
}
