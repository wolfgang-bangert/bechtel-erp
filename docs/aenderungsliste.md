# Änderungsliste & offene Entscheidungen

Laufende Liste. Nichts hier blockiert den Fortschritt — wir arbeiten sie beim
Bauen ab. Format: `[ ]` offen · `[x]` erledigt · `→` Entscheidung/Notiz.

## Runde 1 — geklärt, in Migration eingearbeitet

- [x] **Rechnungsnummer-Format** `RE-2026-00001` (Jahres-Reset, 5-stellig),
  ebenso AN- / AB- / LS- / GS- / MA- / BE-.
- [x] **Eine `organization`** für Kunde + Lieferant (`relation`).
- [x] **Debitorennummer aus Keyline übernehmen**; Kunden ohne Keyline bekommen
  `next_number('customer_number')` ab 10000.
- [x] **Rollen** ergänzt: `shipping` (Versand, intern) und `supplier`
  (Lieferantenportal, Slice 8). Neuer enum: `admin/office/accounting/production/
  shipping/employee/customer/supplier`.
- [x] **Kontenverwaltung**: `tax_code` und `ledger_account` voll benutzerpflegbar,
  Systemeinträge via `is_system` geschützt. UI kommt in Slice 1b.
- [x] **Kalenderkunden**: Hoheit bei **Ninox** (Kalender-Vertrieb), nicht Keyline.
  Neu: `organization.customer_segment`, `organization_external_ref`,
  `external_sync_state` (mehrsystemfähig).

## Noch offen

- [ ] **Stammdaten-Konsolidierung** Keyline + Ninox + Xano → `organization`.
  Dublettenkriterium: USt-IdNr, sonst Name + PLZ? Gibt es eine „Leit-Liste"?
  (Plan in `architektur.md` §5a — bauen in Slice 2.)
- [ ] **SKR03-Konten & Steuerschlüssel** vom Steuerberater bestätigen lassen
  (Seed-Werte sind ein Vorschlag, im Admin erweiterbar).
- [ ] **DATEV**: Berater-/Mandantennummer, Sachkonto-Länge (4 vs. 8 Stellen),
  Wirtschaftsjahr-Beginn → in `datev_settings` eintragen.
- [ ] **Versand-Umfang**: reicht Lieferschein + Label + Tracking, oder auch
  Teillieferungen / Packstücke / Sammelversand? (Detail für Slice 8.)

## Zu klären vor den jeweiligen Slices

- [ ] **Sammelrechnung** (Slice 3): monatlich fix oder pro Kunde konfigurierbar?
- [ ] **Abschlagsrechnung** (Slice 3): mit Bezug zu `order_item`s oder freie Beträge?
- [ ] **Bankformat** (Slice 3): CAMT.053, MT940 oder CSV welcher Bank?
- [ ] **OCR-Dienst** für Belege (Slice 4): Anbieter/Verfahren festlegen (DSGVO, EU).
- [ ] **Wire-O-Optionsliste** (Slice 5): Tabelle in `datenmodell.md` Modul 4
  prüfen/ergänzen (Format, Umfang, Papier, Veredelung, Aufhänger, Register …).
- [ ] **Wire-O-Kostenmodell** (Slice 5): reale Werte für Klickpreis, Bogenpreise,
  Wire-O-Preise je Durchmesser, Bindezeit/Stück, Maschinenstundensatz, Marge.
- [ ] **Staffelmengen** (Slice 5): Standard-Stufen (25/50/100/250/500/1000/…?).
- [ ] **Zeiterfassung-Erfassung** (Slice 7): nur App oder auch festes Tablet-Terminal
  in der Produktion? Gleitzeit-/Arbeitszeitkonto-Regeln.
- [ ] **Kundenportal-Umfang** (Slice 6): Selbst-Registrierung oder nur Einladung?
  Dürfen Kunden nachbestellen / nur ansehen?
- [ ] **CHF-Rechnungen**: vorerst nein (alles EUR). Bei Bedarf früh melden.

## Erledigt

- [x] Stack: Supabase (Postgres) + Next.js + Expo, EU-Hosting. Kein Xano/WeWeb mehr.
- [x] Keyline bleibt für Sonderaufträge (Akzidenz); wird nach Supabase gespiegelt.
- [x] Kalenderkunden aus Ninox, Firmen-Altbestand aus Xano → alle in `organization`.
- [x] Fakturierung führend in werk (nicht in Keyline).
- [x] Codename `werk`, Supabase-Projekte `werk-dev` / `werk-prod`.
- [x] Slice 1: Fundament-Schema (`20260828120000_foundation.sql`) inkl. Runde-1-Änderungen.
- [x] Supabase-CLI (2.116) via npm in `packages/db`; `werk-dev` (Ref `mxdxgqmfnnxupsvtgvsb`) verbunden.
- [x] **2026-08-28: Migration nach `werk-dev` gepusht — Schema steht.**
- [x] **Slice 1b: `apps/web` (Next.js) — Login + Kontenverwaltung (Sachkonten,
  Steuerschlüssel). Build grün. pnpm-Workspace aktiv.**
- [ ] Slice 1b Rest: Kostenstellen, Nummernkreise, Firmenprofil bearbeitbar machen.
