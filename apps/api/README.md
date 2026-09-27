# @acsp/api

NestJS 11 REST API for the AI Content & SEO Automation Platform. Serves `/api/v1/*`, Swagger UI at `/api/docs` (JSON at `/api/docs-json`).

## Run

```bash
# from the repo root
cp .env.example .env            # once; the API reads ../../.env
pnpm docker:up                  # postgres + redis + minio
pnpm db:migrate && pnpm db:seed # schema + demo users
pnpm --filter @acsp/api dev     # http://localhost:4000/api/v1
```

Other scripts: `build`, `start`, `lint`, `typecheck`, `test` (unit, `*.spec.ts`), `test:e2e` (`test/*.e2e-spec.ts`, runs without DB/Redis — both are mocked).

Seeded logins (`Password123!`): `admin@platform.local` (SUPER_ADMIN), `owner@acme.local` (COMPANY_ADMIN), `editor@acme.local` (CONTENT_MANAGER).

## Environment

Validated at boot by `src/config/env.schema.ts` (zod). Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (32+ chars), `ENCRYPTION_KEY` (64 hex). Everything else has defaults: `API_PORT=4000`, `API_GLOBAL_PREFIX=api/v1`, `CORS_ORIGINS` (comma separated), `REDIS_URL`, `JWT_ACCESS_TTL=15m`, `JWT_REFRESH_TTL=7d`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `THROTTLE_TTL=60` (s), `THROTTLE_LIMIT=120`.

## Layout

```
src/
├── main.ts                 helmet, cookies, CORS, prefix, ValidationPipe, Swagger
├── app.module.ts           wiring + global guards/filter/interceptor/middleware
├── config/                 zod env schema, typed AppConfig accessor
├── prisma/                 PrismaService (+ P2002/P2025 → 409/404 helpers)
├── redis/                  ioredis client (REDIS_CLIENT token)
├── queue/                  BullMQ queues from @acsp/shared QUEUES, typed enqueue(), getStats()
├── common/
│   ├── decorators/         @Public() @Roles() @CurrentUser()
│   ├── guards/             JwtAuthGuard (honours @Public), RolesGuard (SUPER_ADMIN always passes)
│   ├── filters/            AllExceptionsFilter → { statusCode, message, error, path, timestamp, requestId }
│   ├── interceptors/       LoggingInterceptor
│   ├── middleware/         RequestIdMiddleware (x-request-id)
│   ├── dto/                PaginationQueryDto (page, limit, search, sort, order)
│   └── utils/              crypto (AES-256-GCM, sha256, randomToken), pagination, tenant, slug
└── modules/
    ├── health/  auth/  users/  companies/  audit/  admin/
```

Global guard order: `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`. Every tenant-owned query goes through `resolveCompanyId(user, ?companyId)`: SUPER_ADMIN may target any company with `?companyId=`, everyone else is pinned to their JWT's `companyId`.

Auth: JWT access token (Bearer header **or** `access_token` cookie) + refresh token (`refresh_token` cookie or body). Refresh tokens are stored as sha256 hashes in `RefreshToken` and rotated on every use; presenting an already-rotated token revokes all sessions for that user.

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | 503 when Postgres or Redis is down |
| GET | `/health/live` | public | liveness |
| POST | `/auth/register` | public, 5/min | creates Company + FREE Subscription + COMPANY_ADMIN |
| POST | `/auth/login` | public, 10/min | sets cookies, returns tokens |
| POST | `/auth/refresh` | public | rotates refresh token |
| POST | `/auth/logout` | public | revokes presented refresh token, clears cookies |
| POST | `/auth/logout-all` | user | revokes all refresh tokens |
| GET | `/auth/me` | user | user + company + plan |
| PATCH | `/auth/password` | user | verifies current, revokes all sessions |
| GET | `/users` | user | company-scoped, paginated (SUPER_ADMIN: `?companyId=`) |
| GET | `/users/:id` | user | |
| PATCH | `/users/:id` | COMPANY_ADMIN | never SUPER_ADMIN; same company only |
| DELETE | `/users/:id` | COMPANY_ADMIN | soft delete (`isActive=false`) |
| POST | `/users/invite` | COMPANY_ADMIN | 7-day token, enforces `PLAN_LIMITS[plan].users`, returns token + acceptUrl |
| POST | `/users/accept-invite` | public, 5/min | creates user, logs in |
| GET | `/users/invitations` | COMPANY_ADMIN | pending only |
| DELETE | `/users/invitations/:id` | COMPANY_ADMIN | |
| GET | `/companies/me` | user | company + subscription + counts |
| PATCH | `/companies/me` | COMPANY_ADMIN | slug uniqueness → 409 |
| GET | `/companies/me/usage` | user | usage meters vs `PLAN_LIMITS` |
| GET | `/companies` | SUPER_ADMIN | paginated, search |
| GET | `/companies/:id` | SUPER_ADMIN | |
| PATCH | `/companies/:id/subscription` | SUPER_ADMIN | manual plan/status until Stripe (Phase 7) |
| GET | `/audit` | COMPANY_ADMIN | company-scoped, filter `entity`, `entityId`, `action`, `userId` |
| GET | `/admin/stats` | SUPER_ADMIN | counts, 30-day AI usage, queue stats |

All paths are relative to `/api/v1`.

## Roadmap — where later modules go

Each is a new folder under `src/modules/<feature>/` (`<feature>.module.ts`, controller, service, `dto/`) registered in `app.module.ts`. Background work is enqueued through `QueueService.enqueue(QUEUES.X, ...)` and processed in `apps/worker`.

| Phase | Module | Purpose |
| --- | --- | --- |
| 2 | `websites` | CRUD + enqueue `website-analysis` |
| 2 | `projects` | CRUD, status, website link |
| 3 | `keywords` | clusters/keywords under `/projects/:projectId/keywords` |
| 3 | `research` | enqueue `keyword-research`, opportunity scoring |
| 4 | `content` | briefs, content, versions; enqueue `content-generation` |
| 4 | `seo` | SEO analyzer (`seo-analysis` queue), scores |
| 4 | `ai` | editor actions (rewrite/improve/…), `AIUsage` accounting |
| 5 | `agents` | orchestration endpoints for multi-step agent runs |
| 5 | `publishing` | schedules, social posts, `publishing` + `repurposing` queues |
| 6 | `analytics` | GSC sync (`analytics-sync`), snapshots, reports (`report-generation`) |
| 6 | `integrations` | encrypted credentials via `common/utils/crypto` |
| 7 | `subscriptions` | Stripe checkout/webhooks replacing the manual admin endpoint |
| 7 | `usage` | metering + enforcement middleware for words/AI credits |
| 8 | `notifications` | in-app + email (invitation delivery moves here) |
| 8 | `files` | MinIO uploads (`FileObject`) |
