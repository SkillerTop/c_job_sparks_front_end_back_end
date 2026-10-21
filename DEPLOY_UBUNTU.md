# Production deployment on Ubuntu

This deployment runs four Compose services:

- `db`: PostgreSQL 16 with a persistent volume;
- `migrate`: one-shot checksum-validated database migrations;
- `api`: Fastify API and Microsoft Graph mail worker;
- `web`: Nginx serving the production Vite build.

Only `127.0.0.1:3001` and `127.0.0.1:8080` are published by Docker. Host Nginx exposes ports 80 and 443. PostgreSQL is not exposed on the host.

## 1. Server prerequisites

Use Ubuntu Server 24.04 LTS with a sudo-enabled user. Open inbound TCP ports 22, 80 and 443. Allow outbound HTTPS for GitHub, Docker registries, Microsoft Entra ID, Microsoft Graph and Let's Encrypt.

Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository, then verify:

```bash
docker --version
docker compose version
sudo systemctl enable --now docker
```

Install the host tools:

```bash
sudo apt update
sudo apt install -y git nginx snapd curl openssl
```

## 2. Clone the application branch

```bash
sudo mkdir -p /opt/c-job-sparks
sudo chown -R "$USER":"$USER" /opt/c-job-sparks
cd /opt/c-job-sparks
git clone --branch 'front-end+back-end' --single-branch \
  git@github.com:SkillerTop/c_job_sparks_front_end_back_end.git app
cd app
```

For a private repository, configure a read-only GitHub Deploy Key before cloning.

## 3. Configure the environment

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
openssl rand -hex 48
nano .env.production
```

Use the first generated value for both `POSTGRES_PASSWORD` and the password segment in `DATABASE_URL`. Use the second for `COOKIE_SECRET`. If a database password contains URL-reserved characters, URL-encode it.

Replace every `CHANGE_ME` value and every occurrence of `sparks.example.com`. The Entra redirect URI must exactly match:

```text
https://YOUR_DOMAIN/api/v1/auth/microsoft/callback
```

Do not run `seed:dev` in production.

## 4. Validate, build and start

```bash
docker compose --env-file .env.production -f compose.prod.yaml config --quiet
docker compose --env-file .env.production -f compose.prod.yaml build --pull
docker compose --env-file .env.production -f compose.prod.yaml up -d
docker compose --env-file .env.production -f compose.prod.yaml ps -a
```

Expected state: `db`, `api` and `web` are healthy; `migrate` is `Exited (0)`.

Check the application locally on the server:

```bash
curl -fsS http://127.0.0.1:3001/health/live
curl -fsS http://127.0.0.1:3001/health/ready
curl -I http://127.0.0.1:8080
```

Expected API responses are `{"status":"ok"}` and `{"status":"ready"}`.

Check migrations:

```bash
docker compose --env-file .env.production -f compose.prod.yaml run --rm migrate \
  node dist/src/db/migrate-cli.js status
```

## 5. Configure host Nginx

Copy the template, replace its example domain and enable it:

```bash
sudo cp deploy/host-nginx.conf /etc/nginx/sites-available/c-job-sparks
sudo nano /etc/nginx/sites-available/c-job-sparks
sudo ln -s /etc/nginx/sites-available/c-job-sparks /etc/nginx/sites-enabled/c-job-sparks
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Create an `A` DNS record for the chosen domain that points to the server IPv4 address. Do not create an `AAAA` record unless IPv6 is configured and reachable.

## 6. Issue the TLS certificate

```bash
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d YOUR_DOMAIN --redirect
sudo certbot renew --dry-run
```

Port 80 and the DNS record must already work before running Certbot.

## 7. Enable optional systemd management

Compose restart policies are normally sufficient. To recreate the stack automatically even after the containers were removed, install the unit:

```bash
sudo cp deploy/c-job-sparks.service /etc/systemd/system/c-job-sparks.service
sudo systemctl daemon-reload
sudo systemctl enable --now c-job-sparks
```

## 8. Update an existing deployment

Always make a database backup before applying migrations:

```bash
cd /opt/c-job-sparks/app
git status
git fetch --prune origin
git pull --ff-only origin 'front-end+back-end'
docker compose --env-file .env.production -f compose.prod.yaml config --quiet
docker compose --env-file .env.production -f compose.prod.yaml build --pull
docker compose --env-file .env.production -f compose.prod.yaml up -d db
docker compose --env-file .env.production -f compose.prod.yaml run --rm migrate
docker compose --env-file .env.production -f compose.prod.yaml up -d --force-recreate api web
curl -fsS https://YOUR_DOMAIN/health/ready
```

Never edit an applied migration. Add a new numbered migration. Never run `docker compose down -v` on a server containing real data.

## 9. Back up data

Database backup:

```bash
mkdir -p backups
chmod 700 backups
CJ_BACKUP_STAMP=$(date +%Y%m%d-%H%M%S)
docker compose --env-file .env.production -f compose.prod.yaml exec -T db \
  pg_dump -U c_job_sparks -d c_job_sparks -Fc \
  > "backups/database-${CJ_BACKUP_STAMP}.dump"
```

Media backup:

```bash
docker run --rm \
  -v c_job_sparks_media:/source:ro \
  -v "$PWD/backups:/backup" \
  alpine:3.21 \
  sh -c "tar -czf /backup/media-${CJ_BACKUP_STAMP}.tar.gz -C /source ."
```

Copy backups to storage outside this server and periodically verify restoration on staging.

## 10. Diagnostics

```bash
docker compose --env-file .env.production -f compose.prod.yaml ps -a
docker compose --env-file .env.production -f compose.prod.yaml logs --tail=200 db migrate api web
docker compose --env-file .env.production -f compose.prod.yaml exec db \
  pg_isready -U c_job_sparks -d c_job_sparks
sudo ss -lntp | grep -E ':80|:443|:3001|:8080|:5432'
```

Expected host bindings are `127.0.0.1:3001`, `127.0.0.1:8080`, and public Nginx ports 80/443. Port 5432 must not be public.

Common causes of failure:

- `EADDRINUSE`: another process already uses port 3001 or 8080;
- database refusal: `DATABASE_URL` must use host `db`, not `localhost`;
- Microsoft `AADSTS50011`: Entra redirect URI differs from the configured production URI;
- Graph 403: `Mail.Send` must be an Application permission with tenant admin consent;
- login loop: `NODE_ENV=production`, `TRUST_PROXY=true`, HTTPS forwarding and exact origins are required;
- media write error: verify ownership of `/app/server/data/media` inside the API container.
