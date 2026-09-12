# CLAUDE.md — Arbeitskontext für werk

Kontext für Claude-Code-Sitzungen (auch Cloud/Handy). Ausführlich:
`docs/architektur.md`, `docs/datenmodell.md`, `docs/infrastruktur.md`,
`docs/aenderungsliste.md`.

## Was werk ist
Zentrale Datenbasis für die Druckerei Bechtel: ERP-Kern, vorbereitende Buchhaltung,
Druck-Workflow (Kundenportal Onlineprinters → Materialauflösung → Druckjobs →
Batches → flux/AccurioPro Flux). Ein PostgreSQL (Supabase).

## Monorepo
| Pfad | Inhalt |
|---|---|
| `apps/web` | Next.js 15 (App Router) + `@supabase/ssr` — Admin-ERP, später Portale |
| `packages/db` | Supabase-Schema als SQL-Migrationen |
| `packages/shared` | geteilte TS-Typen/Logik: `@werk/shared` (Steuer, opri-Auflösung, Job-Erzeugung) |
| `services/sync` | `tsx`-CLI: Portale, Keyline, Ninox, Banken (FinTS), BuchhaltungsButler, DATEV |

Node 22, pnpm 9.12 (`packageManager` im root). `pnpm install` im Repo-Root.

## Vor dem Abschließen immer prüfen
```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter sync typecheck
pnpm --filter web build
```
CI (`.github/workflows/ci.yml`) macht dasselbe bei jedem PR.

## Fallen (unbedingt beachten)

### Auflösung + Job-Erzeugung: eine Quelle in `packages/shared`
- Resolver: `packages/shared/src/opri/resolve.ts` — `resolveOne` (rein),
  `loadResolveRefData` / `loadGruppenMaps` (laden mit `SupabaseClient`),
  `resolvePortalOrder(sb, id)`. Web importiert über `@/lib/opri/resolve`
  (Re-Export), Worker über `services/sync/src/opriResolve.ts` (`resolveOpri`
  = Batch-Lauf + Rückschreiben).
- Job-Erzeugung: `packages/shared/src/druck/jobs.ts` — `erzeugeJobs(sb, id)`.
  Web über `@/lib/druck/materialize` (Re-Export), Worker in `jobsSync.ts`.
- Die alten gespiegelten Kopien (`services/sync/src/erzeugeJobs.ts`, doppelte
  Logik in `opriResolve.ts`) sind entfernt. **Logik nur noch in `packages/shared`
  ändern.** `@werk/shared` ist ein Workspace-Paket mit rohem TS; Web braucht
  dafür `transpilePackages: ["@werk/shared"]` (steht in `next.config.ts`).

### Datenbank
- Migrationen: `packages/db/supabase/migrations/<UTC-Zeitstempel>_name.sql`,
  additiv (`add column if not exists`, `on conflict do nothing`).
- `pnpm db:push` geht gegen **werk-dev** (Ref `mxdxgqmfnnxupsvtgvsb`). **Nie** von
  Hand gegen prod — prod-Migrationen laufen nur über `deploy.yml`.
- RLS: neue Tabellen bekommen `attach_standard_triggers` + Policies
  `is_staff()` (read) / `has_any_role(array['admin','office','production'])` (write).
  Muster: bestehende Migrationen (z. B. `20260909120000_faehigkeit.sql`).

### Secrets
- `.env` / `.env.*` **nie committen** (in `.gitignore`; `.env.example` ist die
  Referenz). Cloud-Sitzungen haben die Werte nicht — DB-Push/Integrationstests
  brauchen dort hinterlegte Umgebungs-Secrets.
- flux-`prefix` ist hart auf 5 alphanumerische Zeichen begrenzt →
  `fluxPrefix()` = letzte 5 Ziffern der Auftragsnummer.

## Konventionen
- **Deutsch**: UI-Texte, Kommentare, Commit-Messages.
- Commit-Messages enden mit:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- PR-Beschreibungen enden mit:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Nur committen/pushen, wenn der Nutzer es sagt. Auf `main` nie direkt —
  Branch → PR → CI grün → Review → Merge.

## Druck-Workflow (Kurzkarte)
Onlineprinters-Auftrag → `portal:pull` (`services/sync/src/cli.ts`) →
`pdf:analyse` → `opri:resolve` (Materialauflösung, `resolve_result` jsonb) →
`jobs:sync` (`erzeugeJobs`: 1 Druckjob je bedrucktem Bauteil, dazu cello/binden) →
Batches (Schlüssel aus `setting.batch_gruppierung`) → `/druck` Dashboard →
`sendeAuftragAnFlux` (`apps/web/src/lib/druck/flux.ts`) → `POST flux /createOrder`.
flux-Status zurück per `POST /api/flux/webhook`.
