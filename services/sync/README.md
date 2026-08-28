# services/sync

Worker, der Fremdsysteme nach Supabase spiegelt. Nutzt den Supabase
**Service-Role-Key** (umgeht RLS) — nur serverseitig ausführen.

Konfiguration: `.env` im Repo-Wurzelverzeichnis
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KEYLINE_API_BASE`, `KEYLINE_API_KEY`).

## Befehle

```bash
pnpm --filter sync keyline:orgs [--dry-run]   # Keyline-Organisationen spiegeln
pnpm --filter sync ninox:firmen [--dry-run]   # Ninox-Firmen spiegeln + konsolidieren
pnpm --filter sync typecheck
```

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

Noch nicht abgebildet: Adressen als eigene `address`-Zeilen, Kontakte (`people`),
Aufträge, Rechnungen; Xano-Einmalimport.
