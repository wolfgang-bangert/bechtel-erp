# Infrastruktur – Produktivbetrieb

Stand: 2026-09-10. Zielbild für den Umstieg vom „läuft auf Wolfgangs Mac" auf
einen echten Serverbetrieb, sobald das erste Projekt (Druck-Workflow) produktiv
genutzt wird.

## Entscheidungen (fix)

| Frage | Entscheidung |
|---|---|
| Hosting | **eine Hetzner-Cloud-VM** mit Docker Compose (kein k8s, kein Vercel) |
| Erreichbarkeit | **offenes Internet** mit Login – später auch Kunden & Lieferanten |
| Quellcode | **GitHub** (`wolfgang-bangert/bechtel-erp`), CI/CD über GitHub Actions |
| Betrieb | zunächst Wolfgang allein; später ein zweiter Entwickler → alles reproduzierbar & dokumentiert |
| Alt-System (Mac) | **kein Fallback** – launchd-Agents wandern komplett auf die VM |

## Zielbild

```
Entwickler  ──git push──▶  GitHub  ──Actions──┬─▶ Supabase werk-prod   (db push)
                                              └─▶ SSH ▶ Hetzner-VM     (compose up -d --build)

                         Hetzner-VM (Nürnberg)         Supabase Cloud (Frankfurt)
                         ┌─────────────────────┐       ┌──────────────────────┐
   Internet ─443─▶ caddy │ TLS + Reverse Proxy │──────▶│ werk-prod            │
                         │  web   (Next.js)    │       │ Postgres + Auth + RLS│
                         │  sync  (Cron/CLI)   │──────▶└──────────────────────┘
                         └─────────┬───────────┘
                                   └──────────────▶ Hetzner S3  (werk-dokumente, nbg1)
                                   └──────────────▶ flux, Keyline, Onlineprinters, Banken …
```

Was **managed bleibt** (kein eigener Betrieb): Postgres, Auth, tägliche DB-Backups
(Supabase) und die Dateiablage (Hetzner S3). Selbst betrieben wird nur die eine VM.

## Bausteine

### `web` – Next.js (`apps/web`)
- Build zu `output: "standalone"` (`apps/web/next.config.ts`), Image `ops/Dockerfile.web`.
- Läuft intern auf `:3000`, nur über Caddy erreichbar.
- `NEXT_PUBLIC_*` werden **zur Build-Zeit** eingebacken → als Build-Args in `docker-compose.yml`.

### `sync` – Worker (`services/sync`)
- Image `ops/Dockerfile.sync`: Node + `tsx` + **Python-venv** für FinTS + `supercronic`.
- Cron-Plan in `ops/crontab` (ersetzt die drei launchd-Plists):
  - `portal:pull` täglich 05:30 · `keyline:*` alle 30 min · `mail:fetch`+`incoming:extract` stündlich · `fints:pull` 06:00
- Einmalige Läufe: `docker compose run --rm sync pnpm <script>`.
- Volumes von der VM: `imports/` (u. a. `fints.txt`, FinTS-State – gitignored), `logs/`, `reports/`.

### `caddy` – Reverse Proxy
- `ops/Caddyfile`, automatisches Let's-Encrypt-Zertifikat für `${WERK_DOMAIN}`.
- Security-Header (HSTS, nosniff, DENY-Frame). Zertifikate im Volume `caddy_data`.

---

## Teil A — GitHub-Umzug

`origin` ist schon eingetragen (`https://github.com/wolfgang-bangert/bechtel-erp.git`),
es fehlt nur die Authentifizierung auf dem Rechner. Einmalig:

1. **GitHub CLI installieren** (falls nicht da):
   ```bash
   brew install gh
   ```
2. **Anmelden** – interaktiv, Wolfgang am Rechner:
   ```bash
   gh auth login
   ```
   → *GitHub.com* → *HTTPS* → *Login with a web browser* → Code eingeben.
   Das hinterlegt gleichzeitig den Git-Credential-Helper.
3. **Prüfen & erster Push**:
   ```bash
   cd "/Users/wolfgangbangert/neues ERP"
   git status                     # sauber?
   git branch -M main
   git push -u origin main
   ```
