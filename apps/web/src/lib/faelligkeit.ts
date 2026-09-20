export type Gruppe = "heute" | "1tag" | "2-4" | "5plus" | "zukunft";

export const GRUPPEN: { key: Gruppe; label: string; cls: string }[] = [
  { key: "heute", label: "heute raus", cls: "due-heute" },
  { key: "1tag", label: "1 Tag überfällig", cls: "due-1" },
  { key: "2-4", label: "2–4 Tage überfällig", cls: "due-2-4" },
  { key: "5plus", label: "5+ Tage überfällig", cls: "due-5plus" },
  { key: "zukunft", label: "Zukunft", cls: "due-zukunft" },
];

/** Tage zwischen heute (00:00, Servertimezone Europe/Berlin) und Liefertermin. */
export function tageUeberfaellig(deliverIso: string): number {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const liefer = new Date(deliverIso);
  liefer.setHours(0, 0, 0, 0);
  return Math.round((heute.getTime() - liefer.getTime()) / 86400000);
}

export function gruppeVon(tage: number): Gruppe {
  if (tage < 0) return "zukunft";
  if (tage === 0) return "heute";
  if (tage === 1) return "1tag";
  if (tage <= 4) return "2-4";
  return "5plus";
}
