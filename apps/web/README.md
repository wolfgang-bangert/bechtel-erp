# apps/web

Admin-ERP (und später Kundenportal) — Next.js App Router.

## Start

```bash
cp .env.local.example .env.local   # Werte aus dem Supabase-Dashboard eintragen
pnpm install                        # aus dem Repo-Wurzelverzeichnis
pnpm --filter web dev
```

Läuft auf http://localhost:3000.

## Struktur

| Pfad | Zweck |
|---|---|
| `src/lib/supabase/*` | Supabase-Clients (Server, Browser, Middleware) |
| `src/lib/auth.ts` | Session- und Rollenprüfung |
| `middleware.ts` | schützt alle Seiten außer `/login` |
| `src/app/login` | Anmeldung (E-Mail + Passwort) |
| `src/app/(app)` | angemeldeter Bereich (Rolle `is_staff`) |
| `src/app/(app)/einstellungen` | Kontenverwaltung: Sachkonten, Steuerschlüssel |

## Erststart

Es muss ein Auth-Benutzer existieren **und** dazu eine Zeile in `app_user`
plus eine Rolle in `user_role`. Siehe `docs/setup.md` Abschnitt „Ersten
Admin-Benutzer anlegen".
