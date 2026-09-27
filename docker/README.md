# docker/

Everything needed to run the platform's infrastructure locally and the full stack in production.

```
docker/
├── docker-compose.yml        dev infra only: postgres, redis, minio (+ bucket init)
├── docker-compose.prod.yml   full stack: infra + api + web + worker + nginx + backups
├── Dockerfile.api            NestJS API (multi-stage, runs `prisma migrate deploy` on start)
├── Dockerfile.web            Next.js (standalone output)
├── Dockerfile.worker         BullMQ worker + AI agents
├── nginx/nginx.conf          global nginx settings (gzip, rate-limit zones, proxy defaults)
├── nginx/conf.d/default.conf routing: /api/* → api:4000, /* → web:3000, TLS block (commented)
└── data/                     runtime data created on the host (git-ignored): backups/, certbot/
```

All Dockerfiles use the **repository root** as build context (`context: ../`), so run every
`docker build` from the repo root, e.g. `docker build -f docker/Dockerfile.api .`. The root
`.dockerignore` keeps `node_modules`, build output and `.env` out of the context.

## Development (infra only)

Apps run on the host with hot reload; only Postgres, Redis and MinIO run in containers.

```bash
cp .env.example .env            # once
pnpm docker:up                  # docker compose -f docker/docker-compose.yml up -d
pnpm db:migrate && pnpm db:seed # create schema + demo tenant
pnpm dev                        # web :3000, api :4000, worker
pnpm docker:logs                # follow container logs
pnpm docker:down                # stop (data is kept in named volumes)
```

| Service   | Host port | Credentials (defaults from `.env.example`)            |
| --------- | --------- | ----------------------------------------------------- |
| postgres  | 5432      | `platform` / `platform`, db `platform`                |
| redis     | 6379      | —                                                     |
| minio     | 9000      | S3 API — `minioadmin` / `minioadmin`                  |
| minio     | 9001      | web console                                           |

`minio-init` runs once, creates the `${MINIO_BUCKET}` bucket (default `platform-uploads`) and sets an
anonymous **download** policy so uploaded images are publicly readable.

Variable substitution in compose files (`${POSTGRES_USER:-platform}`) reads from your shell and
`docker/.env`; the containers themselves receive the root `.env` via `env_file: ../.env`. Defaults
match `.env.example`, so no extra flags are needed. To use a different env file for substitution:
`docker compose --env-file .env -f docker/docker-compose.yml up -d`.

## Production

```bash
cp .env.example .env
# edit .env: strong POSTGRES_PASSWORD, JWT_*_SECRET, ENCRYPTION_KEY (openssl rand -hex 32), OPENAI_API_KEY,
#            MINIO_ACCESS_KEY/SECRET_KEY, WEB_URL / CORS_ORIGINS / COOKIE_DOMAIN for your domain
pnpm docker:prod                # docker compose -f docker/docker-compose.prod.yml up -d --build
docker compose -f docker/docker-compose.prod.yml ps
docker compose -f docker/docker-compose.prod.yml logs -f api worker
```

- Only **nginx** publishes ports (80/443). `api`, `web`, `worker`, `postgres`, `redis`, `minio` are
  reachable on the internal network only.
- `api` starts with `prisma migrate deploy` and then `node apps/api/dist/main.js`; `worker` waits for
  the API container to start so migrations run first.
- Service hostnames (`postgres`, `redis`, `minio`) override the `localhost` URLs from `.env` via the
  `x-app-env` anchor in the compose file.
- `NEXT_PUBLIC_API_URL` defaults to `/api/v1` (same origin through nginx). It is baked in at build
  time — rebuild `web` if you change it.
- Container logs use the `json-file` driver with `max-size: 10m`, `max-file: 3`.
- Health checks: `api` → `GET /api/v1/health`, `worker` → `GET :4001/health`, `web` → `GET /`,
  `nginx` → `GET /nginx-health`.

### TLS (Let's Encrypt)

1. Point your DNS at the server and start the stack on port 80.
2. Issue a certificate with certbot in webroot mode (command in `nginx/conf.d/default.conf`).
3. Uncomment the `443` server block and the HTTP→HTTPS redirect, set `server_name`, mount
   `./data/certbot/conf` and `./data/certbot/www` in `docker-compose.prod.yml`, then
   `docker compose -f docker/docker-compose.prod.yml exec nginx nginx -s reload`.
4. Set `COOKIE_SECURE=true` and the HTTPS `WEB_URL`/`CORS_ORIGINS` in `.env`; restart `api`.

## Volumes

| Volume / path         | Contents                    | Notes                                      |
| --------------------- | --------------------------- | ------------------------------------------ |
| `acsp_postgres_data`  | Postgres cluster            | named volume                               |
| `acsp_redis_data`     | Redis AOF                   | BullMQ state; safe to lose (jobs re-queue) |
| `acsp_minio_data`     | Uploaded files              | named volume                               |
| `docker/data/backups` | daily `pg_dump` archives    | bind mount, git-ignored                    |
| `docker/data/certbot` | TLS certificates (optional) | bind mount, git-ignored                    |

List them with `docker volume ls | grep acsp`. `docker compose ... down -v` deletes named volumes —
do not run it in production.

## Backups

`backup` (`prodrigestivill/postgres-backup-local:16`) dumps the database **daily** (`SCHEDULE=@daily`,
plus once on start) into `docker/data/backups/` and keeps **7 days** of daily dumps
(`BACKUP_KEEP_DAYS=7`; weekly/monthly retention disabled). Files look like
`daily/platform-20250101-000000.sql.gz`, with `last/platform-latest.sql.gz` pointing at the newest.

Manual backup right now:

```bash
docker compose -f docker/docker-compose.prod.yml exec backup /backup.sh
```

Copy `docker/data/backups` off the host (object storage, another machine) — local backups are
not disaster recovery.

## Restore

```bash
cd docker
# 1. stop writers
docker compose -f docker-compose.prod.yml stop api worker

# 2. restore a dump into the running postgres (drops & recreates objects in the dump)
zcat data/backups/last/platform-latest.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T postgres \
      psql -U "${POSTGRES_USER:-platform}" -d "${POSTGRES_DB:-platform}"

#    …or restore into a fresh database:
#    docker compose -f docker-compose.prod.yml exec postgres createdb -U platform platform_restore
#    zcat data/backups/daily/platform-YYYYMMDD-HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U platform -d platform_restore

# 3. start the apps again (api re-applies any pending migrations)
docker compose -f docker-compose.prod.yml start api worker
```

To move MinIO data, copy the `acsp_minio_data` volume (`docker run --rm -v acsp_minio_data:/data -v $PWD:/backup alpine tar czf /backup/minio.tgz -C /data .`)
or mirror the bucket with `mc mirror`.

## Troubleshooting

- **`api` restarts with a Prisma connection error** — Postgres is not healthy yet or
  `POSTGRES_*` in `.env` changed after the volume was created (credentials live in the volume).
- **`web` fails to start: `apps/web/server.js` not found** — `apps/web/next.config.*` must set
  `output: 'standalone'` and `outputFileTracingRoot` to the monorepo root.
- **Frozen lockfile errors during build** — commit an up-to-date `pnpm-lock.yaml`.
- **Corepack signature errors** — the base stage upgrades corepack (`npm i -g corepack@latest`) for
  this reason; if it persists, pin `PNPM_VERSION` to the version in `package.json#packageManager`.
