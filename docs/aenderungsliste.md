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
- [x] **Keyline-Hauptadressen:** 765 `address`-Zeilen (`source='keyline'`),
  Migration `20260828140000`. Retry/Backoff bei Keyline-429 eingebaut.
- [x] **Ninox-Kontakte:** 2354 `contact`-Zeilen (`source='ninox'`),
  Migration `20260828150000`. 198 Personen ohne auffindbare Firma übersprungen.
- [x] **Ninox-Adressen:** 1518 `address`-Zeilen (`source='ninox'`), aus Firmen-
  Feldern bzw. `res_antwort_hauptadresse`. **Adressen jetzt: 2283** (765 Keyline +
  1518 Ninox), ~2161 Orgs mit Hauptadresse. 1690 Ninox-Firmen ohne Adressdaten.
- [x] **Dubletten-Report** (`pnpm --filter sync dedupe:orgs`, nur lesen → CSV in
  `reports/`): 3906 Orgs, 599 Verdachtsgruppen, davon 25 mit hoher Konfidenz
  (23 Name+PLZ, meist akzidenz×kalender-Paare, die die Konsolidierung nicht per
  keylineOrgId gefunden hat; 2 über USt-IdNr).
- [x] **Merge-Routine** gebaut (`merge_organization()` SQL-Funktion, atomar +
  `organization_merge`-Protokoll; CLI `dedupe:merge`). Ausgeführt:
  **3906 → 3655 Organisationen, 251 Zusammenführungen**, 0 Fehler. Danach keine
  hoch-konfidenten Verdachtsfälle mehr. Beim Merge fehlende `order`/`invoice`-
  Umhängung in der Funktion später ergänzen.
- [ ] **335 mittel-konfidente Verdachtsgruppen** (Namensgleichheit ohne PLZ-
  Bestätigung, `dedupe:orgs`-CSV) — manuell sichten, echte per
  `dedupe:merge --confidence=mittel --only=Gxx` zusammenführen.
- [x] **Aufträge + Rechnungen gespiegelt** (Migration `20260829130000`,
  Tabellen `sales_order`/`sales_order_item`/`sales_invoice`/`sales_invoice_item`,
  Geld in EUR, volle Quelle in `raw`):
  - Keyline: 16.756 Aufträge (20.636 Pos.), 11.821 Rechnungen inkl. 99 Gutschriften
    (18.552 Pos. aus `raw.line_items`)
  - Ninox: 5.010 Aufträge (13.743 Pos.), 3.414 Rechnungen (11.704 Pos.)
  - **Gesamt: 21.766 Aufträge · 15.235 Rechnungen · 34.379 + 30.256 Positionen**
  - ~514 Aufträge / 71 Rechnungen ohne Org-Zuordnung (Privatkunden), in
    `external_sync_state` vermerkt
  - `merge_organization()` hängt jetzt auch `sales_order`/`sales_invoice` um
- [x] **UI Aufträge/Rechnungen:** `/auftraege` + `/rechnungen` (Liste + Detail
  mit Positionen), Abschnitte auf der Org-Detailseite.
- [ ] **Slice 2 offen:** Keyline-Kontakte (nur über Aufträge verfügbar);
  Xano-Einmalimport; 335 mittlere Dubletten.

## Keyline-Abgleich

- [x] **Inkrementeller Sync.** Keyline v2 hat **keinen** Datumsfilter (alle
  Parameter werden ignoriert), aber `/accounting/customer_invoices` und
  `/sales/orders` liefern **nach `updated_at` absteigend**. `keyline:invoices`
  und `keyline:orders` laufen jetzt inkrementell ab `external_sync_state.
  last_run_at − 24 h` und brechen ab, sobald zwei Seiten komplett vor dem
  Stichtag liegen. Realmessung: ~3 Seiten statt 118, wenige Sekunden. `--full`
  erzwingt Vollscan, `--since=ISO` setzt den Stichtag manuell.
