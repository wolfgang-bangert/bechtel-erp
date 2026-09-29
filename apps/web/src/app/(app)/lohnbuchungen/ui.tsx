"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { uploadPayroll, linkPayrollBooking, type UploadState, type LinkState } from "./actions";

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
