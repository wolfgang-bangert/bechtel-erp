import { createClient } from "@/lib/supabase/server";

export type CompanyProfile = {
  name?: string;
  legal_name?: string;
  address?: { line1?: string; zip?: string; city?: string; country?: string };
  vat_id?: string;
  tax_number?: string;
  bank?: { iban?: string; bic?: string; name?: string };
};

type Pkg = {
  position: number;
  art: string;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  tracking_number: string | null;
};
type ItemP = {
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  weight_kg: number | null;
  note: string | null;
  customs_value: number | null;
  customs_tariff_no: string | null;
  origin_country: string | null;
};
export type RecP = {
  name: string;
  addition: string | null;
  street: string | null;
  house_number: string | null;
  address_addition: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  packages: Pkg[];
  items: ItemP[];
};

export type ShipmentPrint = {
  id: string;
  shipment_number: string | null;
  status: string;
  ship_date: string | null;
  carrier_service: string | null;
  frankatur: string | null;
  notiz: string | null;
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
  carrier: { name: string; art: string } | null;
  organization: { name: string } | null;
  rec: RecP | null;
};

const SHIP_COLS =
  "id, shipment_number, status, ship_date, carrier_service, frankatur, notiz, " +
  "sender_mode, sender_name, sender_addition, sender_street, sender_house_number, sender_address_addition, " +
  "sender_zip, sender_city, sender_country, neutral_versand, total_weight_kg, " +
  "carrier:carrier_id(name, art), organization:organization_id(name), " +
  "recipient:shipment_recipient(name, addition, street, house_number, address_addition, zip, city, country, " +
  "contact_name, phone, email, " +
  "packages:shipment_package(position, art, weight_kg, length_cm, width_cm, height_cm, tracking_number), " +
  "items:shipment_item(position, description, quantity, unit, weight_kg, note, customs_value, customs_tariff_no, origin_country))";

export async function loadShipmentPrint(
  id: string,
): Promise<{ ship: ShipmentPrint | null; profile: CompanyProfile }> {
  const supabase = await createClient();
  const [{ data }, { data: setting }] = await Promise.all([
    supabase.from("shipment").select(SHIP_COLS).eq("id", id).maybeSingle(),
    supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle(),
  ]);

  const profile = (setting?.value ?? {}) as CompanyProfile;
  if (!data) return { ship: null, profile };

  const row = data as unknown as Omit<ShipmentPrint, "rec"> & {
    recipient: RecP[] | RecP | null;
  };

  const recRaw = Array.isArray(row.recipient) ? row.recipient[0] : row.recipient;
  const rec: RecP | null = recRaw
    ? {
        ...recRaw,
        packages: (recRaw.packages ?? []).slice().sort((a, b) => a.position - b.position),
        items: (recRaw.items ?? []).slice().sort((a, b) => a.position - b.position),
      }
    : null;

  const { recipient: _omit, ...rest } = row;
  void _omit;
  return { ship: { ...rest, rec }, profile };
}

/** Absenderblock: leer bei neutralem Versand; sonst Snapshot bzw. Firmenprofil. */
export function senderBlock(ship: ShipmentPrint, profile: CompanyProfile): string {
  if (ship.neutral_versand) return "";
  if (ship.sender_mode !== "bechtel" && ship.sender_name) {
    return [
      ship.sender_name,
      ship.sender_addition,
      [ship.sender_street, ship.sender_house_number].filter(Boolean).join(" "),
      ship.sender_address_addition,
      [ship.sender_zip, ship.sender_city].filter(Boolean).join(" "),
      ship.sender_country && ship.sender_country !== "DE" ? ship.sender_country : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const a = profile.address ?? {};
  return [profile.name, a.line1, [a.zip, a.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join("\n");
}

/** Einzeiler-Variante (für Kopfzeilen). */
export function senderLine(ship: ShipmentPrint, profile: CompanyProfile): string {
  return senderBlock(ship, profile).split("\n").filter(Boolean).join(" · ");
}

export function recipientBlock(rec: RecP): string {
  return [
    rec.name,
    rec.addition,
    [rec.street, rec.house_number].filter(Boolean).join(" "),
    rec.address_addition,
    [rec.zip, rec.city].filter(Boolean).join(" "),
    rec.country && rec.country !== "DE" ? rec.country : null,
  ]
    .filter(Boolean)
    .join("\n");
}
