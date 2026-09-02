"use client";

import { useActionState, useState, type ReactNode } from "react";
import {
  updateShipment,
  updateRecipient,
  addAddress,
  addContact,
  updateSender,
  updateWeight,
  applySuggestion,
  updateNotify,
  verifyAddress,
  generatePackages,
  savePackage,
  deletePackage,
  saveItem,
  deleteItem,
  setStatus,
  deleteShipment,
  type State,
} from "../actions";
import type { FreightOption } from "@/lib/fracht";

const empty: State = {};
const PACK_ART = ["paket", "paeckchen", "karton", "palette"];

export type Pkg = {
  id: string;
  position: number;
  art: string;
  packaging_ref: string | null;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  tracking_number: string | null;
};

export type Item = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  weight_kg: number | null;
  versand_artikel_id: string | null;
  note: string | null;
  customs_value: number | null;
  customs_tariff_no: string | null;
  origin_country: string | null;
};

export type Artikel = { id: string; bezeichnung: string; einheit: string; gewicht_kg: number };

export type Rec = {
  id: string;
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
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  verify_result: { issues?: string[]; method?: string; checked_at?: string } | null;
  packages: Pkg[];
  items: Item[];
};
const STATUS = ["erfasst", "gepackt", "etikettiert", "uebergeben", "zugestellt", "storniert"];
const STATUS_LABEL: Record<string, string> = {
  erfasst: "erfasst",
  gepackt: "gepackt",
  etikettiert: "etikettiert",
  uebergeben: "übergeben",
  zugestellt: "zugestellt",
  storniert: "storniert",
};

