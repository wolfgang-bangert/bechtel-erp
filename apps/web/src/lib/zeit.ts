/**
 * Zeiterfassung: Umrechnung Europe/Berlin ↔ UTC und Summen. zeit_eintrag speichert timestamptz;
 * angezeigt und eingegeben wird immer deutsche Ortszeit (inkl. Sommer-/Winterzeit).
 */
export const TZ = "Europe/Berlin";

export type ZeitEintrag = {
  id: string;
  personal_id: string;
  beginn: string;
  ende: string | null;
  ende_grund: "pause" | "feierabend" | null;
  quelle: "stempel" | "manuell";
  notiz: string | null;
};

const teile = (d: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

/** Datum in deutscher Ortszeit als "YYYY-MM-DD". */
export function berlinTag(iso: string | Date): string {
  const t = teile(typeof iso === "string" ? new Date(iso) : iso);
  return `${t.year}-${t.month}-${t.day}`;
}

/** Uhrzeit in deutscher Ortszeit "HH:MM". */
export function berlinUhr(iso: string): string {
  const t = teile(new Date(iso));
  return `${t.hour}:${t.minute}`;
}

/** Für <input type="datetime-local">: "YYYY-MM-DDTHH:MM" in deutscher Ortszeit. */
export function berlinLokal(iso: string): string {
  return `${berlinTag(iso)}T${berlinUhr(iso)}`;
}

/** "YYYY-MM-DDTHH:MM" (deutsche Ortszeit) → ISO-UTC. */
export function berlinZuIso(lokal: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(lokal)) return null;
  const alsUtc = new Date(`${lokal}:00Z`);
  // Versatz Berlin↔UTC zu diesem Zeitpunkt (zweimal, damit die Umstellungsnacht stimmt)
  let ziel = alsUtc.getTime();
  for (let i = 0; i < 2; i++) {
    const t = teile(new Date(ziel));
    const angezeigt = Date.UTC(+t.year, +t.month - 1, +t.day, +t.hour, +t.minute, +t.second);
    ziel += alsUtc.getTime() - angezeigt;
  }
  return new Date(ziel).toISOString();
}

/** Minuten eines Blocks (offener Block: bis jetzt). */
export function minuten(e: Pick<ZeitEintrag, "beginn" | "ende">, jetzt = new Date()): number {
  const ende = e.ende ? new Date(e.ende) : jetzt;
  return Math.max(0, Math.round((ende.getTime() - new Date(e.beginn).getTime()) / 60000));
}

/** 485 → "8:05 h" */
export function fmtStunden(min: number): string {
  const v = min < 0 ? "−" : "";
  const m = Math.abs(Math.round(min));
  return `${v}${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
}

/** Pausen = Lücken zwischen den Blöcken eines Tages (in Minuten). */
export function pausenMinuten(bloecke: Pick<ZeitEintrag, "beginn" | "ende">[]): number {
  const s = [...bloecke].sort((a, b) => a.beginn.localeCompare(b.beginn));
  let p = 0;
  for (let i = 1; i < s.length; i++) {
    const vorher = s[i - 1].ende;
    if (vorher) p += Math.max(0, Math.round((new Date(s[i].beginn).getTime() - new Date(vorher).getTime()) / 60000));
  }
  return p;
}

/**
 * Hinweise nach Arbeitszeitgesetz je Tag: > 10 h Arbeit; > 6 h ohne 30 min Pause; > 9 h ohne 45 min Pause.
 * Nur Hinweise - werk verhindert nichts.
 */
export function arbZgHinweise(arbeit: number, pause: number): string[] {
  const h: string[] = [];
  if (arbeit > 600) h.push("mehr als 10 h");
  else if (arbeit > 540 && pause < 45) h.push("über 9 h, Pause unter 45 min");
  else if (arbeit > 360 && pause < 30) h.push("über 6 h, Pause unter 30 min");
  return h;
}

export const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "YYYY-MM-DD" → "Mo 05.10." */
export function fmtTag(tag: string): string {
  const [y, m, d] = tag.split("-").map(Number);
  const wt = WOCHENTAG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wt} ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}