- [x] **`keyline:invoice --id=<keyline-id>`** — genau eine Rechnung nachziehen
  (1 API-Call, kein Scan). Für „Kollege hat in Keyline was geändert".
- [x] **`scripts/sync-keyline.sh`** + **`ops/de.bechtel.werk.keyline-sync.plist`**
  (launchd, alle 30 min, Log in `logs/`). Installieren:
  `cp "ops/de.bechtel.werk.keyline-sync.plist" ~/Library/LaunchAgents/ &&
  launchctl load ~/Library/LaunchAgents/de.bechtel.werk.keyline-sync.plist`
- [ ] **Webhook** erst nach Deployment von werk (braucht öffentliche URL); vorher
  prüfen, ob Keyline Webhooks anbietet.

## BuchhaltungsButler-Import (SKR03 + Debitoren)

- [x] **API-Client gebaut** (`services/sync/src/bbutler.ts` + `syncBButler.ts`).
  BB API v1: alle POST, Basic-Auth `client:secret`, `api_key` im Body wählt den
  Mandanten. Base `https://webservice.buchhaltungsbutler.de/api/v1` (per
  `BB_API_BASE` überschreibbar). Befehle: `bb:ping`, `bb:accounts`
  (`settings/get/postingaccounts`), `bb:debtors`, `bb:creditors`, `bb:postings`
  (`--from= --to=`). Jeder schreibt `imports/bb-<name>.{json,csv}`.
- [x] **Credentials da**, Base-URL `https://app.buchhaltungsbutler.de/api/v1`,
  JSON-Body. Gezogen: 2744 Konten, 1070 Debitoren, 492 Kreditoren →
  `imports/bb-*.{json,csv}`.
- [x] **Import** (`bb:import-accounts`, `bb:import-parties`):
  - 1209 SKR03-Sachkonten → `ledger_account` (jetzt 1210; `kind` aus
    Nummernkreis; 14 eigene Konten wie `3034 Materialaufwand Wire O` inklusive).
  - Geldkonto KSK Göppingen mit Sachkonto 1230 verknüpft (übrige Banken folgen
    bei `bank_account`-Anlage).
  - Debitorennummern: **1865 → 2012** (679 waren schon da, 188 per Name+PLZ
    zugeordnet, 37 Konflikte → BB gewann, `imports/bb-debitoren-konflikte.csv`).
  - Lieferantennummern: **353 → 405**.
  - **Offen zum Sichten:** 203 Debitoren / 207 Kreditoren in
    `imports/bb-debitoren-offen.csv` / `bb-kreditoren-offen.csv` (Privatpersonen,
    Namensvarianten, in BB abgeschnittene Namen).
- [x] Matcher nachgeschärft (Wortreihenfolge, in BB abgeschnittene Namen,
  Adresse PLZ+Hausnr+Straße). Offene Fälle → `imports/bb-*-zuordnung.csv`
  (Vorschlag + score, nach score sortiert, Spalte `UEBERNEHMEN`).
  Rücklauf per `bb:apply-parties --file=…`.
- [x] **185 fehlende Kreditoren als Lieferanten angelegt** (`bb:create-suppliers`,
  Migration `20260831130000` erlaubt `external_ref.system='buchhaltungsbutler'`).
  Orgs 3655→3840, `supplier_number` 405→598. 25 namensähnliche in
  `imports/bb-kreditoren-nicht-angelegt.csv`.
- [ ] **Rest manuell:** `imports/bb-debitoren-zuordnung.csv` (166) + die 25
  Kreditoren. Danach ist der Ausgangs-DATEV-Export nicht mehr durch fehlende
  Debitorennummern blockiert.
- [x] **Vorkontierung** (Migration `20260831140000`, `posting_rule`): aus 5 189
  BB-Buchungen (2023–2026) je Lieferant das häufigste Aufwandskonto + Steuersatz
  gelernt (`bb:learn-vorkontierung`) — **104 Regeln** (≥2 Belege, Konfidenz ≥ 0,5).
  Zuordnung über `organization.supplier_number`. Bsp.: Berberich→3032,
  Chr. Renz→3034 (Wire O), Colorpress→3001, Flyeralarm→3201, Entsorger→4969.
  `extractIncoming` füllt `ledger_account` + `tax_code_id` (Kopf + Positionen)
  beim Erfassen; 47/72 Bestandsrechnungen nachträglich vorkontiert. Manuelle
  Regeln werden nicht überschrieben. Review-CSV `imports/bb-vorkontierung.csv`.
