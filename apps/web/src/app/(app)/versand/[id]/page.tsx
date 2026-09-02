import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { frachtvergleich } from "@/lib/fracht";
import { STATUS_LABEL } from "../status";
import {
  HeaderForm,
  RecipientPanel,
  SenderPanel,
  OrderPanel,
  WeightPanel,
  SuggestionTable,
  NotifyPanel,
  PackagesPanel,
  ItemsPanel,
  StatusBar,
  Step,
  type Rec,
} from "./ui";

export const dynamic = "force-dynamic";

type ShipmentDetail = {
  id: string;
  shipment_number: string | null;
  status: string;
  carrier_id: string | null;
  carrier_service: string | null;
  ship_date: string | null;
  frankatur: string | null;
  notiz: string | null;
  sales_order_id: string | null;
  sender_mode: string;
  sender_name: string | null;
  sender_addition: string | null;
  sender_street: string | null;
  sender_house_number: string | null;
  sender_address_addition: string | null;
  sender_zip: string | null;
  sender_city: string | null;
  sender_country: string | null;
  neutral_versand: boolean;
  total_weight_kg: number | null;
  weight_mode: "positionen" | "manuell";
  notify_recipient: boolean;
  notify_email: string | null;
  organization: { id: string; name: string } | null;
  carrier: { id: string; name: string; art: string } | null;
  recipient: Rec[] | Rec | null;
};

