# @werk/db

Supabase-Schema als versionierte SQL-Migrationen.

## Struktur

```
supabase/
  migrations/
    20260828120000_foundation.sql   # Slice 1: Fundament
  seed.sql                          # nur lokal (supabase db reset)
  config.toml                       # von `supabase init` erzeugt (nicht eingecheckt bis init)
```

## Konventionen

- **Eine Migration je Slice/Thema.** Nie eine bestehende Migration ändern, die
  schon irgendwo eingespielt wurde — stattdessen neue Migration.
- Dateiname: `YYYYMMDDHHMMSS_kurzbeschreibung.sql` (`pnpm new "<name>"`).
- **Referenzdaten** (Steuerschlüssel, Konten, Nummernkreise, DATEV-Defaults) gehören
  in die Migration (landen in prod). `seed.sql` ist nur Demo-/Testdaten für lokal.
- Jede belegführende / Stammdaten-Tabelle bekommt `updated_at`-Trigger + Audit-Trigger
  (`public.attach_standard_triggers(...)`) und `enable row level security`.
- RLS-Policies immer in derselben Migration wie die Tabelle.

## Befehle

| Befehl | Wirkung |
|---|---|
| `pnpm start` / `pnpm stop` | lokale Supabase (Docker) |
| `pnpm reset` | DB neu aufbauen: alle Migrationen + `seed.sql` |
| `pnpm new "<name>"` | neue leere Migration |
| `pnpm diff "<name>"` | Schema-Diff der laufenden lokalen DB als Migration schreiben |
| `pnpm push` | Migrationen ins verknüpfte Remote-Projekt spielen |
| `pnpm gen:types` | TypeScript-Typen → `packages/shared/src/database.types.ts` |

## Erstinstallation

Siehe [../../docs/setup.md](../../docs/setup.md).