- [ ] Kleine UI **Einstellungen → Vorkontierung** zum Sichten/Korrigieren der
  `posting_rule` (optional).
- [x] **DATEV-Export Eingangsrechnungen** (`datev:kreditor --from --to
  [--no-zip] [--include-extracted]`): EXTF-Buchungsstapel 700/13, Konto =
  Aufwandskonto (Position schlägt Kopf), Gegenkonto = Kreditor
  (`supplier_number`), Umsatz brutto, KOST1 aus Position/Aufteilung;
  Aufteilungen je (Konto, Steuerschlüssel, KOST, Satz) zusammengefasst.
  **ZIP** mit CSV + `belege/<Belegnummer>.pdf` aus Hetzner S3. Nach echtem
  Lauf: `datev_export` (scope=kreditor), Belege → `status='exported'`.
  `datevCommon.ts` als geteilte EXTF-Basis. Vorschau 07–09/2026: 47/72
  gebucht, 65 947 € brutto. **BU-Schlüssel** = `tax_code.datev_tax_key`
  (leer → Steuerberater bestätigen: Automatikkonto oder BU 9/8).
- [x] **Web `/datev-vorschau`**: alle Buchungssätze (Kreditor/Debitor, Zeitraum)
  zum Prüfen vor dem Export — Summen, Skip-Liste mit Gründen, Zeilen mit
  Konto+Name und Link zum Beleg. `lib/datevPreview.ts` rechnet dieselben Zeilen
  wie der CLI-Export.
- [ ] Web-Button „DATEV-Export herunterladen" (Zeitraum → CSV/ZIP) für beide
  Stapel — aktuell noch CLI.
- [ ] **Bank-/Zahlungs-Buchungsstapel** (`datev_export.scope='zahlungen'`) als
  dritter Monatsexport für den Steuerberater (mit OP-Ausgleich).
- [x] **Bank-Abgleich Soll-Seite** (Migration `20260901090000`,
  `syncBankMatchKreditor`): Abgänge auf dem Kontoauszug → Eingangsrechnung
  auf `paid`. Tiers: Rechnungsnr. im Verwendungszweck / Lieferant+Betrag /
  Zahlungsavis → referenzierte Rechnungen. Betrag = brutto oder brutto−Skonto.
  `bank:match --side=haben|soll|both`. Realtest KSK: 16 Zuordnungen, 15 ER
  bezahlt. `bank_transaction_match` kann jetzt auf sales_invoice ODER
  incoming_document zeigen.
- [ ] `/bank`-UI: Soll-Zuordnungen anzeigen/manuell setzen (bisher nur Haben).
- [ ] Sammelzahlung auf der Soll-Seite (eine Zahlung = mehrere ER-Nummern).

## Slice 3 — Fakturierung & DATEV

- [x] **DATEV EXTF-Buchungsstapel (Ausgangsrechnungen)** — `datev:extf`,
  Migration `20260829140000`. Format 700/v13, CP1252. Buchung Debitor gegen
  SKR03-Erlöskonto. Protokoll in `datev_export`.
- [ ] **Debitoren-Stammdaten bereinigen** — Testlauf März 2025: nur 55 von 128
  Rechnungen buchbar (56 ohne Debitorennummer, 6 ungültig, 11 Entwürfe). Der
  DATEV-Export ist erst nach Bereinigung der Debitorennummern brauchbar.
- [ ] Vom Steuerberater: `DATEV_BERATER_NR` / `DATEV_MANDANTEN_NR`,
  Sachkontenlänge, WJ-Beginn; Bestätigung Erlöskonten (8400/8300/8336/8120) +
  BU-Schlüssel-Ansatz; ein Test-Import.
