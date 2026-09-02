"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";

export type State = { ok?: boolean; error?: string; note?: string };

const s = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : null;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- Sendung anlegen
export async function createShipment(_prev: State, fd: FormData): Promise<State> {
  const supabase = await createClient();

  const organization_id = s(fd, "organization_id");
  if (!organization_id) return { error: "Kunde fehlt" };

  const useManual = fd.get("addr_mode") === "manual";
  const sourceAddressId = s(fd, "source_address_id");

  let snap: {
    name: string;
    addition: string | null;
    street: string | null;
    house_number: string | null;
    address_addition: string | null;
    zip: string | null;
    city: string | null;
    country: string;
    source_address_id: string | null;
  };

  const name = s(fd, "recipient_name");
  if (!name) return { error: "Empfängername fehlt" };

  if (useManual || !sourceAddressId) {
    snap = {
      name,
      addition: s(fd, "addition"),
      street: s(fd, "street"),
      house_number: s(fd, "house_number"),
      address_addition: s(fd, "address_addition"),
      zip: s(fd, "zip"),
      city: s(fd, "city"),
      country: s(fd, "country") ?? "DE",
      source_address_id: null,
    };
  } else {
    const { data: a } = await supabase
      .from("address")
      .select("id, line1, line2, street, house_number, address_addition, zip, city, country")
      .eq("id", sourceAddressId)
      .maybeSingle();
    if (!a) return { error: "Adresse nicht gefunden" };
    snap = {
      name,
      addition: s(fd, "addition"),
      street: a.street ?? a.line1 ?? null,
      house_number: a.house_number ?? null,
      address_addition: a.address_addition ?? a.line2 ?? null,
      zip: a.zip,
      city: a.city,
      country: a.country ?? "DE",
      source_address_id: a.id,
    };
  }

  const { data: numRow, error: numErr } = await supabase.rpc("next_number", {
    p_key: "shipment",
  });
  if (numErr) return { error: `Nummernkreis: ${numErr.message}` };

  const senderMode = s(fd, "sender_mode") ?? "bechtel";
  const senderSnap =
    senderMode === "bechtel"
      ? {}
      : {
          sender_name: s(fd, "sender_name"),
          sender_addition: s(fd, "sender_addition"),
          sender_street: s(fd, "sender_street"),
          sender_house_number: s(fd, "sender_house_number"),
          sender_address_addition: s(fd, "sender_address_addition"),
          sender_zip: s(fd, "sender_zip"),
          sender_city: s(fd, "sender_city"),
          sender_country: s(fd, "sender_country") ?? "DE",
        };

  const { data: ship, error: shipErr } = await supabase
    .from("shipment")
    .insert({
      shipment_number: numRow as string,
      organization_id,
      contact_id: s(fd, "contact_id"),
      carrier_id: s(fd, "carrier_id"),
      carrier_service: s(fd, "carrier_service"),
      sales_order_id: s(fd, "sales_order_id"),
      ship_date: s(fd, "ship_date"),
      frankatur: s(fd, "frankatur"),
      notiz: s(fd, "notiz"),
      sender_mode: senderMode,
      neutral_versand: fd.get("neutral_versand") != null,
      ...senderSnap,
    })
    .select("id")
    .single();
  if (shipErr) return { error: shipErr.message };

  const { error: recErr } = await supabase.from("shipment_recipient").insert({
    shipment_id: ship.id,
    position: 1,
    ...snap,
    contact_name: s(fd, "contact_name"),
    phone: s(fd, "phone"),
    email: s(fd, "email"),
  });
  if (recErr) return { error: recErr.message };

  revalidatePath("/versand");
  redirect(`/versand/${ship.id}`);
}