export default async function SendungPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ordq?: string; ordall?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("shipment")
    .select(
      "id, shipment_number, status, carrier_id, carrier_service, ship_date, frankatur, notiz, sales_order_id, " +
        "sender_mode, sender_name, sender_addition, sender_street, sender_house_number, sender_address_addition, " +
        "sender_zip, sender_city, sender_country, neutral_versand, total_weight_kg, weight_mode, notify_recipient, notify_email, " +
        "organization:organization_id(id, name), carrier:carrier_id(id, name, art), " +
        "recipient:shipment_recipient(id, name, addition, street, house_number, address_addition, zip, city, country, " +
        "contact_name, phone, email, verified, verified_at, verified_by, verify_result, " +
        "packages:shipment_package(id, position, art, packmittel_id, packaging_ref, weight_kg, length_cm, width_cm, height_cm, tracking_number), " +
        "items:shipment_item(id, position, description, quantity, unit, weight_kg, versand_artikel_id, note, customs_value, customs_tariff_no, origin_country))",
    )
    .eq("id", id)
    .maybeSingle();

  const ship = data as unknown as ShipmentDetail | null;
  if (!ship) notFound();

  const [{ data: carriers }, { data: artikel }, { data: packmittel }] = await Promise.all([
    supabase.from("carrier").select("id, code, name, art").eq("is_active", true).order("name"),
    supabase
      .from("versand_artikel")
      .select("id, bezeichnung, einheit, gewicht_kg")
      .eq("is_active", true)
      .order("bezeichnung"),
    supabase
      .from("packmittel")
      .select("id, bezeichnung, laenge_mm, breite_mm, hoehe_mm, leergewicht_kg")
      .eq("is_active", true)
      .order("bezeichnung"),
  ]);
  const carrierList = (carriers ?? []) as { id: string; code: string; name: string; art: string }[];
  const artikelList = (artikel ?? []) as {
    id: string;
    bezeichnung: string;
    einheit: string;
    gewicht_kg: number;
  }[];
  const packmittelList = (packmittel ?? []) as {
    id: string;
    bezeichnung: string;
    laenge_mm: number | null;
    breite_mm: number | null;
    hoehe_mm: number | null;
    leergewicht_kg: number;
  }[];

  const org = ship.organization;
  const carrier = ship.carrier;
  const rec = (Array.isArray(ship.recipient) ? ship.recipient[0] : ship.recipient) ?? undefined;

  // Auftragsverknüpfung
  let linkedOrder:
    | { id: string; source: string; order_number: string | null; order_date: string | null; itemCount: number }
    | null = null;
  if (ship.sales_order_id) {
    const { data: lo } = await supabase
      .from("sales_order")
      .select("id, source, order_number, order_date, items:sales_order_item(count)")
      .eq("id", ship.sales_order_id)
      .maybeSingle();
    if (lo) {
      const c = Array.isArray(lo.items) ? (lo.items[0] as { count: number } | undefined)?.count ?? 0 : 0;
      linkedOrder = {
        id: lo.id,
        source: lo.source,
        order_number: lo.order_number,
        order_date: lo.order_date,
        itemCount: c,
      };
    }
  }
  const ordq = (sp.ordq ?? "").trim();
  const ordAll = sp.ordall === "1";
  let orderResults: { id: string; source: string; order_number: string | null; order_date: string | null }[] = [];
  if (ordq) {
    const like = `%${ordq.replace(/[%,]/g, "")}%`;
    let oq = supabase
      .from("sales_order")
      .select("id, source, order_number, order_date")
      .ilike("order_number", like)
      .order("order_date", { ascending: false })
      .limit(20);
    if (!ordAll && org?.id) oq = oq.eq("organization_id", org.id);
    const { data: od } = await oq;
    orderResults = od ?? [];
  }

  const packages = (rec?.packages ?? []).slice().sort((a, b) => a.position - b.position);
  const items = (rec?.items ?? []).slice().sort((a, b) => a.position - b.position);
  const itemWeightSum = items.reduce((s, it) => s + (Number(it.weight_kg) || 0), 0);
  const effWeight =
    ship.weight_mode === "manuell"
      ? Number(ship.total_weight_kg) || 0
      : Math.round(itemWeightSum * 1000) / 1000;
  const packWeight = packages.reduce((s, p) => s + (Number(p.weight_kg) || 0), 0);

  // Schritt 4: Frachtpreis-Vorschlag
  let suggestion: Awaited<ReturnType<typeof frachtvergleich>> | null = null;
  if (rec?.zip && effWeight > 0) {
    suggestion = await frachtvergleich({
      plz: rec.zip,
      land: rec.country ?? "DE",
      packages: [{ weight: effWeight }],
    });
  }

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>
          Sendung {ship.shipment_number ?? id.slice(0, 8)}{" "}
          <span className="tag">{STATUS_LABEL[ship.status] ?? ship.status}</span>
        </h1>
        <Link href="/versand" className="ghost" style={{ padding: "7px 12px" }}>
          ← Liste
        </Link>
      </div>
      <p className="lead">
        Kunde: {org ? <Link href={`/organisationen/${org.id}`}>{org.name}</Link> : "—"}
        {" · "}
        {carrier ? `${carrier.name} (${carrier.art})` : "Frachtweg offen"}
        {ship.carrier_service ? ` · ${ship.carrier_service}` : ""}
      </p>

      <StatusBar id={ship.id} status={ship.status} />

      <Step n={1} title="Empfänger">
        {rec ? (
          <RecipientPanel shipmentId={ship.id} organizationId={org?.id ?? ""} rec={rec} />
        ) : (
          <div className="banner-err">Kein Empfänger — Datensatz unvollständig.</div>
        )}
      </Step>

      <Step n={2} title="Absender">
        <SenderPanel
          id={ship.id}
          senderMode={ship.sender_mode}
          neutral={ship.neutral_versand}
          sender={{
            name: ship.sender_name,
            addition: ship.sender_addition,
            street: ship.sender_street,
            house_number: ship.sender_house_number,
            address_addition: ship.sender_address_addition,
            zip: ship.sender_zip,
            city: ship.sender_city,
            country: ship.sender_country,
          }}
        />
      </Step>

      <Step n={3} title="Inhalt & Gewicht">
        {rec && (
          <OrderPanel
            shipmentId={ship.id}
            recipientId={rec.id}
            linked={linkedOrder}
            query={ordq}
            all={ordAll}
            results={orderResults}
          />
        )}
        {rec && (
          <ItemsPanel
            shipmentId={ship.id}
            recipientId={rec.id}
            items={items}
            artikel={artikelList}
          />
        )}
        <WeightPanel
          id={ship.id}
          mode={ship.weight_mode}
          manualWeight={ship.total_weight_kg}
          itemWeightSum={Math.round(itemWeightSum * 1000) / 1000}
          effWeight={effWeight}
        />
      </Step>

      <Step n={4} title="Frachtpreis-Vorschlag">
        {!rec?.zip ? (
          <p className="lead">PLZ des Empfängers fehlt (Schritt 1).</p>
        ) : effWeight <= 0 ? (
          <p className="lead">Gesamtgewicht fehlt (Schritt 3).</p>
        ) : suggestion ? (
          <SuggestionTable
            id={ship.id}
            plz={rec.zip}
            land={rec.country ?? "DE"}
            weight={effWeight}
            options={suggestion.options}
            carriers={carrierList}
          />
        ) : null}
      </Step>

      <Step n={5} title="Frachtweg / Versender">
        <HeaderForm
          id={ship.id}
          carrierId={ship.carrier_id}
          carrierService={ship.carrier_service}
          shipDate={ship.ship_date}
          frankatur={ship.frankatur}
          notiz={ship.notiz}
          carriers={carrierList}
        />
      </Step>

      <Step
        n={6}
        title="Packstücke"
        badge={`${packages.length} Stk · ${packWeight ? `${Math.round(packWeight * 1000) / 1000} kg` : "0 kg"}`}
      >
        {rec && (
          <PackagesPanel
            shipmentId={ship.id}
            recipientId={rec.id}
            carrierArt={carrier?.art ?? "paket"}
            packages={packages}
            packmittel={packmittelList}
            hasOrder={!!linkedOrder}
            hasItems={items.length > 0}
          />
        )}
        <p className="lead" style={{ marginTop: 6 }}>
          Tracking-Nr je Packstück eintragen (später aus der Carrier-API).
        </p>
      </Step>

      <Step n={7} title="Druck">
        <div className="toolbar">
          <a className="ghost" href={`/druck/etikett/${ship.id}`} target="_blank" rel="noreferrer" style={{ padding: "7px 12px" }}>
            Frachtlabels
          </a>
          <a className="ghost" href={`/druck/lieferschein/${ship.id}`} target="_blank" rel="noreferrer" style={{ padding: "7px 12px" }}>
            Lieferschein
          </a>
          <a className="ghost" href={`/druck/proforma/${ship.id}`} target="_blank" rel="noreferrer" style={{ padding: "7px 12px" }}>
            Proforma-Rechnung
          </a>
          <span className="count">Druckansicht — im Browser „Als PDF sichern“.</span>
        </div>
      </Step>

      <Step n={8} title="Benachrichtigung">
        <NotifyPanel
          id={ship.id}
          notify={ship.notify_recipient}
          email={ship.notify_email ?? rec?.email ?? ""}
        />
      </Step>
    </>
  );
}
