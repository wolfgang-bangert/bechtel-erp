# services/sync

Worker, der Fremdsysteme nach Supabase spiegelt. Nutzt den Supabase
**Service-Role-Key** (umgeht RLS) — nur serverseitig ausführen.

Konfiguration: `.env` im Repo-Wurzelverzeichnis
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KEYLINE_API_BASE`, `KEYLINE_API_KEY`).

## Befehle

```bash
pnpm --filter sync keyline:orgs --dry-run   # nur zählen, nichts schreiben
pnpm --filter sync keyline:orgs             # spiegeln
pnpm --filter sync typecheck
```

## Keyline → Organisationen

- Quelle: `GET /customer_relations/organizations` (100/Seite, Header
  `x-keyline-results-total`)
- Ziel: `organization` + `organization_external_ref`
  (`system='keyline'`, `external_id` = Keyline-ID, `is_authoritative = true`)
- `customer_segment = 'akzidenz'`; `relation` aus debitor/creditor-Kennung
- Idempotent: neue Keyline-IDs werden angelegt, bekannte aktualisiert
- Fortschritt/Status in `external_sync_state` (`system='keyline'`, `resource='organizations'`)

Noch nicht abgebildet: Keyline-`reference` (Kurzcode), Adressen, Kontakte,
Aufträge, Rechnungen — folgen als eigene Sync-Schritte. Dublettenabgleich mit
Ninox/Xano ist ein separater Konsolidierungsschritt.