// ---------------------------------------------------------------- Kunde/Adresse/Kontakt aus der Erfassung anlegen
export async function createCustomer(_prev: State, fd: FormData): Promise<State> {
  const name = s(fd, "name");
  if (!name) return { error: "Firmenname fehlt" };
  const supabase = await createClient();
  const zip = s(fd, "zip");

  if (!fd.get("force")) {
    const like = `%${name.replace(/[%,]/g, "")}%`;
    const { data: sim } = await supabase
      .from("organization")
      .select("id, name, addresses:address(zip)")
      .ilike("name", like)
      .limit(5);
    const hits = (sim ?? []).filter((o) => {
      if (!zip) return true;
      const addrs = (o.addresses ?? []) as { zip: string | null }[];
      return addrs.length === 0 || addrs.some((a) => a.zip === zip);
    });
    if (hits.length)
      return {
        error: `Ähnliche Kunden: ${hits.map((h) => h.name).join(" · ")}. Zum Anlegen „Trotzdem anlegen".`,
        note: "dupe",
      };
  }

  // Nummernkreis kann durch Altimport hinter dem Ist-Stand liegen → wenige Retries.
  let org: { id: string } | null = null;
  let orgErr: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 20 && !org; attempt++) {
    const { data: numRow, error: numErr } = await supabase.rpc("next_number", {
      p_key: "customer_number",
    });
    if (numErr) return { error: `Nummernkreis: ${numErr.message}` };
    const res = await supabase
      .from("organization")
      .insert({
        relation: "customer",
        name,
        customer_number: numRow as string,
        email: s(fd, "contact_email"),
        phone: s(fd, "contact_phone"),
      })
      .select("id")
      .single();
    org = res.data;
    orgErr = res.error;
    if (orgErr && orgErr.code !== "23505") break;
  }
  if (!org) return { error: orgErr?.message ?? "Kunde konnte nicht angelegt werden" };

  const street = s(fd, "street");
  if (street || zip || s(fd, "city")) {
    const { error: aErr } = await supabase.from("address").insert({
      organization_id: org.id,
      source: "werk",
      kind: s(fd, "addr_kind") ?? "shipping",
      is_default: true,
      line1: [street, s(fd, "house_number")].filter(Boolean).join(" ") || name,
      street,
      house_number: s(fd, "house_number"),
      address_addition: s(fd, "address_addition"),
      zip,
      city: s(fd, "city"),
      country: s(fd, "country") ?? "DE",
    });
    if (aErr) return { error: `Kunde angelegt, Adresse fehlgeschlagen: ${aErr.message}` };
  }

  const ln = s(fd, "contact_last");
  if (ln) {
    await supabase.from("contact").insert({
      organization_id: org.id,
      first_name: s(fd, "contact_first") ?? "",
      last_name: ln,
      email: s(fd, "contact_email"),
      phone: s(fd, "contact_phone"),
      is_primary: true,
    });
  }

  revalidatePath("/versand/neu");
  redirect(`/versand/neu?org=${org.id}`);
}

