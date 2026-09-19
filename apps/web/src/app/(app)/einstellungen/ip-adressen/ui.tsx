"use client";

import { useActionState, useMemo, useState } from "react";
import { saveIpAdresse, deleteIpAdresse, type RowState } from "./actions";

export type Maschine = { id: string; name: string };
export type IpAdresse = {
  id: string;
  ip_adresse: string;
  geraet: string | null;
  hostname: string | null;
  mac_adresse: string | null;
  hersteller: string | null;
  maschine_id: string | null;
  notiz: string | null;
  scan_datum: string | null;
};

const empty: RowState = {};

/** Sortierschlüssel für IPv4, damit z.B. .9 vor .30 einsortiert statt danach. */
function ipSortKey(ip: string): string {
  return ip
    .split(".")
    .map((teil) => teil.padStart(3, "0"))
    .join(".");
}

function Row({ row, maschinen }: { row?: IpAdresse; maschinen: Maschine[] }) {
  const [state, action, pending] = useActionState(saveIpAdresse, empty);
  const [dState, dAction, dPending] = useActionState(deleteIpAdresse, empty);
  const isNew = !row;
  const unzugeordnet = !isNew && !row.geraet;

  return (
    <form className={isNew ? "row new" : "row"} action={action}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input
        name="ip_adresse"
        defaultValue={row?.ip_adresse ?? ""}
        placeholder="172.16.8.x"
        style={{ width: 120 }}
        required
      />
      <input
        name="geraet"
        defaultValue={row?.geraet ?? ""}
        placeholder="Gerät (z.B. Fileserver Büro)"
        className="w-name"
        style={unzugeordnet ? { borderColor: "var(--err)" } : undefined}
      />
      <input name="hostname" defaultValue={row?.hostname ?? ""} placeholder="Hostname" style={{ width: 180 }} />
      <input name="mac_adresse" defaultValue={row?.mac_adresse ?? ""} placeholder="MAC-Adresse" style={{ width: 140 }} />
      <input name="hersteller" defaultValue={row?.hersteller ?? ""} placeholder="Hersteller" style={{ width: 160 }} />
      <select name="maschine_id" defaultValue={row?.maschine_id ?? ""} style={{ width: 140 }}>
        <option value="">– keine Maschine –</option>
        {maschinen.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input name="notiz" defaultValue={row?.notiz ?? ""} placeholder="Notiz" className="w-name" />
      {row?.scan_datum && (
        <span className="tag" title="Aus LAN-Scan importiert">
          Scan {row.scan_datum}
        </span>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "…" : isNew ? "Hinzufügen" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
      {row && (
        <button
          type="submit"
          className="ghost"
          formAction={dAction}
          formNoValidate
          disabled={dPending}
          onClick={(e) => {
            if (!confirm(`IP-Adresse ${row.ip_adresse} löschen?`)) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
      {dState.error && <span className="msg-err">{dState.error}</span>}
    </form>
  );
}

export function IpAdresseTable({ rows, maschinen }: { rows: IpAdresse[]; maschinen: Maschine[] }) {
  const [nurUnzugeordnet, setNurUnzugeordnet] = useState(false);

  const sortiert = useMemo(
    () => [...rows].sort((a, b) => ipSortKey(a.ip_adresse).localeCompare(ipSortKey(b.ip_adresse))),
    [rows],
  );
  const unzugeordnetAnzahl = rows.filter((r) => !r.geraet).length;
  const angezeigt = nurUnzugeordnet ? sortiert.filter((r) => !r.geraet) : sortiert;

  return (
    <>
      <div className="kv" style={{ gridTemplateColumns: "auto auto auto" }}>
        <dt>IP-Adressen gesamt</dt>
        <dt>zugeordnet</dt>
        <dt>ohne Gerät</dt>
        <dd>
          <strong>{rows.length}</strong>
        </dd>
        <dd>{rows.length - unzugeordnetAnzahl}</dd>
        <dd className={unzugeordnetAnzahl > 0 ? "msg-err" : undefined}>{unzugeordnetAnzahl}</dd>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <label className="chk">
          <input
            type="checkbox"
            checked={nurUnzugeordnet}
            onChange={(e) => setNurUnzugeordnet(e.target.checked)}
          />{" "}
          nur nicht zugeordnete anzeigen
        </label>
      </div>

      <div className="rows" style={{ marginTop: 8 }}>
        <div className="row head">
          <span style={{ width: 120 }}>IP-Adresse</span>
          <span className="w-name">Gerät</span>
          <span style={{ width: 180 }}>Hostname</span>
          <span style={{ width: 140 }}>MAC-Adresse</span>
          <span style={{ width: 160 }}>Hersteller</span>
          <span style={{ width: 140 }}>Maschine</span>
          <span className="w-name">Notiz</span>
        </div>
        {angezeigt.map((r) => (
          <Row key={r.id} row={r} maschinen={maschinen} />
        ))}
        {!nurUnzugeordnet && <Row maschinen={maschinen} />}
      </div>
    </>
  );
}