- [ ] Web-Button „DATEV-Export" (Zeitraum → Download).
- [x] **Storage-Helfer (Hetzner S3)** + `pdf:invoices` — Keyline-PDF-Abruf
  verifiziert. **Wartet auf Bucket-Anlage `werk-dokumente` im Hetzner-Panel.**
- [x] **CAMT.053-Import + automatischer OP-Abgleich** (`bank:import`, `bank:match`;
  Migration `20260829170000`): `bank_account` / `bank_transaction` /
  `bank_transaction_match`, `sales_invoice.payment_status` + `open_amount`,
  Trigger führt Zahlbeträge nach. End-to-end getestet.
- [x] **Web-UI Buchhaltung:** `/offene-posten` (OP-Liste), `/bank` (Umsätze +
  automatische/manuelle Zuordnung, Zuordnung aufheben), „PDF öffnen" auf
  Rechnungsdetail (signierte Hetzner-S3-URL) + Zahlstatus.
- [x] Hetzner-Bucket `werk-dokumente` angelegt, S3 verifiziert; `pdf:invoices`
  läuft (Hintergrund) — holt alle festgeschriebenen Rechnungen als PDF.
- [x] **Sparkassen-CSV-Import** (`bank:import` erkennt XML/CSV autom.) + besserer
  OP-Abgleich: Skonto (bis ~4,5 %) und Sammelzahlungen. Realtest KSK Göppingen:
  88 Umsätze → 20 automatisch zugeordnet. Ninox-Rechnungsnummer als `<JJ>CE<id>`
  abgeleitet (**vom Nutzer bestätigen lassen**).
- [ ] Skonto-Fälle bleiben „teilbezahlt" mit Restbetrag — Skonto-Buchung/
  -Erkennung noch offen.
- [x] **Eingangsrechnungen** (Migration `20260830100000`: `incoming_document` +
  `incoming_document_item`): `mail:fetch` (IMAP → PDF-Anhänge → Hetzner S3 →
  `incoming_document`), `incoming:extract` (Claude `claude-sonnet-5`,
  positionsgenaue JSON-Extraktion + Lieferant-Zuordnung), Web `/eingangsrechnungen`
  Liste + Prüf-/Kontierungsansicht (PDF neben Formular).
- [ ] **IMAP-Verbindung klären**: `mail.your-server.de:993` erreichbar + TLS ok,
  aber Login wird zurückgesetzt → Passwort / IMAP-Freigabe für
  `rechnungen@bechtel-druck.de` in Hetzner KonsoleH prüfen.
- [x] `ANTHROPIC_API_KEY` in `.env` eingetragen. `incoming:extract` Vollstlauf:
  138 Belege extrahiert (positionsgenaue Positionen, Steueraufschlüsselung,
  Ø-Konfidenz hoch, 115 Lieferanten automatisch zugeordnet). 1 abgeschnittene
  Antwort → `max_tokens` 4000→16000 + `repairTruncatedJson`-Fallback.
- [x] **48 versehentlich zugestellte eigene Ausgangsrechnungen** (Absender
  `workflow@bangert-services.de`) per neuem `incoming:purge --from=<absender>`
  gelöscht (Zeilen + S3-PDFs). Bleiben 90 echte Eingangsbelege / 249 Positionen.
- [x] `mail:fetch` ignoriert jetzt Absender aus `IMAP_IGNORE_SENDERS`
  (Default: `workflow@bangert-services.de`) — markiert sie `\Seen`, kein Import.