export async function addAddress(_prev: State, fd: FormData): Promise<State> {
  const shipmentId = s(fd, "shipment_id");
  const recipientId = s(fd, "recipient_id");
  const organizationId = s(fd, "organization_id");
  if (!shipmentId || !recipientId || !organizationId) return { error: "id fehlt" };
  const street = s(fd, "street");
  const country = s(fd, "country") ?? "DE";
  const supabase = await createClient();
  const { data: addr, error } = await supabase
    .from("address")
    .insert({
      organization_id: organizationId,
      source: "werk",
      kind: s(fd, "addr_kind") ?? "shipping",
      is_default: false,
      line1: [street, s(fd, "house_number")].filter(Boolean).join(" ") || "-",
      street,
      house_number: s(fd, "house_number"),
      address_addition: s(fd, "address_addition"),
      zip: s(fd, "zip"),
      city: s(fd, "city"),
      country,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase
    .from("shipment_recipient")
    .update({
      street,
      house_number: s(fd, "house_number"),
      address_addition: s(fd, "address_addition"),
      zip: s(fd, "zip"),
      city: s(fd, "city"),
      country,
      source_address_id: addr.id,
      verified: false,
      verified_at: null,
      verified_by: null,
    })
    .eq("id", recipientId);
  revalidatePath(`/versand/${shipmentId}`);
  return { ok: true, note: "Adresse angelegt & übernommen" };
}

export async function addContact(_prev: State, fd: FormData): Promise<State> {
  const shipmentId = s(fd, "shipment_id");
  const recipientId = s(fd, "recipient_id");
  const organizationId = s(fd, "organization_id");
  if (!shipmentId || !recipientId || !organizationId) return { error: "id fehlt" };
  const ln = s(fd, "last_name");
  if (!ln) return { error: "Nachname fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("contact").insert({
    organization_id: organizationId,
    first_name: s(fd, "first_name") ?? "",
    last_name: ln,
    email: s(fd, "email"),
    phone: s(fd, "phone"),
    is_primary: false,
  });
  if (error) return { error: error.message };

  const patch: Record<string, unknown> = {
    contact_name: [s(fd, "first_name"), ln].filter(Boolean).join(" "),
  };
  const ph = s(fd, "phone");
  const em = s(fd, "email");
  if (ph) patch.phone = ph;
  if (em) patch.email = em;
  await supabase.from("shipment_recipient").update(patch).eq("id", recipientId);
  revalidatePath(`/versand/${shipmentId}`);
  return { ok: true, note: "Ansprechpartner angelegt & übernommen" };
}

// ---------------------------------------------------------------- Kopf/Empfänger ändern
export async function updateShipment(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipment")
    .update({
      carrier_id: s(fd, "carrier_id"),
      carrier_service: s(fd, "carrier_service"),
      ship_date: s(fd, "ship_date"),
      frankatur: s(fd, "frankatur"),
      notiz: s(fd, "notiz"),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${id}`);
  return { ok: true };
}

export async function updateRecipient(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "recipient_id");
  const shipmentId = s(fd, "shipment_id");
  if (!id || !shipmentId) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipment_recipient")
    .update({
      name: s(fd, "recipient_name"),
      addition: s(fd, "addition"),
      street: s(fd, "street"),
      house_number: s(fd, "house_number"),
      address_addition: s(fd, "address_addition"),
      zip: s(fd, "zip"),
      city: s(fd, "city"),
      country: s(fd, "country") ?? "DE",
      contact_name: s(fd, "contact_name"),
      phone: s(fd, "phone"),
      email: s(fd, "email"),
      // Adressänderung entwertet die Prüfung
      verified: false,
      verified_at: null,
      verified_by: null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${shipmentId}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Absender (Schritt 2)
export async function updateSender(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const mode = s(fd, "sender_mode") ?? "bechtel";
  const supabase = await createClient();
  const payload =
    mode === "bechtel"
      ? {
          sender_mode: mode,
          neutral_versand: fd.get("neutral_versand") != null,
          sender_name: null,
          sender_addition: null,
          sender_street: null,
          sender_house_number: null,
          sender_address_addition: null,
          sender_zip: null,
          sender_city: null,
          sender_country: null,
        }
      : {
          sender_mode: mode,
          neutral_versand: fd.get("neutral_versand") != null,
          sender_name: s(fd, "sender_name"),
          sender_addition: s(fd, "sender_addition"),
          sender_street: s(fd, "sender_street"),
          sender_house_number: s(fd, "sender_house_number"),
          sender_address_addition: s(fd, "sender_address_addition"),
          sender_zip: s(fd, "sender_zip"),
          sender_city: s(fd, "sender_city"),
          sender_country: s(fd, "sender_country") ?? "DE",
        };
  const { error } = await supabase.from("shipment").update(payload).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Gewicht (Schritt 3)
async function recomputeWeight(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shipmentId: string,
) {
  const { data: ship } = await supabase
    .from("shipment")
    .select("weight_mode, recipient:shipment_recipient(id)")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!ship || ship.weight_mode !== "positionen") return;
  const rec = Array.isArray(ship.recipient) ? ship.recipient[0] : ship.recipient;
  if (!rec) return;
  const { data: items } = await supabase
    .from("shipment_item")
    .select("weight_kg")
    .eq("shipment_recipient_id", (rec as { id: string }).id);
  const sum = (items ?? []).reduce((a, r) => a + (Number(r.weight_kg) || 0), 0);
  await supabase
    .from("shipment")
    .update({ total_weight_kg: sum > 0 ? r3(sum) : null })
    .eq("id", shipmentId);
}

export async function updateWeight(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const mode = s(fd, "weight_mode") === "manuell" ? "manuell" : "positionen";
  const supabase = await createClient();
  if (mode === "manuell") {
    const w = num(fd, "total_weight");
    if (!w || w <= 0) return { error: "Gewicht (kg) angeben" };
    const { error } = await supabase
      .from("shipment")
      .update({ weight_mode: "manuell", total_weight_kg: r3(w) })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("shipment")
      .update({ weight_mode: "positionen" })
      .eq("id", id);
    if (error) return { error: error.message };
    await recomputeWeight(supabase, id);
  }
  revalidatePath(`/versand/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Carriervorschlag übernehmen (Schritt 5)
export async function applySuggestion(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const carrier_id = s(fd, "carrier_id");
  if (!id || !carrier_id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipment")
    .update({ carrier_id, carrier_service: s(fd, "carrier_service") })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${id}`);
  return { ok: true, note: "übernommen" };
}

// ---------------------------------------------------------------- Benachrichtigung (Schritt 8)
export async function updateNotify(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipment")
    .update({
      notify_recipient: fd.get("notify_recipient") != null,
      notify_email: s(fd, "notify_email"),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Adresse prüfen
function checkAddress(a: {
  name: string | null;
  street: string | null;
  house_number: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
}): string[] {
  const issues: string[] = [];
  if (!a.name) issues.push("Name fehlt");
  if (!a.street) issues.push("Straße fehlt");
  if (!a.house_number) issues.push("Hausnummer fehlt");
  if (!a.city) issues.push("Ort fehlt");
  const c = (a.country ?? "DE").toUpperCase();
  if (!a.zip) {
    issues.push("PLZ fehlt");
  } else {
    const digits = a.zip.replace(/\D/g, "");
    const expect = c === "DE" ? 5 : c === "AT" || c === "CH" ? 4 : null;
    if (expect && digits.length !== expect)
      issues.push(`PLZ sollte ${expect}-stellig sein (${c})`);
  }
  return issues;
}

export async function verifyAddress(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "recipient_id");
  const shipmentId = s(fd, "shipment_id");
  if (!id || !shipmentId) return { error: "id fehlt" };
  const force = fd.get("force") != null;
  const reset = fd.get("reset") != null;
  const { user } = await requireStaff();
  const supabase = await createClient();

  if (reset) {
    const { error } = await supabase
      .from("shipment_recipient")
      .update({ verified: false, verified_at: null, verified_by: null, verify_result: null })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(`/versand/${shipmentId}`);
    return { ok: true, note: "Prüfung zurückgesetzt" };
  }

  const { data: rec } = await supabase
    .from("shipment_recipient")
    .select("name, street, house_number, zip, city, country")
    .eq("id", id)
    .maybeSingle();
  if (!rec) return { error: "Empfänger nicht gefunden" };

  const issues = checkAddress(rec);
  const ok = issues.length === 0 || force;
  const { error } = await supabase
    .from("shipment_recipient")
    .update({
      verified: ok,
      verified_at: ok ? new Date().toISOString() : null,
      verified_by: ok ? user.email ?? "?" : null,
      verify_result: {
        checked_at: new Date().toISOString(),
        method: force ? "manuell bestätigt" : "plausibilität",
        issues,
      },
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${shipmentId}`);
  return ok
    ? { ok: true, note: force ? "Als geprüft markiert" : "Adresse plausibel" }
    : { error: `Nicht plausibel: ${issues.join(", ")}` };
}

// ---------------------------------------------------------------- Packstücke
export async function generatePackages(_prev: State, fd: FormData): Promise<State> {
  const recipientId = s(fd, "recipient_id");
  const shipmentId = s(fd, "shipment_id");
  if (!recipientId || !shipmentId) return { error: "id fehlt" };
  const art = s(fd, "art") ?? "paket";
  const maxKg = num(fd, "max_kg");
  const countIn = num(fd, "count");
  const supabase = await createClient();

  let total = num(fd, "total_weight");
  if (!total || total <= 0) {
    // Rückfall: effektives Gesamtgewicht der Sendung (Schritt 3)
    const { data: ship } = await supabase
      .from("shipment")
      .select("total_weight_kg")
      .eq("id", shipmentId)
      .maybeSingle();
    total = ship?.total_weight_kg != null ? Number(ship.total_weight_kg) : null;
  }
  if (!total || total <= 0) return { error: "Gesamtgewicht fehlt (Schritt 3 oder hier eintragen)" };

  let n = 1;
  if (countIn && countIn >= 1) n = Math.floor(countIn);
  else if (maxKg && maxKg > 0) n = Math.max(1, Math.ceil(total / maxKg));
  if (n > 200) return { error: "Mehr als 200 Packstücke — bitte Werte prüfen" };

  const each = r3(total / n);
  const rows = Array.from({ length: n }, (_, i) => ({
    shipment_recipient_id: recipientId,
    position: i + 1,
    art,
    weight_kg: i === n - 1 ? r3(total - each * (n - 1)) : each,
  }));

  await supabase.from("shipment_package").delete().eq("shipment_recipient_id", recipientId);
  const { error } = await supabase.from("shipment_package").insert(rows);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${shipmentId}`);
  return { ok: true, note: `${n} Packstück(e) angelegt` };
}

export async function savePackage(_prev: State, fd: FormData): Promise<State> {
  const shipmentId = s(fd, "shipment_id");
  const recipientId = s(fd, "recipient_id");
  if (!shipmentId || !recipientId) return { error: "id fehlt" };
  const id = s(fd, "id");
  const payload = {
    shipment_recipient_id: recipientId,
    position: num(fd, "position") ?? 1,
    art: s(fd, "art") ?? "paket",
    packaging_ref: s(fd, "packaging_ref"),
    weight_kg: num(fd, "weight_kg"),
    length_cm: num(fd, "length_cm"),
    width_cm: num(fd, "width_cm"),
    height_cm: num(fd, "height_cm"),
    tracking_number: s(fd, "tracking_number"),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("shipment_package").update(payload).eq("id", id)
    : await supabase.from("shipment_package").insert(payload);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${shipmentId}`);
  return { ok: true };
}

export async function deletePackage(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const shipmentId = s(fd, "shipment_id");
  if (!id || !shipmentId) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("shipment_package").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/versand/${shipmentId}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Positionen
export async function saveItem(_prev: State, fd: FormData): Promise<State> {
  const shipmentId = s(fd, "shipment_id");
  const recipientId = s(fd, "recipient_id");
  if (!shipmentId || !recipientId) return { error: "id fehlt" };
  const id = s(fd, "id");
  const description = s(fd, "description");
  if (!description) return { error: "Bezeichnung fehlt" };
  const payload = {
    shipment_recipient_id: recipientId,
    position: num(fd, "position") ?? 1,
    description,
    quantity: num(fd, "quantity") ?? 1,
    unit: s(fd, "unit"),
    weight_kg: num(fd, "weight_kg"),
    note: s(fd, "note"),
    customs_value: num(fd, "customs_value"),
    customs_tariff_no: s(fd, "customs_tariff_no"),
    origin_country: s(fd, "origin_country"),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("shipment_item").update(payload).eq("id", id)
    : await supabase.from("shipment_item").insert(payload);
  if (error) return { error: error.message };
  await recomputeWeight(supabase, shipmentId);
  revalidatePath(`/versand/${shipmentId}`);
  return { ok: true };
}

export async function deleteItem(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const shipmentId = s(fd, "shipment_id");
  if (!id || !shipmentId) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("shipment_item").delete().eq("id", id);
  if (error) return { error: error.message };
  await recomputeWeight(supabase, shipmentId);
  revalidatePath(`/versand/${shipmentId}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Status / löschen
const STATUS = ["erfasst", "gepackt", "etikettiert", "uebergeben", "zugestellt", "storniert"];

export async function setStatus(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const status = s(fd, "status");
  if (!id || !status || !STATUS.includes(status)) return { error: "ungültiger Status" };
  const supabase = await createClient();
  const { error } = await supabase.from("shipment").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/versand");
  revalidatePath(`/versand/${id}`);
  return { ok: true };
}

export async function deleteShipment(_prev: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("shipment").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/versand");
  redirect("/versand");
}
