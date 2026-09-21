"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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

type Spalte = "ip" | "geraet";

function DetailModal({
  row,
  maschinen,
  onClose,
}: {
  row: IpAdresse | null;
  maschinen: Maschine[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveIpAdresse, empty);
  const [dState, dAction, dPending] = useActionState(deleteIpAdresse, empty);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);
  useEffect(() => {
    if (dState.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dState.ok]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 20,
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{row ? row.ip_adresse : "Neue IP-Adresse"}</h2>
          <button type="button" className="ghost" onClick={onClose} style={{ padding: "4px 10px" }}>
            ✕
          </button>
        </div>

        <form action={action} className="rows" style={{ gap: 10 }}>
          {row && <input type="hidden" name="id" value={row.id} />}

          <label className="rows" style={{ gap: 2 }}>
            <span className="count">IP-Adresse</span>
            <input name="ip_adresse" defaultValue={row?.ip_adresse ?? ""} placeholder="172.16.8.x" required />
          </label>
          <label className="rows" style={{ gap: 2 }}>
            <span className="count">Gerät</span>
            <input name="geraet" defaultValue={row?.geraet ?? ""} placeholder="z.B. Fileserver Büro" />
          </label>
          <label className="rows" style={{ gap: 2 }}>
            <span className="count">Hostname</span>
            <input name="hostname" defaultValue={row?.hostname ?? ""} />
          </label>
          <label className="rows" style={{ gap: 2 }}>
            <span className="count">MAC-Adresse</span>
            <input name="mac_adresse" defaultValue={row?.mac_adresse ?? ""} />
          </label>
          <label className="rows" style={{ gap: 2 }}>
            <span className="count">Hersteller</span>
            <input name="hersteller" defaultValue={row?.hersteller ?? ""} />
          </label>
          <label className="rows" style={{ gap: 2 }}>
            <span className="count">Maschine</span>
            <select name="maschine_id" defaultValue={row?.maschine_id ?? ""}>
              <option value="">– keine Maschine –</option>
              {maschinen.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="rows" style={{ gap: 2 }}>
            <span className="count">Notiz</span>
            <input name="notiz" defaultValue={row?.notiz ?? ""} />
          </label>
          {row?.scan_datum && (
            <span className="tag" style={{ alignSelf: "flex-start" }} title="Aus LAN-Scan importiert">
              Scan {row.scan_datum}
            </span>
          )}

          <div className="toolbar" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <div>
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
                  Löschen
                </button>
              )}
            </div>
            <div className="toolbar" style={{ gap: 8 }}>
              {state.error && <span className="msg-err">{state.error}</span>}
              {dState.error && <span className="msg-err">{dState.error}</span>}
              <button type="submit" disabled={pending}>
                {pending ? "…" : row ? "Speichern" : "Anlegen"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function IpAdresseTable({ rows, maschinen }: { rows: IpAdresse[]; maschinen: Maschine[] }) {
  const [ipSuche, setIpSuche] = useState("");
  const [geraetSuche, setGeraetSuche] = useState("");
  const [sortSpalte, setSortSpalte] = useState<Spalte>("ip");
  const [sortRichtung, setSortRichtung] = useState<"asc" | "desc">("asc");
  const [ausgewaehlt, setAusgewaehlt] = useState<IpAdresse | "neu" | null>(null);

  const unzugeordnetAnzahl = rows.filter((r) => !r.geraet).length;

  const angezeigt = useMemo(() => {
    const ipQ = ipSuche.trim().toLowerCase();
    const gQ = geraetSuche.trim().toLowerCase();
    const gefiltert = rows.filter(
      (r) =>
        r.ip_adresse.toLowerCase().includes(ipQ) && (r.geraet ?? "").toLowerCase().includes(gQ),
    );
    const dir = sortRichtung === "asc" ? 1 : -1;
    return [...gefiltert].sort((a, b) => {
      const ka = sortSpalte === "ip" ? ipSortKey(a.ip_adresse) : a.geraet || "￿";
      const kb = sortSpalte === "ip" ? ipSortKey(b.ip_adresse) : b.geraet || "￿";
      return ka.localeCompare(kb, "de", { numeric: true }) * dir;
    });
  }, [rows, ipSuche, geraetSuche, sortSpalte, sortRichtung]);

  const sortiere = (spalte: Spalte) => {
    if (spalte === sortSpalte) setSortRichtung((r) => (r === "asc" ? "desc" : "asc"));
    else {
      setSortSpalte(spalte);
      setSortRichtung("asc");
    }
  };
  const pfeil = (spalte: Spalte) => (spalte === sortSpalte ? (sortRichtung === "asc" ? " ▲" : " ▼") : "");

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

      <div className="toolbar" style={{ marginTop: 12, justifyContent: "space-between" }}>
        <div className="toolbar" style={{ gap: 8 }}>
          <input
            value={ipSuche}
            onChange={(e) => setIpSuche(e.target.value)}
            placeholder="IP-Adresse suchen…"
            style={{ width: 160 }}
          />
          <input
            value={geraetSuche}
            onChange={(e) => setGeraetSuche(e.target.value)}
            placeholder="Gerät suchen…"
            style={{ width: 220 }}
          />
        </div>
        <button type="button" onClick={() => setAusgewaehlt("neu")}>
          + Neue IP-Adresse
        </button>
      </div>

      <div className="table-scroll" style={{ marginTop: 8 }}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => sortiere("ip")}>
                IP-Adresse{pfeil("ip")}
              </th>
              <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => sortiere("geraet")}>
                Gerät{pfeil("geraet")}
              </th>
            </tr>
          </thead>
          <tbody>
            {angezeigt.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setAusgewaehlt(r)}>
                <td>{r.ip_adresse}</td>
                <td className={!r.geraet ? "msg-err" : undefined}>{r.geraet || "nicht zugeordnet"}</td>
              </tr>
            ))}
            {angezeigt.length === 0 && (
              <tr>
                <td colSpan={2} className="count">
                  Keine Treffer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {ausgewaehlt && (
        <DetailModal
          row={ausgewaehlt === "neu" ? null : ausgewaehlt}
          maschinen={maschinen}
          onClose={() => setAusgewaehlt(null)}
        />
      )}
    </>
  );
}