- [x] **Zahlungs-/Lastschriftavis als eigener Belegtyp** (Migration
  `20260830110000`): `doc_type='payment_advice'`, `status='advice'`, neue Spalten
  `advice_reference text[]` (Rechnungsnummern, auf die sich das Avis bezieht) +
  `advice_debit_date`. `incoming:extract` erkennt Avis (KI + Betreff/Dateiname-
  Fallback `avis|lastschrift|einzugsavis|belastungsanzeige|…`), schreibt keine
  Positionen und hält sie aus der Rechnungs-Prüfliste raus. Web:
  `/eingangsrechnungen?status=advice` zeigt Avis mit „bezieht sich auf" +
  Belastungsdatum; Detailseite ohne Kontierung/Buchen-Buttons. 8 Altbelege
  reklassifiziert. **Nächster Schritt:** Kontoauszug-Abgleich der Lastschriften
  (Soll-Seite) über `advice_reference` → passende Eingangsrechnung auf `paid`.
- [x] **Redundante Receipts automatisch entfernen** (`incoming:prune-receipts`,
  läuft auch als Nachlauf von `incoming:extract`): viele SaaS-Anbieter (WEWEB,
  Anthropic, Celonis, Carbone …) schicken denselben Beleg doppelt als „receipt"
  + echte Rechnung. Ist eine Rechnung/Gutschrift mit gleicher Belegnummer da,
  wird der Receipt gelöscht (Zeile + S3), sofern noch `captured`/`extracted`.
  7 Altbelege entfernt.
- [x] **Mahnungen als eigener Belegtyp** (Migration `20260830120000`):
  `doc_type='dunning'`, `status='dunning'`, Spalte `forwarded_at`. `incoming:extract`
  erkennt Mahnung (KI + Fallback `mahnung|zahlungserinnerung|verzug|inkasso|…`),
  füllt `advice_reference` (angemahnte Rg), `extraction.dunning` (Stufe, Frist,
  Gebühr), keine Positionen, raus aus der Prüfliste. Web-Ansicht
  `?status=dunning`. 2 ETG-Mahnungen reklassifiziert.
