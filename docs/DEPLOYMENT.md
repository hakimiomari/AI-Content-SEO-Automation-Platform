# Deployment

Running the platform locally, in Docker for production, and operating it: environment matrix, Nginx, backups, monitoring and zero-downtime releases.

## Table of contents

- [1. Environments](#1-environments)
- [2. Local development](#2-local-development)
- [3. Production with Docker Compose](#3-production-with-docker-compose)
- [4. Environment variable matrix](#4-environment-variable-matrix)
- [5. Nginx](#5-nginx)
- [6. Backups](#6-backups)
- [7. Monitoring and logging](#7-monitoring-and-logging)
- [8. Zero-downtime releases](#8-zero-downtime-releases)
- [9. Scaling](#9-scaling)
- [10. Runbook](#10-runbook)

## 1. Environments

| Environment | How | Data | Purpose |
| --- | --- | --- | --- |
| **Local** | `pnpm docker:up` (Postgres, Redis, MinIO in Docker) + `pnpm dev` (apps on the host with hot reload) | seed data | day-to-day development |
| **CI** | GitHub Actions service containers | ephemeral | tests and builds |
| **Staging** | `docker/docker-compose.prod.yml` on one VM, real domain, test Stripe keys | anonymised copy or seed | pre-release verification, Swagger enabled |
| **Production** | same Compose file, hardened `.env`, backups and monitoring on | real | customers |

## 2. Local development

Prerequisites: Node 22+ (`.nvmrc` pins 24), pnpm 10+ (`packageManager` pins the exact version), Docker Desktop or compatible engine.

```bash
git clone https://github.com/<you>/ai-content-seo-platform.git
cd ai-content-seo-platform
pnpm install                 # also runs prisma generate (postinstall)
cp .env.example .env         # edit OPENAI_API_KEY at least
pnpm docker:up               # postgres:5432, redis:6379, minio:9000/9001
pnpm db:migrate              # or: pnpm db:push for a quick first start
pnpm db:seed                 # demo logins, Password123!
pnpm dev                     # web :3000 · api :4000 · worker
```

| URL | What |
| --- | --- |
| http://localhost:3000 | web |
| http://localhost:4000/api/v1 | API |
| http://localhost:4000/api/docs | Swagger |
| http://localhost:9001 | MinIO console (`minioadmin` / `minioadmin`) |

Useful: `pnpm docker:logs`, `pnpm db:studio`, `pnpm docker:down` (data volumes persist), `pnpm db:reset` (drop + migrate + seed).

The web app reads `apps/web/.env.local`; create it with `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` if the root `.env` value is not picked up by your setup.

## 3. Production with Docker Compose

`docker/docker-compose.prod.yml` builds and runs the whole stack on one host:

```mermaid
flowchart LR
  I((Internet)) -->|443| NG[nginx]
  NG -->|3000| WEB[web]
  NG -->|4000| API[api]
  API --> PG[(postgres)]
  API --> RD[(redis)]
  API --> MN[(minio)]
  WK[worker] --> RD
  WK --> PG
  WK --> MN
  WK -->|https| OAI[OpenAI]
  subgraph volumes
    PGV[(pgdata)]
    MNV[(miniodata)]
    RDV[(redisdata)]
  end
  PG --- PGV
  MN --- MNV
  RD --- RDV
```

| Service | Image | Exposed | Notes |
| --- | --- | --- | --- |
| `nginx` | `nginx:alpine` + `docker/nginx/` config | 80, 443 | TLS termination, routing, gzip, limits |
| `web` | `docker/Dockerfile.web` (multi-stage, `node:22-alpine`, standalone output) | internal 3000 | `NEXT_PUBLIC_API_URL` baked at build |
| `api` | `docker/Dockerfile.api` | internal 4000 | runs `prisma migrate deploy` before start (release step) |
| `worker` | `docker/Dockerfile.worker` | none | scale with `--scale worker=N` |
| `postgres` | `postgres:16-alpine` | internal | volume `pgdata` |
| `redis` | `redis:7-alpine` with `appendonly yes` | internal | volume `redisdata` |
| `minio` | `minio/minio` | internal (console not exposed) | volume `miniodata`; bucket created by an init job |

Deploy:

```bash
# on the host
git pull
cp .env.example .env && $EDITOR .env      # first time only — see matrix below
pnpm docker:prod                           # docker compose -f docker/docker-compose.prod.yml up -d --build
docker compose -f docker/docker-compose.prod.yml exec api node -e "require('child_process').execSync('npx prisma migrate deploy --schema prisma/schema.prisma',{stdio:'inherit'})"
docker compose -f docker/docker-compose.prod.yml ps
curl -fsS https://your-domain/api/v1/health
```

Images are also built in CI; on a multi-host setup pull them from the registry instead of building on the server.

## 4. Environment variable matrix

All variables live in the root `.env` (see `.env.example`). Never commit `.env`.

| Variable | Dev default | Production | Used by |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | all |
| `APP_NAME` | "AI Content & SEO Automation Platform" | same | api, web |
| `WEB_URL` | `http://localhost:3000` | `https://app.example.com` | api (links in emails, CORS) |
| `API_URL` | `http://localhost:4000` | `https://app.example.com` | web (server-side fetches) |
| `API_PORT` | `4000` | `4000` (internal) | api |
| `API_GLOBAL_PREFIX` | `api/v1` | `api/v1` | api |
| `CORS_ORIGINS` | `http://localhost:3000` | `https://app.example.com` | api |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `platform` / `platform` / `platform` | strong password | postgres container |
| `DATABASE_URL` | `postgresql://platform:platform@localhost:5432/platform?schema=public` | host `postgres`, strong password, `?connection_limit=20` | api, worker, prisma |
| `REDIS_URL` | `redis://localhost:6379` | `redis://redis:6379` (+ password) | api, worker |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | placeholders | `openssl rand -base64 48` each | api |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `15m` / `7d` | same | api |
| `COOKIE_DOMAIN` | `localhost` | `example.com` | api |
| `COOKIE_SECURE` | `false` | **`true`** | api |
| `ENCRYPTION_KEY` | zeros | `openssl rand -hex 32` | api, worker |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | `60` / `120` | tune per traffic | api |
| `OPENAI_API_KEY` | `sk-your-key` | real key | worker, api (editor actions) |
| `OPENAI_MODEL` / `OPENAI_MODEL_PREMIUM` | `gpt-4o-mini` / `gpt-4o` | same or newer | worker, api |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` | `localhost` / `9000` / `false` | `minio` / `9000` / `false` (internal) | api, worker |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `minioadmin` | strong values | api, worker, minio |
| `MINIO_BUCKET` | `platform-uploads` | same | api, worker |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | `https://files.example.com` (Nginx route to MinIO) | api, web |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | `https://app.example.com/api/v1` | web (build-time) |
| `NEXT_PUBLIC_APP_NAME` | "AI Content & SEO Platform" | same | web |
| *(Phase 7)* `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | — | from Stripe | api |
| *(Phase 6)* `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | from Google Cloud | api, worker |
| *(optional)* `SENTRY_DSN`, `LOG_LEVEL` | — / `debug` | set / `info` | all |

## 5. Nginx

`docker/nginx/default.conf` (summary):

- `server { listen 443 ssl http2; }` with Let's Encrypt certificates mounted from a volume; HTTP → HTTPS redirect.
- `location /api/ { proxy_pass http://api:4000; }` with `proxy_set_header X-Forwarded-For/Proto/Host`, 60 s read timeout (AI editor actions), `client_max_body_size 10m`.
- `location / { proxy_pass http://web:3000; }` with WebSocket upgrade headers for Next.js dev/HMR in staging.
- `location /files/ { proxy_pass http://minio:9000/platform-uploads/; }` for public objects (read-only).
- `limit_req_zone` 20 r/s per IP with burst 40; `limit_conn` 50.
- `gzip on` for text, `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains"`.

Certificates: `certbot` in a sidecar container or on the host with `--webroot`; renewal reloads Nginx.

## 6. Backups

| What | How | Schedule | Retention |
| --- | --- | --- | --- |
| PostgreSQL | `docker compose exec -T postgres pg_dump -Fc -U platform platform > backups/pg-$(date +%F).dump` | nightly (cron) | 14 daily, 8 weekly, 6 monthly |
| MinIO | `mc mirror --overwrite minio/platform-uploads s3://offsite-bucket/platform-uploads` or bucket replication; enable versioning | nightly | 30 days of versions |
| Redis | AOF on volume; queues are transient — a loss only delays jobs | — | — |
| `.env` and Nginx config | encrypted copy in a password manager / secrets store | on change | — |

Ship dumps off the host (object storage in another region). **Test a restore quarterly**:

```bash
createdb -U platform platform_restore
pg_restore -U platform -d platform_restore backups/pg-2026-09-27.dump
```

Before every release, take an ad-hoc dump (`make backup` or the command above).

## 7. Monitoring and logging

| Signal | Source | Alert when |
| --- | --- | --- |
| Liveness | `GET /api/v1/health` (db + redis), Docker `healthcheck` on api/web | fails 3× in a row |
| Errors | structured JSON logs (`level`, `requestId`, `companyId`, `userId`, `route`, `durationMs`); optional Sentry via `SENTRY_DSN` | 5xx rate > 1 % over 5 min |
| Queues | BullMQ metrics (waiting, active, failed, completed per queue) exposed by the worker; `GET /admin/queues` (planned) | failed jobs > 10 / h or waiting > 500 |
| AI spend | `AIUsage` aggregates; daily job compares with 7-day average | company > 3× average, platform > daily budget |
| Database | connection count, slow query log (> 500 ms), disk | disk > 80 % |
| Certificates | certbot renewal logs | expiry < 14 days |
| Publishing | `Schedule.status = FAILED` count | any failure for a customer twice in a row |

Logs: containers write JSON to stdout; ship with the Docker logging driver (`json-file` with rotation locally, `loki`/`fluentd`/CloudWatch in production). Worker logs always include `jobId` and `queue`.

## 8. Zero-downtime releases

1. **Backwards-compatible migrations only.** Add nullable columns / new tables first; backfill; then add constraints in a later release. Never rename in place — add, copy, drop later.
2. **Order**: build images → `prisma migrate deploy` (runs while the old version is still serving; safe because of rule 1) → start new `api` and `worker` → health check → switch Nginx upstream (or rely on Compose's rolling `up -d` with two replicas) → stop old.
3. **Workers drain gracefully**: on `SIGTERM` the worker stops taking jobs, finishes active ones (up to 120 s) and exits; BullMQ re-queues anything stalled.
4. **Web**: Next.js standalone image with immutable asset hashes; keep the previous image around for one release so cached HTML can still fetch old chunks.
5. **Rollback**: `docker compose up -d api=<previous tag>`; migrations are additive so the previous version still runs.
6. **Feature flags** over long-lived branches for risky UI changes (env-driven in v1).

## 9. Scaling

| Pressure | Action |
| --- | --- |
| AI jobs queue up | `docker compose up -d --scale worker=3`; raise per-queue concurrency for non-AI queues |
| API CPU | scale `api` replicas; Nginx upstream round-robin; sessions are stateless |
| Database | move to managed PostgreSQL, add read replica for analytics endpoints, PgBouncer for pooling |
| Storage | replace MinIO with S3/R2 by changing `MINIO_*` vars |
| Traffic spikes | CDN in front of Nginx for `web` static assets and `/files` |

## 10. Runbook

| Symptom | Check | Fix |
| --- | --- | --- |
| `pnpm dev` fails: Prisma client missing | `pnpm db:generate` | postinstall did not run (frozen install) |
| API `ECONNREFUSED 5432` | `pnpm docker:up`, `docker ps` | Postgres not running or `DATABASE_URL` host wrong (`localhost` on host, `postgres` in Compose) |
| 401 loops in the browser | cookie `domain`/`secure` mismatch | `COOKIE_DOMAIN`, `COOKIE_SECURE`, `CORS_ORIGINS` must match the web origin |
| Jobs never run | worker logs, `redis-cli -u $REDIS_URL llen bull:keyword-research:wait` | worker not started or wrong `REDIS_URL` |
| Publishing fails with 401 from WordPress | `Schedule.lastError` | application password revoked → reconnect integration |
| AI jobs fail with 429 | provider dashboard | lower concurrency, raise plan budget, wait for backoff |
| Disk full | `docker system df`, `pg_database_size` | prune images, rotate logs, archive `AnalyticsSnapshot` |
| Restore needed | latest dump exists off-host | `pg_restore` into a fresh database, repoint `DATABASE_URL`, restart api/worker |
