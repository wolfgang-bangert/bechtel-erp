# werk

Zentrale Datenbasis für die Druckerei: ERP-Kern, vorbereitende Buchhaltung,
Mitarbeiter-App und Kundenportal — auf einer PostgreSQL-Datenbank (Supabase).

## Monorepo

| Pfad | Inhalt |
|---|---|
| `docs/` | [Architektur](docs/architektur.md) · [Datenmodell](docs/datenmodell.md) · [Setup](docs/setup.md) · [Änderungsliste](docs/aenderungsliste.md) |
| `packages/db` | Supabase-Schema als SQL-Migrationen, Seed, generierte Typen |
| `packages/shared` | Geteilte TypeScript-Typen und Logik (Steuer, Preise) |
| `apps/web` | Next.js — Admin-ERP + Kundenportal *(folgt)* |
| `apps/app` | Expo — Mitarbeiter-App *(folgt)* |
| `services/sync` | Sync-Worker Keyline/Ninox → Supabase, Xano-Import *(folgt)* |

## Stand

Slice 1 (Fundament) — Schema für Auth/Rollen/RLS, Stammdaten-Kern, Steuer- &
Nummernkreis-Basis, Audit-Log. Siehe [Änderungsliste](docs/aenderungsliste.md)
für den Fahrplan.

## Loslegen

Siehe [docs/setup.md](docs/setup.md).
