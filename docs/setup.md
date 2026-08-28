# Setup

Ziel: die Werkzeugkette lauffähig machen und das Fundament-Schema (Slice 1) in
Supabase bringen.

## Voraussetzungen

| Werkzeug | Prüfen | Status |
|---|---|---|
| Node.js ≥ 20 | `node -v` | ✅ v22 (unter `~/.local/node/bin`) |
| npm | `npm -v` | ✅ mitgeliefert |
| Supabase CLI | wird als devDependency in `packages/db` installiert, Aufruf via `npx supabase …` | ✅ 2.116 |
| Docker Desktop | nur nötig für die **lokale** DB (`supabase start` / `db reset`) | ⬜ optional, später |

> pnpm ist noch nicht eingerichtet. Für Slice 1 reicht **npm**. Wenn wir die Apps
> bauen (`apps/web`, `apps/app`), stellen wir auf pnpm-Workspaces um.

## 1. Supabase-Projekte anlegen

Dashboard, Region **Frankfurt / eu-central-1**:

- `werk-dev` — Entwicklung ✅ angelegt (Ref `mxdxgqmfnnxupsvtgvsb`)
- `werk-prod` — Echtbetrieb (später, Pro-Plan wegen täglicher Backups)

Werte je Projekt: **Project Settings → General** (Reference ID) und
**Project Settings → API** (Project URL, `anon` key, `service_role` key).

## 2. CLI installieren & verbinden

```bash
cd packages/db
npm install
npx supabase login
npx supabase init          # -> supabase/config.toml (VS Code / IntelliJ: n)
npx supabase link --project-ref mxdxgqmfnnxupsvtgvsb
```

## 3. Schema nach werk-dev ausrollen

```bash
npx supabase db push
```

Kontrolle:

```bash
npx supabase migration list
```

Die Referenzdaten (Steuerschlüssel, SKR03-Konten, Nummernkreise) stehen in der
Migration und landen damit auch in `werk-dev`. `seed.sql` (Demo-Daten) läuft
**nur** lokal bei `supabase db reset`.

Für `werk-prod` später: `npx supabase link --project-ref <werk-prod-ref>` und
erneut `npx supabase db push`.

## 4. Umgebungsvariablen

```bash
cd "/Users/wolfgangbangert/neues ERP"
cp .env.example .env
```

`.env` mit den Werten aus dem Dashboard füllen. `.env` ist in `.gitignore`.

## 5. TypeScript-Typen generieren (gegen das verbundene Projekt, kein Docker nötig)

```bash
cd packages/db
npx supabase gen types typescript --linked > ../shared/src/database.types.ts
```

## 7. Ersten Admin-Benutzer anlegen

1. In Supabase → Authentication → Add user (E-Mail + Passwort).
2. Im SQL-Editor:

```sql
insert into public.app_user (id, kind, display_name, email)
select id, 'employee', 'Wolfgang Bangert', email from auth.users where email = 'DEINE-MAIL';

insert into public.user_role (user_id, role)
select id, 'admin' from auth.users where email = 'DEINE-MAIL';
```

## Nächste Schritte

Sobald das Fundament steht, folgen die App-Gerüste:

```bash
# apps/web
pnpm create next-app@latest apps/web --ts --app --tailwind --eslint --src-dir --use-pnpm

# apps/app
pnpm create expo-app@latest apps/app
```

Diese werden bewusst über die offiziellen CLIs erzeugt (nicht von Hand), damit sie
zur jeweils aktuellen Version passen. Reihenfolge und Umfang siehe
[architektur.md](architektur.md) §9.