function Msg({ state }: { state: State }) {
  return (
    <>
      {state.ok && <span className="msg-ok">✓ {state.note ?? ""}</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </>
  );
}

export function Step({
  n,
  title,
  badge,
  children,
}: {
  n: number;
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2>
        <span
          style={{
            display: "inline-flex",
            width: 22,
            height: 22,
            borderRadius: 11,
            background: "var(--accent)",
            color: "var(--accent-text)",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            marginRight: 8,
          }}
        >
          {n}
        </span>
        {title} {badge && <span className="tag">{badge}</span>}
      </h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Absender (Schritt 2)
export function SenderPanel({
  id,
  senderMode,
  neutral,
  sender,
}: {
  id: string;
  senderMode: string;
  neutral: boolean;
  sender: {
    name: string | null;
    addition: string | null;
    street: string | null;
    house_number: string | null;
    address_addition: string | null;
    zip: string | null;
    city: string | null;
    country: string | null;
  };
}) {
  const [state, action, pending] = useActionState(updateSender, empty);
  const [mode, setMode] = useState(senderMode || "bechtel");

  return (
    <form action={action} className="rows" style={{ maxWidth: 620 }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sender_mode" value={mode} />
      <div className="field">
        {[
          ["bechtel", "Bechtel Druck (Firmenprofil)"],
          ["kunde", "Absender des Kunden"],
          ["frei", "Freier Absender"],
        ].map(([v, label]) => (
          <label key={v} className="chk" style={{ display: "flex", gap: 8 }}>
            <input type="radio" checked={mode === v} onChange={() => setMode(v)} />
            <span style={{ color: "var(--text)" }}>{label}</span>
          </label>
        ))}
        <label className="chk" style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <input type="checkbox" name="neutral_versand" defaultChecked={neutral} />
          <span style={{ color: "var(--text)" }}>Neutraler Versand (kein Absender aufs Etikett)</span>
        </label>
      </div>

      {mode !== "bechtel" && (
        <>
          <div className="row" style={{ border: "none", padding: 0 }}>
            <label className="field" style={{ flex: 3 }}>
              <span>Absender-Name</span>
              <input name="sender_name" defaultValue={sender.name ?? ""} />
            </label>
            <label className="field" style={{ flex: 2 }}>
              <span>Zusatz</span>
              <input name="sender_addition" defaultValue={sender.addition ?? ""} />
            </label>
          </div>
          <div className="row" style={{ border: "none", padding: 0 }}>
            <label className="field" style={{ flex: 3 }}>
              <span>Straße</span>
              <input name="sender_street" defaultValue={sender.street ?? ""} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Hausnr.</span>
              <input name="sender_house_number" defaultValue={sender.house_number ?? ""} />
            </label>
          </div>
          <label className="field">
            <span>Adresszusatz</span>
            <input name="sender_address_addition" defaultValue={sender.address_addition ?? ""} />
          </label>
          <div className="row" style={{ border: "none", padding: 0 }}>
            <label className="field" style={{ flex: 1 }}>
              <span>PLZ</span>
              <input name="sender_zip" defaultValue={sender.zip ?? ""} />
            </label>
            <label className="field" style={{ flex: 3 }}>
              <span>Ort</span>
              <input name="sender_city" defaultValue={sender.city ?? ""} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Land</span>
              <input name="sender_country" defaultValue={sender.country ?? "DE"} />
            </label>
          </div>
        </>
      )}
      <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Absender speichern"}
        </button>
        <Msg state={state} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Gewicht (Schritt 3)
export function WeightPanel({
  id,
  mode,
  manualWeight,
  itemWeightSum,
  effWeight,
}: {
  id: string;
  mode: "positionen" | "manuell";
  manualWeight: number | null;
  itemWeightSum: number;
  effWeight: number;
}) {
  const [state, action, pending] = useActionState(updateWeight, empty);
  const [m, setM] = useState(mode);
  return (
    <form action={action} className="rows" style={{ maxWidth: 620, marginTop: 8 }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="weight_mode" value={m} />
      <div className="row" style={{ border: "none", padding: 0, gap: 14 }}>
        <label className="chk" style={{ display: "flex", gap: 6 }}>
          <input type="radio" checked={m === "positionen"} onChange={() => setM("positionen")} />
          <span style={{ color: "var(--text)" }}>aus Positionen ({itemWeightSum} kg)</span>
        </label>
        <label className="chk" style={{ display: "flex", gap: 6 }}>
          <input type="radio" checked={m === "manuell"} onChange={() => setM("manuell")} />
          <span style={{ color: "var(--text)" }}>manuell</span>
        </label>
        {m === "manuell" && (
          <input
            name="total_weight"
            defaultValue={manualWeight ?? ""}
            placeholder="kg"
            style={{ width: 90 }}
            inputMode="decimal"
          />
        )}
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Gewicht setzen"}
        </button>
        <Msg state={state} />
      </div>
      <div className="row" style={{ border: "none", padding: 0 }}>
        <span style={{ color: "var(--muted)" }}>
          effektives Gesamtgewicht: <strong>{effWeight || 0} kg</strong>
          {!effWeight && " — Pflichtangabe für Schritt 4–6"}
        </span>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Preisvorschlag (Schritt 4)
export function SuggestionTable({
  id,
  plz,
  land,
  weight,
  options,
  carriers,
}: {
  id: string;
  plz: string;
  land: string;
  weight: number;
  options: FreightOption[];
  carriers: { id: string; code: string; name: string; art: string }[];
}) {
  const [state, action, pending] = useActionState(applySuggestion, empty);
  const cheapest = options.find((o) => o.total != null)?.total ?? null;
  return (
    <div>
      <div className="toolbar">
        <span className="count">
          {land} {plz} · {weight} kg
        </span>
        <a className="ghost" href={`/versand/vergleich?plz=${plz}&land=${land}&gewichte=${weight}`} style={{ padding: "5px 10px" }}>
          großer Vergleich
        </a>
        <Msg state={state} />
      </div>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Dienstleister</th>
              <th>Variante</th>
              <th style={{ textAlign: "right" }}>Preis</th>
              <th>Detail</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {options.map((o, i) => {
              const cid = carriers.find((c) => c.code === o.carrierCode)?.id;
              const best = o.total != null && o.total === cheapest;
              return (
                <tr key={`${o.carrierCode}-${i}`}>
                  <td>
                    {o.carrier} {best && <span className="tag">günstigste</span>}
                  </td>
                  <td>{o.variante}</td>
                  <td style={{ textAlign: "right", fontWeight: best ? 700 : 400 }}>
                    {o.total != null ? `${o.total.toFixed(2)} €` : "—"}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>
                    {o.missing ? <span className="msg-err">{o.missing}</span> : o.detail}
                  </td>
                  <td>
                    {cid && o.total != null && (
                      <form action={action}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="carrier_id" value={cid} />
                        <input type="hidden" name="carrier_service" value={`${o.carrier} · ${o.variante}`} />
                        <button type="submit" disabled={pending} className="ghost">
                          übernehmen
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Benachrichtigung (Schritt 8)
export function NotifyPanel({
  id,
  notify,
  email,
}: {
  id: string;
  notify: boolean;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateNotify, empty);
  return (
    <form action={action} className="rows" style={{ maxWidth: 620 }}>
      <input type="hidden" name="id" value={id} />
      <label className="chk" style={{ display: "flex", gap: 8 }}>
        <input type="checkbox" name="notify_recipient" defaultChecked={notify} />
        <span style={{ color: "var(--text)" }}>
          Empfänger per Mail über den Sendungsverlauf informieren
        </span>
      </label>
      <label className="field">
        <span>E-Mail für Benachrichtigung</span>
        <input name="notify_email" type="email" defaultValue={email} style={{ maxWidth: 320 }} />
      </label>
      <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </button>
        <Msg state={state} />
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Versand der Mail erfolgt, sobald Tracking + Carrier-API stehen.
        </span>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Kopfdaten
export function HeaderForm({
  id,
  carrierId,
  carrierService,
  shipDate,
  frankatur,
  notiz,
  carriers,
}: {
  id: string;
  carrierId: string | null;
  carrierService: string | null;
  shipDate: string | null;
  frankatur: string | null;
  notiz: string | null;
  carriers: { id: string; name: string; art: string }[];
}) {
  const [state, action, pending] = useActionState(updateShipment, empty);
  return (
    <form action={action} className="rows" style={{ maxWidth: 620 }}>
      <input type="hidden" name="id" value={id} />
      <div className="row" style={{ border: "none", padding: 0 }}>
        <label className="field" style={{ flex: 2 }}>
          <span>Frachtdienstleister</span>
          <select name="carrier_id" defaultValue={carrierId ?? ""}>
            <option value="">—</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.art})
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 2 }}>
          <span>Produkt / Service</span>
          <input name="carrier_service" defaultValue={carrierService ?? ""} />
        </label>
      </div>
      <div className="row" style={{ border: "none", padding: 0 }}>
        <label className="field" style={{ flex: 1 }}>
          <span>Versanddatum</span>
          <input name="ship_date" type="date" defaultValue={shipDate ?? ""} />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Frankatur</span>
          <input name="frankatur" defaultValue={frankatur ?? ""} />
        </label>
      </div>
      <label className="field">
        <span>Notiz</span>
        <textarea name="notiz" rows={2} defaultValue={notiz ?? ""} style={{ font: "inherit" }} />
      </label>
      <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </button>
        <Msg state={state} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Empfänger + Prüfung
export function RecipientPanel({
  shipmentId,
  organizationId,
  rec,
}: {
  shipmentId: string;
  organizationId: string;
  rec: Rec;
}) {
  const [state, action, pending] = useActionState(updateRecipient, empty);
  const [vState, vAction, vPending] = useActionState(verifyAddress, empty);
  const [aState, aAction, aPending] = useActionState(addAddress, empty);
  const [cState, cAction, cPending] = useActionState(addContact, empty);
  const issues = rec.verify_result?.issues ?? [];

  return (
    <div className="rows" style={{ maxWidth: 620 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>
          {rec.verified ? (
            <span className="msg-ok">
              ✓ Adresse geprüft
              {rec.verified_by ? ` (${rec.verified_by}` : ""}
              {rec.verified_at ? `, ${rec.verified_at.slice(0, 10)})` : rec.verified_by ? ")" : ""}
            </span>
          ) : (
            <span className="msg-err">Adresse ungeprüft</span>
          )}
          {!rec.verified && issues.length > 0 && (
            <span style={{ color: "var(--muted)" }}> — {issues.join(", ")}</span>
          )}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <form action={vAction}>
            <input type="hidden" name="shipment_id" value={shipmentId} />
            <input type="hidden" name="recipient_id" value={rec.id} />
            <button type="submit" disabled={vPending}>
              {vPending ? "…" : "Adresse prüfen"}
            </button>
          </form>
          <form action={vAction}>
            <input type="hidden" name="shipment_id" value={shipmentId} />
            <input type="hidden" name="recipient_id" value={rec.id} />
            <input type="hidden" name="force" value="1" />
            <button type="submit" className="ghost" disabled={vPending} title="ohne Plausibilitätsprüfung">
              als geprüft markieren
            </button>
          </form>
          {rec.verified && (
            <form action={vAction}>
              <input type="hidden" name="shipment_id" value={shipmentId} />
              <input type="hidden" name="recipient_id" value={rec.id} />
              <input type="hidden" name="reset" value="1" />
              <button type="submit" className="ghost" disabled={vPending}>
                zurücksetzen
              </button>
            </form>
          )}
        </span>
      </div>
      {(vState.ok || vState.error) && (
        <div className="row" style={{ border: "none", padding: "0 10px" }}>
          <Msg state={vState} />
        </div>
      )}

      <form action={action} className="rows">
        <input type="hidden" name="shipment_id" value={shipmentId} />
        <input type="hidden" name="recipient_id" value={rec.id} />
        <div className="row" style={{ border: "none", padding: 0 }}>
          <label className="field" style={{ flex: 3 }}>
            <span>Name</span>
            <input name="recipient_name" defaultValue={rec.name} required />
          </label>
          <label className="field" style={{ flex: 2 }}>
            <span>Zusatz</span>
            <input name="addition" defaultValue={rec.addition ?? ""} />
          </label>
        </div>
        <div className="row" style={{ border: "none", padding: 0 }}>
          <label className="field" style={{ flex: 3 }}>
            <span>Straße</span>
            <input name="street" defaultValue={rec.street ?? ""} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Hausnr.</span>
            <input name="house_number" defaultValue={rec.house_number ?? ""} />
          </label>
        </div>
        <label className="field">
          <span>Adresszusatz</span>
          <input name="address_addition" defaultValue={rec.address_addition ?? ""} />
        </label>
        <div className="row" style={{ border: "none", padding: 0 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>PLZ</span>
            <input name="zip" defaultValue={rec.zip ?? ""} />
          </label>
          <label className="field" style={{ flex: 3 }}>
            <span>Ort</span>
            <input name="city" defaultValue={rec.city ?? ""} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Land</span>
            <input name="country" defaultValue={rec.country ?? "DE"} />
          </label>
        </div>
        <div className="row" style={{ border: "none", padding: 0 }}>
          <label className="field" style={{ flex: 2 }}>
            <span>Ansprechpartner</span>
            <input name="contact_name" defaultValue={rec.contact_name ?? ""} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Telefon</span>
            <input name="phone" defaultValue={rec.phone ?? ""} />
          </label>
        </div>
        <label className="field">
          <span>E-Mail</span>
          <input name="email" type="email" defaultValue={rec.email ?? ""} />
        </label>
        <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
          <button type="submit" disabled={pending}>
            {pending ? "…" : "Empfänger speichern"}
          </button>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            (Änderung setzt die Prüfung zurück)
          </span>
          <Msg state={state} />
        </div>
      </form>

      {organizationId && (
        <div className="row" style={{ border: "none", padding: 0, gap: 18, flexWrap: "wrap" }}>
          <details>
            <summary style={{ cursor: "pointer", color: "var(--muted)" }}>
              ＋ Adresse beim Kunden anlegen
            </summary>
            <form action={aAction} className="rows" style={{ marginTop: 8 }}>
              <input type="hidden" name="shipment_id" value={shipmentId} />
              <input type="hidden" name="recipient_id" value={rec.id} />
              <input type="hidden" name="organization_id" value={organizationId} />
              <div className="row" style={{ border: "none", padding: 0 }}>
                <label className="field" style={{ flex: 3 }}>
                  <span>Straße</span>
                  <input name="street" />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Hausnr.</span>
                  <input name="house_number" />
                </label>
              </div>
              <label className="field">
                <span>Adresszusatz</span>
                <input name="address_addition" />
              </label>
              <div className="row" style={{ border: "none", padding: 0 }}>
                <label className="field" style={{ flex: 1 }}>
                  <span>PLZ</span>
                  <input name="zip" />
                </label>
                <label className="field" style={{ flex: 3 }}>
                  <span>Ort</span>
                  <input name="city" />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Land</span>
                  <input name="country" defaultValue="DE" />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Art</span>
                  <select name="addr_kind" defaultValue="shipping">
                    <option value="shipping">Liefer</option>
                    <option value="billing">Rechnung</option>
                    <option value="general">allgemein</option>
                  </select>
                </label>
              </div>
              <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
                <button type="submit" disabled={aPending}>
                  {aPending ? "…" : "Anlegen & übernehmen"}
                </button>
                <Msg state={aState} />
              </div>
            </form>
          </details>

          <details>
            <summary style={{ cursor: "pointer", color: "var(--muted)" }}>
              ＋ Ansprechpartner beim Kunden anlegen
            </summary>
            <form action={cAction} className="rows" style={{ marginTop: 8 }}>
              <input type="hidden" name="shipment_id" value={shipmentId} />
              <input type="hidden" name="recipient_id" value={rec.id} />
              <input type="hidden" name="organization_id" value={organizationId} />
              <div className="row" style={{ border: "none", padding: 0 }}>
                <label className="field" style={{ flex: 1 }}>
                  <span>Vorname</span>
                  <input name="first_name" />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Nachname *</span>
                  <input name="last_name" required />
                </label>
              </div>
              <div className="row" style={{ border: "none", padding: 0 }}>
                <label className="field" style={{ flex: 2 }}>
                  <span>E-Mail</span>
                  <input name="email" type="email" />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Telefon</span>
                  <input name="phone" />
                </label>
              </div>
              <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
                <button type="submit" disabled={cPending}>
                  {cPending ? "…" : "Anlegen & übernehmen"}
                </button>
                <Msg state={cState} />
              </div>
            </form>
          </details>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Packstücke
function PackageRow({
  shipmentId,
  recipientId,
  row,
  defaultArt,
}: {
  shipmentId: string;
  recipientId: string;
  row?: Pkg;
  defaultArt: string;
}) {
  const [sState, sAction, sPending] = useActionState(savePackage, empty);
  const [dState, dAction, dPending] = useActionState(deletePackage, empty);
  const isNew = !row;
  return (
    <form action={sAction} className={isNew ? "row new" : "row"}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <input type="hidden" name="recipient_id" value={recipientId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <input
        name="position"
        defaultValue={row?.position ?? ""}
        placeholder="#"
        style={{ width: 42 }}
      />
      <select name="art" defaultValue={row?.art ?? defaultArt} style={{ width: 100 }}>
        {PACK_ART.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <input
        name="weight_kg"
        defaultValue={row?.weight_kg ?? ""}
        placeholder="kg"
        style={{ width: 70 }}
        inputMode="decimal"
      />
      <input name="length_cm" defaultValue={row?.length_cm ?? ""} placeholder="L" style={{ width: 52 }} />
      <input name="width_cm" defaultValue={row?.width_cm ?? ""} placeholder="B" style={{ width: 52 }} />
      <input name="height_cm" defaultValue={row?.height_cm ?? ""} placeholder="H" style={{ width: 52 }} />
      <input
        name="tracking_number"
        defaultValue={row?.tracking_number ?? ""}
        placeholder="Tracking-Nr"
        style={{ width: 150 }}
      />
      <button type="submit" disabled={sPending}>
        {sPending ? "…" : isNew ? "+" : "Speichern"}
      </button>
      <Msg state={sState} />
      {row && (
        <button
          type="submit"
          className="ghost"
          disabled={dPending}
          formAction={dAction}
          formNoValidate
          onClick={(e) => {
            if (!confirm("Packstück löschen?")) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
      {dState.error && <span className="msg-err">{dState.error}</span>}
    </form>
  );
}

export function PackagesPanel({
  shipmentId,
  recipientId,
  carrierArt,
  packages,
}: {
  shipmentId: string;
  recipientId: string;
  carrierArt: string;
  packages: Pkg[];
}) {
  const [gState, gAction, gPending] = useActionState(generatePackages, empty);
  const defaultArt = carrierArt === "spedition" ? "palette" : "paket";
  return (
    <div className="rows" style={{ maxWidth: 720 }}>
      <form action={gAction} className="row" style={{ background: "var(--tag-bg)" }}>
        <input type="hidden" name="shipment_id" value={shipmentId} />
        <input type="hidden" name="recipient_id" value={recipientId} />
        <input type="hidden" name="art" value={defaultArt} />
        <span style={{ color: "var(--muted)", fontSize: 12 }}>aus Gewicht erzeugen:</span>
        <input name="total_weight" placeholder="Gesamt kg" style={{ width: 90 }} inputMode="decimal" />
        <input
          name="max_kg"
          placeholder={defaultArt === "paket" ? "max 31,5" : "max kg/Pal."}
          style={{ width: 90 }}
          inputMode="decimal"
        />
        <span style={{ color: "var(--muted)" }}>oder</span>
        <input name="count" placeholder="Anzahl" style={{ width: 70 }} inputMode="numeric" />
        <button
          type="submit"
          disabled={gPending}
          onClick={(e) => {
            if (packages.length && !confirm("Vorhandene Packstücke ersetzen?")) e.preventDefault();
          }}
        >
          {gPending ? "…" : "Packstücke erzeugen"}
        </button>
        <Msg state={gState} />
      </form>

      <div className="row head">
        <span style={{ width: 42 }}>#</span>
        <span style={{ width: 100 }}>Art</span>
        <span style={{ width: 70 }}>kg</span>
        <span style={{ width: 168 }}>L / B / H (cm)</span>
        <span style={{ width: 150 }}>Tracking</span>
      </div>
      {packages.map((p) => (
        <PackageRow
          key={p.id}
          shipmentId={shipmentId}
          recipientId={recipientId}
          row={p}
          defaultArt={defaultArt}
        />
      ))}
      <PackageRow shipmentId={shipmentId} recipientId={recipientId} defaultArt={defaultArt} />
    </div>
  );
}

// ---------------------------------------------------------------- Positionen
function ItemRow({
  shipmentId,
  recipientId,
  row,
  artikel,
}: {
  shipmentId: string;
  recipientId: string;
  row?: Item;
  artikel: Artikel[];
}) {
  const [sState, sAction, sPending] = useActionState(saveItem, empty);
  const [dState, dAction, dPending] = useActionState(deleteItem, empty);
  const isNew = !row;

  const setField = (form: HTMLFormElement, name: string, value: string) => {
    const el = form.elements.namedItem(name) as HTMLInputElement | null;
    if (el) el.value = value;
  };
  const recalc = (form: HTMLFormElement) => {
    const aid = (form.elements.namedItem("versand_artikel_id") as HTMLSelectElement | null)?.value;
    const a = artikel.find((x) => x.id === aid);
    if (!a) return;
    const qty =
      Number(
        String((form.elements.namedItem("quantity") as HTMLInputElement | null)?.value ?? "")
          .replace(",", "."),
      ) || 0;
    setField(form, "weight_kg", String(Math.round(a.gewicht_kg * qty * 1000) / 1000));
  };

  return (
    <form action={sAction} className={isNew ? "row new" : "row"}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <input type="hidden" name="recipient_id" value={recipientId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <input name="position" defaultValue={row?.position ?? ""} placeholder="#" style={{ width: 42 }} />
      {artikel.length > 0 && (
        <select
          name="versand_artikel_id"
          defaultValue={row?.versand_artikel_id ?? ""}
          style={{ width: 120 }}
          title="Versandartikel"
          onChange={(e) => {
            const form = e.currentTarget.form;
            const a = artikel.find((x) => x.id === e.currentTarget.value);
            if (form && a) {
              setField(form, "description", a.bezeichnung);
              setField(form, "unit", a.einheit);
              recalc(form);
            }
          }}
        >
          <option value="">– frei –</option>
          {artikel.map((a) => (
            <option key={a.id} value={a.id}>
              {a.bezeichnung}
            </option>
          ))}
        </select>
      )}
      <input
        name="description"
        defaultValue={row?.description ?? ""}
        placeholder="Bezeichnung"
        className="w-name"
        required
      />
      <input
        name="quantity"
        defaultValue={row?.quantity ?? 1}
        placeholder="Menge"
        style={{ width: 70 }}
        inputMode="decimal"
        onChange={(e) => e.currentTarget.form && recalc(e.currentTarget.form)}
      />
      <input name="unit" defaultValue={row?.unit ?? ""} placeholder="Einheit" style={{ width: 70 }} />
      <input
        name="weight_kg"
        defaultValue={row?.weight_kg ?? ""}
        placeholder="kg"
        style={{ width: 60 }}
        inputMode="decimal"
        title="Gewicht dieser Position (für Gesamtgewicht)"
      />
      <input name="note" defaultValue={row?.note ?? ""} placeholder="Notiz" style={{ width: 120 }} />
      <button type="submit" disabled={sPending}>
        {sPending ? "…" : isNew ? "+" : "Speichern"}
      </button>
      <Msg state={sState} />
      {row && (
        <button
          type="submit"
          className="ghost"
          disabled={dPending}
          formAction={dAction}
          formNoValidate
          onClick={(e) => {
            if (!confirm("Position löschen?")) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
      {dState.error && <span className="msg-err">{dState.error}</span>}
    </form>
  );
}

export function ItemsPanel({
  shipmentId,
  recipientId,
  items,
  artikel,
}: {
  shipmentId: string;
  recipientId: string;
  items: Item[];
  artikel: Artikel[];
}) {
  return (
    <div className="rows" style={{ maxWidth: 780 }}>
      <div className="row head">
        <span style={{ width: 42 }}>#</span>
        {artikel.length > 0 && <span style={{ width: 120 }}>Artikel</span>}
        <span className="w-name">Bezeichnung</span>
        <span style={{ width: 70 }}>Menge</span>
        <span style={{ width: 70 }}>Einheit</span>
        <span style={{ width: 60 }}>kg</span>
        <span style={{ width: 120 }}>Notiz</span>
      </div>
      {items.map((it) => (
        <ItemRow
          key={it.id}
          shipmentId={shipmentId}
          recipientId={recipientId}
          row={it}
          artikel={artikel}
        />
      ))}
      <ItemRow shipmentId={shipmentId} recipientId={recipientId} artikel={artikel} />
      {artikel.length === 0 && (
        <p className="lead" style={{ marginTop: 4 }}>
          Tipp: wiederkehrende Artikel mit Gewicht unter{" "}
          <a href="/einstellungen/versandartikel">Einstellungen → Versandartikel</a> anlegen.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Status / löschen
export function StatusBar({ id, status }: { id: string; status: string }) {
  const [sState, sAction, sPending] = useActionState(setStatus, empty);
  const [dState, dAction, dPending] = useActionState(deleteShipment, empty);
  return (
    <div className="toolbar">
      <form action={sAction} className="toolbar" style={{ margin: 0 }}>
        <input type="hidden" name="id" value={id} />
        <select name="status" defaultValue={status}>
          {STATUS.map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={sPending}>
          {sPending ? "…" : "Status setzen"}
        </button>
        <Msg state={sState} />
      </form>
      <form action={dAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="ghost"
          disabled={dPending}
          onClick={(e) => {
            if (!confirm("Sendung mit allen Packstücken/Positionen löschen?")) e.preventDefault();
          }}
        >
          Sendung löschen
        </button>
        {dState.error && <span className="msg-err">{dState.error}</span>}
      </form>
    </div>
  );
}
