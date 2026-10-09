/**
 * Module für die Rechtevergabe (Vertrieb, Onlineprinters, Buchhaltung, Versand, Werkzeuge,
 * Einstellungen, Personal) und die Zuordnung von Seiten/Routen zu einem Modul. Reine Logik ohne
 * Abhängigkeiten - wird von Middleware, Navigation und Mitarbeiter-Verwaltung genutzt.
 */
export const MODULES = [
  { key: "vertrieb", label: "Vertrieb" },
  { key: "onlineprinters", label: "Onlineprinters" },
  { key: "buchhaltung", label: "Buchhaltung" },
  { key: "versand", label: "Versand" },
  { key: "werkzeuge", label: "Werkzeuge" },
  { key: "einstellungen", label: "Einstellungen" },
  // Personal: Admins haben es NICHT automatisch, nur ausdrücklich Freigegebene (siehe has_personal_access())
  { key: "personal", label: "Personal" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export type ModuleLevel = "view" | "edit";
export type ModuleLevels = Partial<Record<ModuleKey, ModuleLevel>> & { admin?: boolean };

export const MODULE_LABEL: Record<ModuleKey, string> = Object.fromEntries(
  MODULES.map((m) => [m.key, m.label]),
) as Record<ModuleKey, string>;

const ERSTES_SEGMENT: Record<string, ModuleKey> = {
  organisationen: "vertrieb",
  produkte: "vertrieb",
  auftraege: "vertrieb",
  rechnungen: "vertrieb",
  druck: "vertrieb",
  druckauftraege: "onlineprinters",
  abrechnung: "onlineprinters",
  "offene-posten": "buchhaltung",
  eingangsrechnungen: "buchhaltung",
  bank: "buchhaltung",
  lohnbuchungen: "buchhaltung",
  "datev-vorschau": "buchhaltung",
  ustva: "buchhaltung",
  darlehen: "buchhaltung",
  zahlungen: "buchhaltung",
  dokumente: "buchhaltung",
  scannen: "buchhaltung",
  versand: "versand",
  werkzeuge: "werkzeuge",
  personal: "personal",
};

const API_SEGMENT: Record<string, ModuleKey> = {
  abrechnung: "onlineprinters",
  rechnung: "onlineprinters",
  ustva: "buchhaltung",
  zahlungen: "buchhaltung",
  "pdf-kombinieren": "werkzeuge",
  "pdf-seiten-verwalten": "werkzeuge",
};

const EINSTELLUNGEN_SONDER: Record<string, ModuleKey> = {
  preislisten: "onlineprinters",
  "opri-produkte": "onlineprinters",
  "opri-regeln": "onlineprinters",
  "batch-gruppierung": "vertrieb",
  standbogen: "vertrieb",
  materialkatalog: "vertrieb",
};

/**
 * Modul einer Route; "admin" = nur Admins, null = keine Modulprüfung (nur eingeloggte Mitarbeiter,
 * z. B. Startseite, Passwort ändern, Webhooks mit eigener Authentifizierung).
 */
export function moduleForPath(pathname: string): ModuleKey | "admin" | null {
  const seg = pathname.split("?")[0].split("/").filter(Boolean);
  if (!seg.length) return null;
  if (seg[0] === "api") return (seg[1] && API_SEGMENT[seg[1]]) || null;
  if (seg[0] === "einstellungen") {
    if (seg[1] === "passwort") return null;
    if (seg[1] === "mitarbeiter") return "admin";
    return (seg[1] && EINSTELLUNGEN_SONDER[seg[1]]) || "einstellungen";
  }
  return ERSTES_SEGMENT[seg[0]] ?? null;
}

export function darfAnsehen(levels: ModuleLevels, mod: ModuleKey | "admin" | null): boolean {
  if (mod == null) return true;
  if (mod === "admin") return levels.admin === true;
  return levels[mod] === "view" || levels[mod] === "edit";
}
