"use client";

import { useActionState, useState } from "react";
import { createShipment, type State } from "../actions";

type Addr = {
  id: string;
  kind: string;
  is_default: boolean;
  street: string;
  house_number: string;
  address_addition: string;
  zip: string;
  city: string;
  country: string;
};

const empty: State = {};

export function NewShipmentForm({
  orgId,
  orgName,
  addresses,
  contacts,
  carriers,
  orders,
  bechtelSender,
}: {
  orgId: string;
  orgName: string;
  addresses: Addr[];
  contacts: { id: string; name: string }[];
  carriers: { id: string; name: string; art: string }[];
  orders: { id: string; label: string }[];
  bechtelSender: string;
}) {
  const [state, action, pending] = useActionState(createShipment, empty);
  const [mode, setMode] = useState<string>(addresses.length ? addresses[0].id : "manual");
  const isManual = mode === "manual";
  const [senderMode, setSenderMode] = useState<"bechtel" | "kunde" | "frei">("bechtel");
  const kundeAddr = addresses[0];

  return (
    <form action={action} className="rows" style={{ maxWidth: 620 }}>
      <input type="hidden" name="organization_id" value={orgId} />
      <input type="hidden" name="addr_mode" value={isManual ? "manual" : "source"} />
      {!isManual && <input type="hidden" name="source_address_id" value={mode} />}

      <h2>Empfänger</h2>
      <label className="field">
        <span>Name</span>
        <input name="recipient_name" defaultValue={orgName} required />
      </label>
      <label className="field">
        <span>Zusatz (c/o, z.Hd.)</span>
        <input name="addition" />
      </label>

      <div className="field">
        <span>Adresse</span>
        {addresses.map((a) => (
          <label key={a.id} className="chk" style={{ display: "flex", gap: 8 }}>
            <input
              type="radio"
              name="addr_pick"
              checked={mode === a.id}
              onChange={() => setMode(a.id)}
            />
            <span style={{ color: "var(--text)" }}>
              {a.kind}
              {a.is_default ? " ★" : ""}: {a.street} {a.house_number}
              {a.address_addition ? `, ${a.address_addition}` : ""}, {a.zip} {a.city}
              {a.country && a.country !== "DE" ? ` (${a.country})` : ""}
            </span>
          </label>
        ))}
        <label className="chk" style={{ display: "flex", gap: 8 }}>
          <input
            type="radio"
            name="addr_pick"
            checked={isManual}
            onChange={() => setMode("manual")}
          />
          <span style={{ color: "var(--text)" }}>Andere Adresse eingeben</span>
        </label>
      </div>

      {isManual && (
        <>
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
          </div>
        </>
      )}

      <div className="row" style={{ border: "none", padding: 0 }}>
        <label className="field" style={{ flex: 2 }}>
          <span>Ansprechpartner</span>
          <input name="contact_name" list="contact-list" />
          <datalist id="contact-list">
            {contacts.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Telefon</span>
          <input name="phone" />
        </label>
      </div>
      <label className="field">
        <span>E-Mail</span>
        <input name="email" type="email" />
      </label>

      <h2>Absender</h2>
      <input type="hidden" name="sender_mode" value={senderMode} />
      <div className="field">
        <label className="chk" style={{ display: "flex", gap: 8 }}>
          <input
            type="radio"
            checked={senderMode === "bechtel"}
            onChange={() => setSenderMode("bechtel")}
          />
          <span style={{ color: "var(--text)" }}>Bechtel Druck — {bechtelSender}</span>
        </label>
        <label className="chk" style={{ display: "flex", gap: 8 }}>
          <input
            type="radio"
            checked={senderMode === "kunde"}
            onChange={() => setSenderMode("kunde")}
          />
          <span style={{ color: "var(--text)" }}>
            Absender des Kunden{kundeAddr ? " (aus Kundenadresse vorbelegt)" : ""}
          </span>
        </label>
        <label className="chk" style={{ display: "flex", gap: 8 }}>
          <input
            type="radio"
            checked={senderMode === "frei"}
            onChange={() => setSenderMode("frei")}
          />
          <span style={{ color: "var(--text)" }}>Freier Absender</span>
        </label>
        <label className="chk" style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <input type="checkbox" name="neutral_versand" />
          <span style={{ color: "var(--text)" }}>Neutraler Versand (kein Absender aufs Etikett)</span>
        </label>
      </div>

      {senderMode !== "bechtel" && (
        <>
          <label className="field">
            <span>Absender-Name</span>
            <input
              name="sender_name"
              defaultValue={senderMode === "kunde" ? orgName : ""}
              key={senderMode}
            />
          </label>
          <div className="row" style={{ border: "none", padding: 0 }}>
            <label className="field" style={{ flex: 3 }}>
              <span>Straße</span>
              <input
                name="sender_street"
                defaultValue={senderMode === "kunde" ? kundeAddr?.street ?? "" : ""}
                key={senderMode}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Hausnr.</span>
              <input
                name="sender_house_number"
                defaultValue={senderMode === "kunde" ? kundeAddr?.house_number ?? "" : ""}
                key={senderMode}
              />
            </label>
          </div>
          <div className="row" style={{ border: "none", padding: 0 }}>
            <label className="field" style={{ flex: 1 }}>
              <span>PLZ</span>
              <input
                name="sender_zip"
                defaultValue={senderMode === "kunde" ? kundeAddr?.zip ?? "" : ""}
                key={senderMode}
              />
            </label>
            <label className="field" style={{ flex: 3 }}>
              <span>Ort</span>
              <input
                name="sender_city"
                defaultValue={senderMode === "kunde" ? kundeAddr?.city ?? "" : ""}
                key={senderMode}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Land</span>
              <input
                name="sender_country"
                defaultValue={senderMode === "kunde" ? kundeAddr?.country ?? "DE" : "DE"}
                key={senderMode}
              />
            </label>
          </div>
        </>
      )}

      <h2>Versand</h2>
      <div className="row" style={{ border: "none", padding: 0 }}>
        <label className="field" style={{ flex: 2 }}>
          <span>Frachtdienstleister</span>
          <select name="carrier_id" defaultValue="">
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
          <input name="carrier_service" placeholder="DHL Paket, Palette …" />
        </label>
      </div>
      <div className="row" style={{ border: "none", padding: 0 }}>
        <label className="field" style={{ flex: 1 }}>
          <span>Versanddatum</span>
          <input name="ship_date" type="date" />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Frankatur</span>
          <input name="frankatur" placeholder="frei Haus" />
        </label>
      </div>
      <label className="field">
        <span>Auftrag (optional)</span>
        <select name="sales_order_id" defaultValue="">
          <option value="">—</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Notiz</span>
        <textarea name="notiz" rows={2} style={{ font: "inherit" }} />
      </label>

      <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Sendung anlegen"}
        </button>
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}
