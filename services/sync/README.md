# services/sync

Worker, der Fremdsysteme nach Supabase spiegelt. Nutzt den Supabase
**Service-Role-Key** (umgeht RLS) — nur serverseitig ausführen.

Konfiguration: `.env` im Repo-Wurzelverzeichnis
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KEYLINE_API_BASE`, `KEYLINE_API_KEY`).

## Befehle

```bash
pnpm --filter sync keyline:orgs       [--dry-run]   # Keyline-Organisationen
pnpm --filter sync keyline:addresses  [--dry-run]   # Keyline-Hauptadressen
pnpm --filter sync ninox:firmen       [--dry-run]   # Ninox-Firmen + Konsolidierung
pnpm --filter sync ninox:addresses    [--dry-run]   # Ninox-Adressen
pnpm --filter sync ninox:people       [--dry-run]   # Ninox-Kontakte
pnpm --filter sync keyline:orders     [--dry-run]   # Keyline-Aufträge + Positionen
pnpm --filter sync keyline:invoices   [--dry-run]   # Keyline-Rechnungen + Gutschriften + Positionen
pnpm --filter sync ninox:orders       [--dry-run]   # Ninox-Aufträge + Positionen
pnpm --filter sync ninox:invoices     [--dry-run]   # Ninox-Rechnungen + Positionen
pnpm --filter sync dedupe:orgs                      # Dubletten-Report (CSV, read-only)
pnpm --filter sync dedupe:merge       [--dry-run]   # Dubletten zusammenführen
pnpm --filter sync typecheck
```

Empfohlene Reihenfolge beim Erstlauf: `keyline:orgs` → `ninox:firmen` →
`keyline:addresses` → `ninox:addresses` → `ninox:people`. Alle idempotent.

Beide Läufe sind idempotent und in beliebiger Reihenfolge / wiederholt ausführbar.

## Keyline → Organisationen

- Quelle: `GET /customer_relations/organizations` (100/Seite, Header
  `x-keyline-results-total`)
- Ziel: `organization` + `organization_external_ref`
  (`system='keyline'`, `external_id` = Keyline-ID, `is_authoritative = true`)
- `customer_segment = 'akzidenz'`; `relation` aus debitor/creditor-Kennung
- Idempotent: neue Keyline-IDs werden angelegt, bekannte aktualisiert
- Fortschritt/Status in `external_sync_state` (`system='keyline'`, `resource='organizations'`)

## Ninox → Firmen (Kalenderkunden, Private Cloud)

- Quelle: Tabelle `L` „Firmen" der Ninox-DB (`bangert.ninoxdb.de`)
- **Konsolidierung** je Firma, in dieser Reihenfolge:
  1. bereits als `ninox`-Ref vorhanden → dieselbe Org
  2. `keylineOrgId` trifft eine bestehende `keyline`-Ref → **zusammenführen**
     (`customer_segment = 'mixed'`, Keyline bleibt führend, nur leere Felder ergänzt)
  3. `Debitorennummer` == `organization.customer_number` → zusammenführen
  4. `UST-ID` == `organization.vat_id` → zusammenführen
  5. sonst **neu** als `customer_segment = 'kalender'`, `ninox`-Ref führend
- `metadata` der Ref: Ninox-Kundennummer, Quelle, keyline_referenz, Rechnungs-Mail,
  Steuernummer, IBAN, Adresse (`Straße`/`PLZ`/`Ort`)
- Nummern-Kollisionen (Debitor/Kreditor bereits von anderer Org belegt) werden
  geloggt, die Nummer nicht übernommen

## Keyline → Hauptadressen

- `GET /customer_relations/organizations/{id}/addresses` je Org (nur Orgs mit
  `keyline`-Ref). Es wird **eine** Hauptadresse übernommen (Treffer über
  Namensähnlichkeit, sonst die älteste). Concurrency 4, Backoff bei HTTP 429.
- Ziel: `address` (`source='keyline'`, `external_id='keyline:<id>'`,
  `kind='general'`, erste je Org `is_default`).

## Ninox → Adressen

- Aus der Firmen-Tabelle: `Straße` / `Postleitzahl_old` / `Ort_old`, sonst als
  Fallback das JSON in `res_antwort_hauptadresse` (`street`/`postalCode`/`location`).
- Ziel: `address` (`source='ninox'`, `external_id='ninox:firmen-addr:<id>'`).
  `is_default` nur, wenn die Org noch keine Adresse hat (Keyline-Adresse hat Vorrang).
- Firmen ganz ohne Adressdaten werden übersprungen.

## Ninox → Kontakte

- Tabelle `ZB` „people". Firma über Feld `Firmen` → `organization_external_ref`
  (`ninox`, `L:<firmenId>`). Ziel: `contact` (`source='ninox'`,
  `external_id='ninox:people:<id>'`). Erster Kontakt je Org wird `is_primary`.
- Personen ohne auffindbare Firma werden übersprungen (im Sync-Status vermerkt).

## Aufträge & Rechnungen (Spiegel)

Ziel-Tabellen `sales_order` / `sales_order_item` / `sales_invoice` /
`sales_invoice_item` (Migration `20260829130000`). Geld in EUR (Keyline liefert
Cent → /100). Volle Quell-Payload in `raw` (jsonb). Verknüpfung zur Organisation
über die bestehenden `organization_external_ref`-Maps (nach Merge korrekt).

- **Keyline:** `sales/orders` (Positionen aus `products[]`),
  `accounting/customer_invoices` + `credit_notes` (Positionen aus
  `raw.line_items`). Rechnungsnummer oft leer (erst bei Festschreibung in Keyline).
- **Ninox:** Tabellen `MC`/`NC` (Aufträge/Positionen), `CE`/`DE`
  (Rechnungen/Positionen). Rechnungs-Summen aus den Positionen gerechnet
  (`Anzahl` × `Preis pro Einheit`, Steuer aus `Steuersatz in %`).
- „ohne Org" = Privatkunden bzw. in keinem Fremdsystem-Ref gefunden — im
  `external_sync_state` vermerkt.

Noch nicht abgebildet: Keyline-Kontakte (nur über Aufträge verfügbar);
Xano-Einmalimport.

## DATEV-Export

```bash
pnpm --filter sync datev:extf --from=2025-01-01 --to=2025-12-31 [--dry-run]
```

- EXTF-Buchungsstapel (Format 700 / v13, CP1252, CRLF) für **Ausgangsrechnungen**
  (Debitoren). Datei → `reports/datev/`, Protokoll → Tabelle `datev_export`.
- Buchung: Konto = Debitorennummer (`organization.customer_number`),
  Gegenkonto = Erlöskonto aus `setting datev.revenue_accounts` (SKR03,
  je Steuersatz/Land). BU-Schlüssel leer (Automatikkonten) — **vom Steuerberater
  bestätigen lassen**, ebenso ein Test-Import.
- Übersprungen werden: Entwürfe ohne Rechnungsnummer, Rechnungen ohne bzw. mit
  ungültiger Debitorennummer (nicht 5-stellig im Bereich 10000–69999).
- Konfiguration in `.env`: `DATEV_BERATER_NR`, `DATEV_MANDANTEN_NR`,
  `DATEV_WJ_BEGINN` (DDMM), `DATEV_SACHKONTO_LEN`.

## Bank (CAMT.053 + Abgleich)

```bash
pnpm --filter sync bank:import --file=auszug.xml [--dry-run]   # Kontoauszug importieren
pnpm --filter sync bank:match [--dry-run]                      # Umsätze -> offene Rechnungen
```

- `bank:import`: parst CAMT.053 (ISO 20022), legt je IBAN ein `bank_account` an,
  importiert Umsätze nach `bank_transaction` (Dedup über Hash). Vorzeichen:
  + Gutschrift, − Lastschrift.
- `bank:match`: sucht im Verwendungszweck nach Rechnungsnummern offener
  Ausgangsrechnungen; bei Betragsgleichheit automatische Zuordnung
  (`bank_transaction_match`, `auto=true`). Ein DB-Trigger führt `paid_total` /
  `payment_status` / `open_amount` auf `sales_invoice` nach.
- Nicht eindeutige Fälle bleiben `unmatched` → manuelle Zuordnung im Web (folgt).

## Rechnungs-PDFs (`pdf:invoices`)

```bash
pnpm --filter sync pdf:invoices [--limit=N] [--dry-run]
```

Holt festgeschriebene Keyline-Rechnungen als PDF (`Accept: application/pdf`) bzw.
Ninox-Anhänge und legt sie in Hetzner Object Storage ab
(`ausgangsrechnungen/<jahr>/…`). Status je Rechnung in `sales_invoice.pdf_status`.
**Voraussetzung: Bucket `werk-dokumente` im Hetzner-Panel anlegen** + `S3_*` in `.env`.

### CSV-CAMT (Sparkasse / Volksbank)

`bank:import` erkennt XML (CAMT.053) und das Sparkassen-CSV automatisch.
CSV: ISO-8859-1, Spalten `Auftragskonto;Buchungstag;…;Verwendungszweck;…;Betrag;…`.
Der SEPA-Feldsalat im Verwendungszweck wird zerlegt (`SVWZ+` = Zweck, `EREF+` =
Referenz). Vorgemerkte Umsätze werden übersprungen (`--include-pending` überschreibt).

`bank:match` erkennt zusätzlich **Skonto** (Zahlbetrag bis ~4,5 % unter offen) und
**Sammelzahlungen** (Summe mehrerer Rechnungsnummern = Zahlbetrag). Skonto-Fälle
bleiben mit kleinem Restbetrag „teilbezahlt" — die Skonto-Buchung macht der
Steuerberater.
