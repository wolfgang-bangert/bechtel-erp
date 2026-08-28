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
pnpm --filter sync dedupe:orgs                      # Dubletten-Report (CSV, read-only)
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

Noch nicht abgebildet: Keyline-Kontakte (nur über Aufträge verfügbar),
Aufträge, Rechnungen; Xano-Einmalimport.
