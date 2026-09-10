## Was & warum


## Betroffen
- [ ] `apps/web`
- [ ] `services/sync`
- [ ] `packages/db` (Migration)
- [ ] Doppel-Pflege beachtet (Resolver `resolve.ts` **+** `opriResolve.ts` / Job-Gen `materialize.ts` **+** `erzeugeJobs.ts`)

## Geprüft
- [ ] `pnpm --filter web exec tsc --noEmit`
- [ ] `pnpm --filter sync typecheck`
- [ ] `pnpm --filter web build`
- [ ] Migration additiv, `pnpm db:push` gegen werk-dev gelaufen

## Hinweise für den Review


🤖 Generated with [Claude Code](https://claude.com/claude-code)