- [x] **Eingangsrechnung: Prüf-/Kontierungs-UI ausgebaut** (Migration
  `20260830130000`):
  - **Fälligkeiten** ausgelesen: `discount_date` (Skonto-Termin), `discount_percent`,
    `discount_amount`, `net_due_date` (Netto-Termin). Fehlen Datumsangaben, werden
    sie aus Belegdatum + Tagen gerechnet.
  - **Abweichender Zahlungsempfänger** ausgelesen: `payee_differs`, `payee_name`,
    `payee_iban`, `payee_reason` (Insolvenzverwalter / Factoring / Inkasso /
    Abtretung). `supplier_iban` = IBAN laut Beleg (für „immer die aktuellste").
  - **Kontierung**: Kopf = Vorgabe (`ledger_account`/`tax_code_id`/`cost_center_id`),
    Position kann überschreiben (`incoming_document_item.tax_code_id`,
    `material_ref` als Freitext bis Materialverwaltung steht).
  - **Positions-Aufteilung** (neue Tabelle `incoming_document_allocation`):
    je Position beliebig viele anteilige Zuordnungen mit Betrag —
    `link_type` Auftrag (`sales_order_id`, aufgelöst über Auftragsnummer) /
    Material (`material_ref`) / Kostenstelle (`cost_center_id`). UI warnt, wenn
    Summe ≠ Positions-Netto.
  - `/eingangsrechnungen/[id]`: komplett editierbare Positionen (anlegen/löschen),
    PDF sticky daneben.
- [x] **Mahnungs-Weiterleitung per E-Mail** (`incoming:forward-dunning`, Nachlauf
  von `incoming:extract`): leitet erkannte Mahnungen an `DUNNING_FORWARD_TO`
  weiter, Original-PDF im Anhang, Betreff `WEITERLEITUNG VON
  rechnungen@bechtel-druck.de: <Original>`. `forwarded_at` verhindert
  Doppelversand. SMTP `mail.your-server.de:587` (STARTTLS) verifiziert, 2 ETG-
  Mahnungen live weitergeleitet. Ohne `SMTP_*`/`DUNNING_FORWARD_TO` inaktiv.
- [ ] **OCR-Anbieter entschieden:** Claude API (Anthropic), Modell
  `claude-sonnet-5` (Alternativ `claude-haiku-4-5`, ~½ Kosten). Kosten ~1–2 ct
  je Rechnung, ~5–10 €/Monat bei aktuellem Volumen; Batch-API −50 %. DSGVO:
  AVV in der Anthropic-Console zeichnen, optional später auf Claude via AWS
  Bedrock (Region Frankfurt) umstellen (Client-Tausch in `extractIncoming.ts`).
- [x] **FinTS-Anbindung** (vorgezogen): Kontoauszüge direkt von den Banken,
  kein Drittanbieter. `python-fints` im venv `services/sync/.fints-venv`,
  TS-Wrapper `src/fints.ts`. `imports/fints.txt` (4 Banken: KSK/VB Göppingen,
  BW-Bank, Oberbank — FinTS-URLs eingetragen), PIN in `.env` `FINTS_PIN_*`.
  `fints:setup --bank=ksk` (TAN-Verfahren wählen, `--user=` für alternativen
  Anmeldenamen), `fints:pull [--bank] [--days]` → gemeinsamer Import-/Dedup-Pfad
  mit `bank:import`, danach `bank:match`.
  - **KSK Göppingen: läuft** (TAN 923 S-pushTAN, Umsatzabruf SCA-frei).
  - **Volksbank / BW-Bank: `fints:setup` noch offen** (PIN in `.env`).
  - **Oberbank: geparkt** — `Could not find system_id` (python-fints ↔
    Bankverlag-HBCI-Tunnel). Vorerst manueller CAMT-Import; später EBICS oder
    direkter FinTS-Endpunkt.
  - Später: `fints:transfer` (SEPA-Überweisung mit TAN); launchd für täglichen
    `fints:pull`.
- [ ] FinTS-Produkt-ID bei der DK registrieren (`FINTS_PRODUCT_ID`).
- [ ] Slice 3 weiter: native Rechnung, Mahnwesen, Skonto-Ausbuchung.
- [ ] **~43 Nummern-Kollisionen** bereinigen (11 Keyline + 32 Ninox, überwiegend
  Kreditornummern 70xxx, die in beiden Systemen für vermutlich denselben
  Lieferanten stehen). Liste im Sync-Log.
- [ ] Entscheidung: bei `mixed`-Orgs bleibt **Keyline führend** — ok so, oder soll
  bei Kalender-Bezug Ninox gewinnen?
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
- [x] **OCR-Dienst** für Belege: Claude API (siehe Slice 3). AVV zeichnen,
  optional Bedrock Frankfurt für reine EU-Verarbeitung.
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
- [x] **Slice 1b: `apps/web` (Next.js) — Login + kompletter Einstellungsbereich:
  Sachkonten, Steuerschlüssel, Kostenstellen, Nummernkreise, Firmenprofil.
  Build grün. pnpm-Workspace aktiv.**
- [x] **Slice 2 (Teil 1): `services/sync` — 2451 Keyline-Organisationen nach
  `organization` + `organization_external_ref` gespiegelt** (`is_authoritative`,
  `metadata` mit keyline_reference/debitor/creditor/locale). Migration
  `20260828130000_external_ref_metadata.sql`. Lauf: `pnpm --filter sync keyline:orgs`.
- [x] **`apps/web` /organisationen: Liste (Suche, Filter, Pagination) + Detailansicht.**
- [x] **Ninox gelöst:** Private Cloud, Host `bangert.ninoxdb.de` (nicht `.com`).
- [x] **Slice 2 (Teil 2): Ninox-Firmen gespiegelt + mit Keyline konsolidiert.**
  3208 Firmen → 1455 neue Kalenderkunden + 1753 mit bestehender Org verknüpft
  (1700 über `keylineOrgId`, 52 Debitornr, 1 USt-IdNr). Gesamt jetzt **3906
  Organisationen** (740 akzidenz / 1455 kalender / 1711 mixed). 32 Nummern-
  Kollisionen geloggt. `keyline:orgs` überschreibt `customer_segment` nicht mehr.
  Lauf: `pnpm --filter sync ninox:firmen`.
