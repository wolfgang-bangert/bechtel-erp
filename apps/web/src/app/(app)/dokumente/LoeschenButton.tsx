"use client";

import { dokumentLoeschen } from "./actions";

export function LoeschenButton({ id }: { id: string }) {
  return (
    <form
      action={dokumentLoeschen}
      onSubmit={(e) => {
        if (!confirm("Dokument löschen?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="ghost" title="löschen">
        🗑
      </button>
    </form>
  );
}
