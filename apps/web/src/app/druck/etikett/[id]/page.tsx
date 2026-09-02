import { notFound } from "next/navigation";
import { loadShipmentPrint, senderBlock, recipientBlock } from "../../load";

export const dynamic = "force-dynamic";

export default async function EtikettPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ship, profile } = await loadShipmentPrint(id);
  if (!ship) notFound();
  const rec = ship.rec;
  const packages = rec?.packages ?? [];
  const count = packages.length || 1;
  const list = packages.length ? packages : [{ position: 1, art: "paket", weight_kg: null, tracking_number: null } as (typeof packages)[number]];

  return (
    <>
      {list.map((p, i) => (
        <div className="label-sheet" key={i}>
          {!ship.neutral_versand && senderBlock(ship, profile) && (
            <div className="sender addr">
              Absender: {senderBlock(ship, profile).split("\n").join(", ")}
            </div>
          )}
          <div style={{ marginTop: 14 }} className="muted">
            Empfänger
          </div>
          <div className="big addr">{rec ? recipientBlock(rec) : "—"}</div>
          {rec?.contact_name && <div>z.Hd. {rec.contact_name}</div>}
          {rec?.phone && <div className="muted">Tel. {rec.phone}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
            <div className="big">
              Paket {p.position || i + 1} von {count}
            </div>
            <div>
              {ship.carrier?.name ?? ""}
              {ship.carrier_service ? ` · ${ship.carrier_service}` : ""}
            </div>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Sendung {ship.shipment_number ?? id.slice(0, 8)}
            {p.weight_kg != null ? ` · ${Number(p.weight_kg)} kg` : ""}
            {p.tracking_number ? ` · Tracking ${p.tracking_number}` : ""}
          </div>
        </div>
      ))}
    </>
  );
}
