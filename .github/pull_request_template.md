## Was & warum


## Betroffen
- [ ] `apps/web`
- [ ] `services/sync`
- [ ] `packages/db` (Migration)
- [ ] `packages/shared` (opri-Auflösung / Job-Erzeugung — zentrale Quelle, keine Kopien)

## Geprüft
- [ ] `pnpm --filter web exec tsc --noEmit`
- [ ] `pnpm --filter sync typecheck`
- [ ] `pnpm --filter web build`
- [ ] Migration additiv, `pnpm db:push` gegen werk-dev gelaufen
- [ ] Bei Änderungen an der opri-Auflösung: A/B gegen `git HEAD` auf werk-dev geprüft (Ergebnis identisch)

## Hinweise für den Review


🤖 Generated with [Claude Code](https://claude.com/claude-code)
