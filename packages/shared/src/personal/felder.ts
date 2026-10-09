/**
 * Felder der Personaltabelle (public.personal) - eine Quelle für den einmaligen Ninox-Import
 * (services/sync personal:import), die Detailansicht und das Bearbeiten in werk.
 * Herkunft: Ninox Team GL, DB "check", Tabelle "Personalübersicht" (Feldname = `ninox`).
 */
export type PersonalFeldTyp = "text" | "mehrzeilig" | "datum" | "zahl" | "betrag" | "ja_nein" | "email";

export type PersonalFeld = {
  spalte: string;
  label: string;
  typ: PersonalFeldTyp;
  gruppe: PersonalGruppe;
  ninox?: string;
  /** sensibel: in der Detailansicht erst nach Klick sichtbar (Bank, Steuer, SV, Gesundheit, Konfession) */
  sensibel?: boolean;
};

export const PERSONAL_GRUPPEN = [
  "Person",
  "Kontakt",
  "Anstellung",
  "Vergütung",
  "Bank",
  "Steuer",
  "Sozialversicherung",
  "Vorsorge",
  "Intern",
] as const;
export type PersonalGruppe = (typeof PERSONAL_GRUPPEN)[number];

export const PERSONAL_FELDER: PersonalFeld[] = [
  { spalte: "personalnummer", label: "Personalnummer", typ: "zahl", gruppe: "Person", ninox: "Personalnummer" },
  { spalte: "anrede", label: "Anrede", typ: "text", gruppe: "Person", ninox: "Anrede" },
  { spalte: "vorname", label: "Vorname", typ: "text", gruppe: "Person", ninox: "Vorname" },
  { spalte: "nachname", label: "Nachname", typ: "text", gruppe: "Person", ninox: "Nachname" },
  { spalte: "geburtsdatum", label: "Geburtsdatum", typ: "datum", gruppe: "Person", ninox: "Geburtsdatum" },
  { spalte: "geburtsort", label: "Geburtsort", typ: "text", gruppe: "Person", ninox: "Geburtsort" },
  { spalte: "staatsangehoerigkeit", label: "Staatsangehörigkeit", typ: "text", gruppe: "Person", ninox: "Staatsangehörigkeit" },
  { spalte: "aufenthaltstitel", label: "Aufenthaltstitel", typ: "text", gruppe: "Person", ninox: "Aufenthaltstitel" },
  { spalte: "familienstand", label: "Familienstand", typ: "text", gruppe: "Person", ninox: "Familienstand" },
  { spalte: "kinder", label: "Kinder", typ: "mehrzeilig", gruppe: "Person", ninox: "Kinder" },

  { spalte: "strasse", label: "Straße", typ: "text", gruppe: "Kontakt", ninox: "Straße" },
  { spalte: "hausnummer", label: "Hausnummer", typ: "text", gruppe: "Kontakt", ninox: "Hausnummer" },
  { spalte: "plz", label: "PLZ", typ: "text", gruppe: "Kontakt", ninox: "PLZ" },
  { spalte: "ort", label: "Ort", typ: "text", gruppe: "Kontakt", ninox: "Ort" },
  { spalte: "land", label: "Land", typ: "text", gruppe: "Kontakt", ninox: "Land" },
  { spalte: "privat_email", label: "Private E-Mail", typ: "email", gruppe: "Kontakt", ninox: "Private Email" },
  { spalte: "privat_telefon", label: "Privates Telefon", typ: "text", gruppe: "Kontakt", ninox: "Privates Telefon" },
  { spalte: "privat_mobil", label: "Privates Mobiltelefon", typ: "text", gruppe: "Kontakt", ninox: "Privates Mobiltelefon" },
  { spalte: "email", label: "Geschäftliche E-Mail", typ: "email", gruppe: "Kontakt", ninox: "Geschäftliche Email" },
  { spalte: "telefon", label: "Geschäftliches Telefon", typ: "text", gruppe: "Kontakt", ninox: "Geschäftliches Telefon" },
  { spalte: "mobil", label: "Geschäftliches Mobiltelefon", typ: "text", gruppe: "Kontakt", ninox: "Geschäftliches Mobiltelefon" },
  { spalte: "notfall_name", label: "Notfallkontakt", typ: "text", gruppe: "Kontakt", ninox: "Name des Notfallkontakts" },
  { spalte: "notfall_telefon", label: "Telefon Notfallkontakt", typ: "text", gruppe: "Kontakt", ninox: "Telefon des Notfallkontakts" },

  { spalte: "status", label: "Status", typ: "text", gruppe: "Anstellung", ninox: "Status" },
  { spalte: "position", label: "Position", typ: "text", gruppe: "Anstellung", ninox: "Position" },
  { spalte: "taetigkeit", label: "Vereinbarte Tätigkeit", typ: "text", gruppe: "Anstellung", ninox: "Vereinbarte Tätigkeit" },
  { spalte: "standort", label: "Standort", typ: "text", gruppe: "Anstellung", ninox: "Name des Standortes" },
  { spalte: "abteilung", label: "Abteilung", typ: "text", gruppe: "Anstellung", ninox: "Name der Abteilung" },
  { spalte: "vorgesetzter", label: "Vorgesetzter", typ: "text", gruppe: "Anstellung", ninox: "Vorgesetzter" },
  { spalte: "einstellungsart", label: "Einstellungsart", typ: "text", gruppe: "Anstellung", ninox: "Einstellungsart" },
  { spalte: "dienstverhaeltnis", label: "Dienstverhältnis", typ: "text", gruppe: "Anstellung", ninox: "Dienstverhältnis" },
  { spalte: "eintritt", label: "Eintritt", typ: "datum", gruppe: "Anstellung", ninox: "Start" },
  { spalte: "austritt", label: "Austritt", typ: "datum", gruppe: "Anstellung" },
  { spalte: "arbeitszeitmodell", label: "Vollzeit / Teilzeit", typ: "text", gruppe: "Anstellung", ninox: "Vollzeit / Teilzeit" },
  { spalte: "befristung", label: "Unbefristet / Befristet", typ: "text", gruppe: "Anstellung", ninox: "Unbefristet / Befristet" },
  { spalte: "probezeit", label: "Probezeit", typ: "text", gruppe: "Anstellung", ninox: "Probezeit" },
  { spalte: "wochenstunden", label: "Wochenarbeitsstunden", typ: "zahl", gruppe: "Anstellung", ninox: "Wochenarbeitsstunden" },
  { spalte: "urlaubstage", label: "Urlaubstage pro Jahr", typ: "zahl", gruppe: "Anstellung", ninox: "Urlaubstage pro Jahr" },

  { spalte: "gehalt_brutto", label: "Gehalt (brutto)", typ: "betrag", gruppe: "Vergütung", ninox: "Gehalt (brutto)", sensibel: true },
  { spalte: "gehalt_zeitraum", label: "Zeitraum Gehalt", typ: "text", gruppe: "Vergütung", ninox: "Zeitraum Gehalt" },
  { spalte: "lohnarten", label: "Lohnarten", typ: "mehrzeilig", gruppe: "Vergütung", ninox: "Lohnart", sensibel: true },

  { spalte: "zahlungsempfaenger", label: "Zahlungsempfänger", typ: "text", gruppe: "Bank", ninox: "Zahlungsempfänger", sensibel: true },
  { spalte: "iban", label: "IBAN", typ: "text", gruppe: "Bank", ninox: "IBAN", sensibel: true },
  { spalte: "bic", label: "BIC", typ: "text", gruppe: "Bank", ninox: "BIC", sensibel: true },

  { spalte: "steuer_id", label: "Steuer-IdNr.", typ: "text", gruppe: "Steuer", ninox: "Steuer-IdNr.", sensibel: true },
  { spalte: "steuerklasse", label: "Steuerklasse", typ: "text", gruppe: "Steuer", ninox: "Steuerklasse", sensibel: true },
  { spalte: "kinderfreibetrag", label: "Kinderfreibetrag", typ: "text", gruppe: "Steuer", ninox: "Kinderfreibetrag", sensibel: true },
  { spalte: "konfession", label: "Kirchenzugehörigkeit", typ: "text", gruppe: "Steuer", ninox: "Kirchenzugehörigkeit", sensibel: true },
  { spalte: "minijob_besteuerung", label: "Besteuerung Minijob / kurzfristig", typ: "text", gruppe: "Steuer", ninox: "Besteuerung des Minijobs/der kurzfristigen Beschäftigung", sensibel: true },
  { spalte: "weitere_einkuenfte", label: "Weitere Einkünfte als Arbeitnehmer", typ: "text", gruppe: "Steuer", ninox: "Weitere Einkünfte als Arbeitnehmer", sensibel: true },

  { spalte: "sozialversicherung", label: "Sozialversicherung", typ: "text", gruppe: "Sozialversicherung", ninox: "Sozialversicherung", sensibel: true },
  { spalte: "sv_nummer", label: "Sozialversicherungsnummer", typ: "text", gruppe: "Sozialversicherung", ninox: "Sozialversicherungsnummer", sensibel: true },
  { spalte: "rv_befreiung", label: "RV-Befreiung (Minijob)", typ: "ja_nein", gruppe: "Sozialversicherung", ninox: "Rentenversicherungsbefreiung (nur bei Minijobs)", sensibel: true },
  { spalte: "krankenversicherung", label: "Krankenversicherung", typ: "text", gruppe: "Sozialversicherung", ninox: "Krankenversicherung", sensibel: true },
  { spalte: "krankenkasse", label: "Krankenkasse", typ: "text", gruppe: "Sozialversicherung", ninox: "Name der Krankenversicherung", sensibel: true },
  { spalte: "pkv_beitrag", label: "Beitrag priv. Krankenversicherung", typ: "betrag", gruppe: "Sozialversicherung", ninox: "Beitragshöhe priv. Krankenversicherung", sensibel: true },
  { spalte: "ppv_beitrag", label: "Beitrag priv. Pflegeversicherung", typ: "betrag", gruppe: "Sozialversicherung", ninox: "Beitragshöhe priv. Pflegeversicherung", sensibel: true },
  { spalte: "grad_behinderung", label: "Grad der Behinderung", typ: "text", gruppe: "Sozialversicherung", ninox: "Grad der Behinderung", sensibel: true },

  { spalte: "bav", label: "Betriebliche Altersvorsorge", typ: "mehrzeilig", gruppe: "Vorsorge", ninox: "Betriebliche Altersvorsorge", sensibel: true },
  { spalte: "vwl", label: "Vermögenswirksame Leistungen", typ: "mehrzeilig", gruppe: "Vorsorge", ninox: "Vermögenswirksame Leistungen", sensibel: true },
  { spalte: "beitrag_firma", label: "Monatlicher Beitrag der Firma", typ: "betrag", gruppe: "Vorsorge", ninox: "Monatlicher Beitrag der Firma", sensibel: true },
  { spalte: "beitrag_mitarbeiter", label: "Monatlicher Beitrag des Mitarbeiters", typ: "betrag", gruppe: "Vorsorge", ninox: "Monatlicher Beitrag des Angestellten", sensibel: true },

  { spalte: "bereich", label: "Bereich (Akzidenz/Kalender)", typ: "text", gruppe: "Intern", ninox: "Auswahl" },
  { spalte: "neue_struktur", label: "Neue Struktur", typ: "text", gruppe: "Intern", ninox: "NeueStruktur" },
  { spalte: "moegliche_verwendung", label: "Mögliche Verwendung", typ: "text", gruppe: "Intern", ninox: "mögliche Verwendung" },
  { spalte: "go", label: "GO", typ: "ja_nein", gruppe: "Intern", ninox: "GO" },
  { spalte: "ausklammern", label: "Ausklammern", typ: "ja_nein", gruppe: "Intern", ninox: "ausklammern" },
  { spalte: "notiz", label: "Beschreibung / Notiz", typ: "mehrzeilig", gruppe: "Intern", ninox: "Beschreibung" },
];

/** Ninox-Wert → Spaltenwert (Datum "YYYY-MM-DD", Zahlen, ja/nein, Text getrimmt; leer → null). */
export function ninoxWert(f: PersonalFeld, v: unknown): string | number | boolean | null {
  if (v === null || v === undefined || v === "") return null;
  switch (f.typ) {
    case "zahl":
    case "betrag": {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    case "ja_nein":
      return v === true || v === "true" || v === 1;
    case "datum": {
      const s = String(v);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
    }
    default: {
      const s = String(v).trim();
      return s ? s : null;
    }
  }
}

/** Formularwert → Spaltenwert (deutsche Zahlen "1.234,56" erlaubt). */
export function formWert(f: PersonalFeld, raw: string | null): string | number | boolean | null {
  if (f.typ === "ja_nein") return raw === "1" || raw === "on" || raw === "true";
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (f.typ === "zahl" || f.typ === "betrag") {
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return Number.isFinite(n) ? n : null;
  }
  if (f.typ === "datum") return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  return s;
}
