import { notFound } from "next/navigation";
import { loadShipmentPrint, senderBlock, recipientBlock } from "../../load";

export const dynamic = "force-dynamic";

export default async function ProformaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ship, profile } = await loadShipmentPrint(id);
  if (!ship) notFound();
  const rec = ship.rec;
  const items = rec?.items ?? [];
  const totalValue = items.reduce(
    (s, it) => s + (Number(it.customs_value) || 0) * (Number(it.quantity) || 1),
    0,
  );
  const isExport = (rec?.country ?? "DE").toUpperCase() !== "DE";

  return (
    <>
      <div className="row2">
        <div>
          <div className="muted" style={{ fontSize: 11 }}>Absender / Exporter</div>
          <div className="addr">{senderBlock(ship, profile) || profile.name || "werk"}</div>
          {profile.vat_id && <div className="muted">USt-IdNr {profile.vat_id}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <h1>Proforma-Rechnung</h1>
          <div className="muted">Sendung {ship.shipment_number ?? id.slice(0, 8)}</div>
          <div className="muted">
            Datum: {ship.ship_date ?? new Date().toISOString().slice(0, 10)}
          </div>
          {ship.frankatur && <div className="muted">Lieferbedingung: {ship.frankatur}</div>}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="muted" style={{ fontSize: 11 }}>Empfänger / Consignee</div>
        <div className="addr">{rec ? recipientBlock(rec) : "—"}</div>
      </div>

      {!isExport && (
        <p className="muted" style={{ marginTop: 12 }}>
          Hinweis: Zielland ist DE — Proforma i. d. R. nicht erforderlich.
        </p>
      )}

      <h2>Warenpositionen</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }}>Pos</th>
            <th>Bezeichnung</th>
            <th style={{ width: 60 }}>Menge</th>
            <th style={{ width: 90 }}>Zolltarif-Nr</th>
            <th style={{ width: 70 }}>Ursprung</th>
            <th style={{ width: 90 }}>Wert/Stück</th>
            <th style={{ width: 90 }}>Wert gesamt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const line = (Number(it.customs_value) || 0) * (Number(it.quantity) || 1);
            return (
              <tr key={i}>
                <td>{it.position || i + 1}</td>
                <td>{it.description}</td>
                <td>
                  {Number(it.quantity)}
                  {it.unit ? ` ${it.unit}` : ""}
                </td>
                <td>{it.customs_tariff_no ?? "—"}</td>
                <td>{it.origin_country ?? "—"}</td>
                <td>{it.customs_value != null ? `${Number(it.customs_value).toFixed(2)} €` : "—"}</td>
                <td>{line ? `${line.toFixed(2)} €` : "—"}</td>
              </tr>
            );
          })}
          {!items.length && (
            <tr>
              <td colSpan={7} className="muted">Keine Positionen erfasst.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p style={{ marginTop: 8, textAlign: "right" }}>
        <strong>Warenwert gesamt: {totalValue.toFixed(2)} €</strong>
      </p>

      <p className="muted" style={{ marginTop: 24 }}>
        Kein Handelswert — nur für Zollzwecke. / No commercial value — for customs purposes only.
      </p>
      <p className="muted" style={{ marginTop: 24 }}>
        Ort, Datum / Unterschrift: ______________________________
      </p>
    </>
  );
}