4. **Repo-Einstellungen auf GitHub**:
   - *Settings → Branches*: Branch-Schutz für `main` (PR-Review sobald der zweite
     Entwickler da ist; solo: nur „Require status checks" = CI).
   - *Settings → Secrets and variables → Actions* → folgende Secrets anlegen
     (Werte aus Teil B/C):
     | Secret | Inhalt |
     |---|---|
     | `SUPABASE_ACCESS_TOKEN` | Token aus supabase.com → Account → Access Tokens |
     | `SUPABASE_PROD_REF` | Projekt-Ref von `werk-prod` |
     | `SUPABASE_PROD_DB_PASSWORD` | DB-Passwort von `werk-prod` |
     | `SSH_HOST` | öffentliche IP der VM |
     | `SSH_USER` | `deploy` |
     | `SSH_KEY` | **privater** SSH-Key des `deploy`-Users (siehe Teil C) |

> `.env`, `imports/*` und `logs/` sind bereits in `.gitignore` – es landen keine
> Secrets im Repo. Die zwei bewusst getrackten Dateien
> (`reports/datev/EXTF_…csv` + Screenshot) bleiben drin.

Nach dem Push laufen die Workflows `.github/workflows/ci.yml` (bei PRs/Branches)
und `.github/workflows/deploy.yml` (bei `main`).

> **`deploy.yml` ist bis zur fertigen Infra deaktiviert** – beide Jobs haben
> `if: vars.DEPLOY_ENABLED == 'true'`. Wenn VM + Secrets stehen: *Settings →
> Secrets and variables → Actions → Variables* → `DEPLOY_ENABLED` = `true`.

---

## Teil B — Supabase `werk-prod`

`werk-dev` (Ref `mxdxgqmfnnxupsvtgvsb`) bleibt die Entwicklungs-DB. Für den
Echtbetrieb ein **eigenes Projekt**:

1. supabase.com → **New project** → Name `werk-prod`, Region **Frankfurt
   (eu-central-1)**, starkes DB-Passwort (in Passwortmanager).
2. Plan **Pro** (~23 €/Monat) – nötig für tägliche Backups + Point-in-Time-Recovery.
3. Werte notieren: *Project Settings → General* (Ref) und *→ API* (URL, `anon`,
   `service_role`).
4. Schema ausrollen – passiert automatisch über `deploy.yml` beim ersten `main`-Push,
   oder manuell:
   ```bash
   cd packages/db
   pnpm exec supabase link --project-ref <werk-prod-ref>
   pnpm exec supabase db push
   pnpm exec supabase migration list      # Kontrolle
   ```
5. **Ersten Admin anlegen** wie in [setup.md](setup.md) §6 (Auth → Add user +
   `app_user` / `user_role`-Insert), aber gegen `werk-prod`.
6. *Authentication → URL Configuration*: Site URL = `https://werk.bechtel-druck.de`,
   Redirect-URLs entsprechend.

---

## Teil C — Hetzner-VM Erstinstallation

### VM anlegen
- Hetzner Cloud → Projekt „werk" → Server:
  - Typ **CX22** (2 vCPU, 4 GB, 40 GB) – reicht für web+sync+caddy inkl. Build.
    Bei knappem RAM beim `next build` auf **CPX21** gehen oder Swap anlegen.
  - Standort **Nürnberg** (nahe `werk-dokumente` @ nbg1 und Frankfurt).
  - Image **Ubuntu 24.04**.
  - SSH-Key hinterlegen (dein Laptop-Key).
  - Firewall: eingehend nur **22, 80, 443**.
- DNS beim Domain-Provider: `werk.bechtel-druck.de` → **A-Record** auf die VM-IP
  (AAAA auf die IPv6, wenn genutzt).

### Grundhärtung (als root)
```bash
apt update && apt -y upgrade
apt -y install docker.io docker-compose-v2 git ufw fail2ban unattended-upgrades
systemctl enable --now docker

# Deploy-User (kein Login-Passwort, nur Key)
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy

ufw default deny incoming && ufw default allow outgoing
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable

# SSH: nur Key, kein Root-Login
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh
dpkg-reconfigure -f noninteractive unattended-upgrades
```

### Deploy-Key für GitHub + SSH
```bash
su - deploy
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""   # -> als Repo Deploy Key (read-only) auf GitHub eintragen
cat ~/.ssh/id_ed25519.pub                            # GitHub: Repo → Settings → Deploy keys → Add
```
Für den `deploy.yml`-Workflow zusätzlich **einen** Key-Pair, dessen **öffentlicher**
Teil in `~deploy/.ssh/authorized_keys` der VM steht und dessen **privater** Teil als
GitHub-Secret `SSH_KEY` hinterlegt ist. (Kann derselbe wie oben sein, wenn der
öffentliche Teil auch in `authorized_keys` liegt.)

### Repo + Secrets auf die VM
```bash
su - deploy
sudo mkdir -p /opt/werk && sudo chown deploy:deploy /opt/werk
git clone git@github.com:wolfgang-bangert/bechtel-erp.git /opt/werk
cd /opt/werk

cp .env.example .env
chmod 600 .env
nano .env            # ALLE Werte für werk-prod eintragen (siehe .env.example)

mkdir -p imports logs reports
# FinTS: imports/fints.txt + imports/fints-state.*.b64 von einem sicheren Ort kopieren
```

### Erststart
```bash
cd /opt/werk
docker compose up -d --build
docker compose logs -f caddy    # Zertifikat-Ausstellung beobachten
```
→ `https://werk.bechtel-druck.de` sollte den Login zeigen.

---

## Teil D — Deploy-Pipeline

| Auslöser | Workflow | Wirkung |
|---|---|---|
| PR / Branch-Push | `ci.yml` | Typecheck (`web` + `sync`) + `next build` |
| Push auf `main` | `deploy.yml` | Job `migrate` (`supabase db push` → werk-prod) → Job `deploy` (SSH: `git reset --hard origin/main` + `docker compose up -d --build`) |
| manuell | `deploy.yml` (`workflow_dispatch`) | dasselbe on-demand |

**Migrationsregel:** nach GitHub-Umzug läuft `supabase db push` gegen **prod nur
noch über CI**, nie mehr von Hand. Lokal weiter frei gegen `werk-dev`
(`pnpm db:push`). Reihenfolge im Deploy: erst DB migrieren, dann Container neu –
additive Migrationen zuerst, spaltendropendes erst nach dem passenden Code-Release.

**Manuelles Deploy** (Fallback, auf der VM):
```bash
cd /opt/werk && git fetch origin && git reset --hard origin/main && docker compose up -d --build
```

**Rollback:** `git reset --hard <letzter guter Commit>` + `docker compose up -d --build`.
DB-Rollback über Supabase-PITR (Pro-Plan).

---

## Teil E — Betrieb

- **Logs:** `docker compose logs -f web` / `… sync`. Cron-Ausgaben landen über
  supercronic in `docker compose logs sync`.
- **Cron sofort testen:** `docker compose run --rm sync pnpm portal:pull --portal=onlineprinters`
- **DB-Backups:** Supabase Pro macht täglich + PITR. Zusätzlich (Gürtel + Hosenträger)
  ein nächtlicher `pg_dump` in den S3-Bucket – als vierter Cron-Eintrag ergänzbar.
- **VM-Backup:** Hetzner „Backups" aktivieren (20 % Aufpreis) **oder** wöchentlicher
  Snapshot. Die VM hält keinen unwiederbringlichen Zustand außer `/opt/werk/.env`
  und `/opt/werk/imports/*` → diese zwei zusätzlich im Passwortmanager / sicheren Ablage.
- **Updates:** `unattended-upgrades` für OS-Security. Docker-Images: `caddy`-Tag
  pinnen und bewusst heben; Node-Basis über Rebuild.
- **Monitoring (empfohlen, klein):** healthchecks.io-Ping am Ende jedes Cron-Jobs
  („Job lief"), und ein Uptime-Check auf `https://werk.bechtel-druck.de` (z. B.
  Better Stack / UptimeRobot). Optional Sentry im `web` für Laufzeitfehler.

---

## Teil F — Sicherheit (offenes Internet, später Kunden/Lieferanten)

- **Die eigentliche Grenze ist Supabase-RLS**, nicht das Netz. Rollen heute:
  `admin` / `office` / `production`. Für Portale kommen `kunde` / `lieferant`
  dazu – jeweils mit eigenen RLS-Policies, die nur die eigenen Aufträge/Firmen
  sehen. **Vor** dem ersten externen Login sauditieren, dass jede Tabelle mit
  Kundendaten eine restriktive Policy hat (kein `using (true)`).
- **Auth:** Supabase Auth, E-Mail-Einladung, MFA für interne Accounts aktivieren.
- **Transport:** nur 443, HSTS gesetzt. `fail2ban` + Key-only-SSH auf Port 22.
- **Rate-Limiting / Bot-Schutz:** später Caddy-`rate_limit` oder Cloudflare
  davor (Proxy-Modus) – dann Origin-Firewall auf Cloudflare-IPs einschränken.
- **Secrets:** eine `/opt/werk/.env` (600, Owner `deploy`). Wenn der zweite
  Entwickler kommt und eine Oberfläche gewünscht ist → Infisical/Doppler,
  `.env` wird dann daraus generiert.
- **flux-Webhook:** `POST /api/flux/webhook`, HMAC gegen `FLUX_WEBHOOK_SECRET`.
  Mit der öffentlichen Domain kein Tunnel nötig.

---

## Kosten (grob, mtl.)

| Posten | ~ EUR |
|---|---|
| Hetzner CX22 | 6 |
| Hetzner Backups/Snapshots | 2 |
| Supabase Pro (werk-prod) | 23 |
| Domain | vorhanden |
| **Summe** | **~ 31** |

`werk-dev` bleibt auf dem kostenlosen Supabase-Plan.

---

## Offene Punkte / später

- Portal-Rollen `kunde`/`lieferant` + RLS-Policies + Einladungsflow.
- `pg_dump`-nach-S3 als vierter Cron-Job.
- Staging-Umgebung (zweite kleine VM + `werk-staging`-Projekt), sobald zu zweit.
- FinTS aus dem Rechenzentrum: Banken können den neuen Zugriffsort als „neues
  Gerät" werten → ggf. erster Connect mit TAN manuell auf der VM
  (`docker compose run --rm sync pnpm fints:setup --bank=<kuerzel>`).
- GHCR-Images statt Build-on-VM, falls die Build-Last auf der CX22 stört.
- `apps/app` (Expo, Mitarbeiter-App) – eigener Build-/Release-Weg (EAS), nicht Teil dieser VM.
