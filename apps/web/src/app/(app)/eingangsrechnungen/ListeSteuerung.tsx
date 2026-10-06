"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AccountPicker } from "../_shared/AccountPicker";
import { buchenMehrere, setzeKontoAlle, zahlartMehrere } from "./actions";

/**
 * Steuerung der Belegliste: Mehrfachauswahl ("als gebucht markieren") und Schnell-Konto je Zeile.
 * Die Zeilen selbst sind serverseitig gerenderte Checkboxen (.row-check) und Stift-Buttons (.konto-edit);
 * diese Komponente hängt sich per Event-Delegation daran.
 */
export function ListeSteuerung({ konten }: { konten: { value: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [anzahl, setAnzahl] = useState(0);
  const [bereit, setBereit] = useState(0);
  const [edit, setEdit] = useState<{ id: string; konto: string } | null>(null);
  const [konto, setKonto] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const zaehlen = () => {
    const checked = Array.from(document.querySelectorAll<HTMLInputElement>("input.row-check:checked"));
    setAnzahl(checked.length);
    setBereit(checked.filter((c) => c.dataset.bereit === "1").length);
  };

  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.matches("input.row-check-all")) {
        const on = (t as HTMLInputElement).checked;
        document.querySelectorAll<HTMLInputElement>("input.row-check").forEach((c) => (c.checked = on));
      }
      if (t.matches("input.row-check, input.row-check-all")) zaehlen();
    };
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("button.konto-edit");
      if (b) {
        setEdit({ id: b.dataset.id ?? "", konto: b.dataset.konto ?? "" });
        setKonto(b.dataset.konto ?? "");
      }
    };
    document.addEventListener("change", onChange);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("change", onChange);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const ids = (nurBereit: boolean) =>
    Array.from(document.querySelectorAll<HTMLInputElement>("input.row-check:checked"))
      .filter((c) => !nurBereit || c.dataset.bereit === "1")
      .map((c) => c.dataset.id ?? "");

  const buchen = (nurBereit: boolean) =>
    start(async () => {
      const r = await buchenMehrere(ids(nurBereit));
      const grund = r.abgelehnt.length
        ? ` ${r.abgelehnt.length} nicht gebucht: ` +
          r.abgelehnt.slice(0, 3).map((a) => `${a.label} (${a.probleme.join("; ")})`).join(" | ") +
          (r.abgelehnt.length > 3 ? ` … und ${r.abgelehnt.length - 3} weitere` : "")
        : "";
      setMsg(`${r.gebucht} Beleg(e) als gebucht markiert.${grund}`);
      router.refresh();
      setTimeout(zaehlen, 400);
    });

  const zahlart = (method: string) =>
    start(async () => {
      if (!method) return;
      const r = await zahlartMehrere(ids(false), method);
      setMsg(`Zahlart bei ${r.gesetzt} Beleg(en) gesetzt.`);
      router.refresh();
    });

  return (
    <>
      {anzahl > 0 && (
        <div className="toolbar" style={{ gap: 10, margin: "0 0 10px", alignItems: "center" }}>
          <strong>{anzahl} ausgewählt</strong>
          <button type="button" className="bd-btn bd-btn-primary" disabled={pending} onClick={() => buchen(false)}>
            als gebucht markieren
          </button>
          <select
            className="bd-field-input"
            style={{ width: 190 }}
            disabled={pending}
            value=""
            onChange={(e) => zahlart(e.target.value)}
            title="Zahlart für alle markierten Belege setzen"
          >
            <option value="">Zahlart setzen …</option>
            <option value="card">Kreditkarte</option>
            <option value="paypal">PayPal</option>
            <option value="transfer">Überweisung</option>
            <option value="direct_debit">Lastschrift</option>
          </select>
          {bereit > 0 && bereit < anzahl && (
            <button type="button" className="bd-btn bd-btn-secondary" disabled={pending} onClick={() => buchen(true)}>
              nur die {bereit} „bereiten“ buchen
            </button>
          )}
        </div>
      )}
      {msg && <p className="bd-hint">{msg}</p>}

      {edit &&
        createPortal(
          <div
            onClick={() => setEdit(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12vh 3vw" }}
          >
            <div onClick={(e) => e.stopPropagation()} className="bd-card" style={{ margin: 0, padding: 16, width: "min(420px, 94vw)" }}>
              <strong>Konto für alle Positionen</strong>
              <div className="bd-field" style={{ marginTop: 10 }}>
                <AccountPicker value={konto} onChange={setKonto} accounts={konten} placeholder="— Konto wählen —" />
              </div>
              <div className="toolbar" style={{ gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="bd-btn bd-btn-primary"
                  disabled={!konto || pending}
                  onClick={() =>
                    start(async () => {
                      await setzeKontoAlle(edit.id, konto);
                      setEdit(null);
                      router.refresh();
                    })
                  }
                >
                  Konto setzen
                </button>
                <button type="button" className="bd-btn bd-btn-secondary" onClick={() => setEdit(null)}>Abbrechen</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
