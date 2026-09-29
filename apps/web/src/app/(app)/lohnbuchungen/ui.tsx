"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtEur } from "@/lib/format";
import {
  uploadPayroll,
  linkPayrollBooking,
  linkPayrollBookingGroup,
  type UploadState,
  type LinkState,
} from "./actions";

const emptyUpload: UploadState = {};

/** CSV/EXTF-Datei vom Lohnabrechner hochladen - springt nach Erfolg direkt
 *  auf die Detailseite des neuen Imports. */
export function UploadForm() {
  const [state, action, pending] = useActionState(uploadPayroll, emptyUpload);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.importId) router.push(`/lohnbuchungen/${state.importId}`);
  }, [state.ok, state.importId, router]);

  return (
    <form action={action} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <input type="file" name="file" accept=".csv,.txt" required />
      <button type="submit" disabled={pending}>
        {pending ? "wird importiert…" : "importieren"}
      </button>
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

const emptyLink: LinkState = {};

export function LinkBookingForm({
  bookingId,
  txId,
  label,
}: {
  bookingId: string;
  txId: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(linkPayrollBooking, emptyLink);

  return (
    <form action={action} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="tx_id" value={txId} />
      <button type="submit" className="ghost" disabled={pending} style={{ padding: "3px 8px", fontSize: 12 }}>
        {pending ? "…" : `✓ ${label}`}
      </button>
      {state.error && (
        <span className="msg-err" style={{ fontSize: 11 }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mehrere Bankzeilen auf einmal mit einer Lohnbuchung verknüpfen - für den
 *  Fall, dass eine Sammelzeile im Buchungsstapel (z.B. "Abzuführende
 *  SV-Beiträge") auf dem Konto in mehrere einzelne Zahlungen zerfällt (je
 *  Krankenkasse eine). Checkbox-Liste mit laufender Summe statt Rateversuch
 *  per Algorithmus - der Nutzer entscheidet, welche Zeilen zusammengehören. */
export function GroupLinkForm({
  bookingId,
  targetAmount,
  candidates,
}: {
  bookingId: string;
  targetAmount: number;
  candidates: { id: string; label: string; amount: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(linkPayrollBookingGroup, emptyLink);

  if (!open) {
    return (
      <button
        type="button"
        className="ghost"
        onClick={() => setOpen(true)}
        style={{ padding: "3px 8px", fontSize: 12 }}
      >
        + mehrere Bankzeilen auswählen
      </button>
    );
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sum = r2(candidates.filter((c) => selected.has(c.id)).reduce((s, c) => s + Math.abs(c.amount), 0));
  const diff = r2(targetAmount - sum);
  const matches = Math.abs(diff) <= 0.02;

  return (
    <form action={action} style={{ display: "block" }}>
      <input type="hidden" name="booking_id" value={bookingId} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="tx_ids" value={id} />
      ))}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 10,
          maxWidth: 460,
          background: "var(--bg)",
        }}
      >
        <div style={{ maxHeight: 220, overflow: "auto" }}>
          {candidates.map((c) => (
            <label
              key={c.id}
              style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "3px 0" }}
            >
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              {c.label}
            </label>
          ))}
          {!candidates.length && <p className="count">Keine offenen Bankzeilen im Zeitraum.</p>}
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }} className={matches ? "msg-ok" : "count"}>
          Ausgewählt: {fmtEur(sum)} · Ziel: {fmtEur(targetAmount)} · Diff: {fmtEur(diff)}
          {matches && " · passt ✓"}
        </div>
        <div className="toolbar" style={{ gap: 8, marginTop: 8 }}>
          <button type="submit" disabled={pending || selected.size === 0} style={{ padding: "5px 10px" }}>
            {pending ? "…" : `${selected.size} Zeile${selected.size === 1 ? "" : "n"} verknüpfen`}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setOpen(false);
              setSelected(new Set());
            }}
            style={{ padding: "5px 10px" }}
          >
            Abbrechen
          </button>
          {state.error && <span className="msg-err">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}
