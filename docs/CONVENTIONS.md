# Engineering Conventions

These conventions are shared by every app and package in the monorepo. Read this before adding code.

## Workspace layout

```
ai-content-seo-platform/
├── apps/
│   ├── web/        @acsp/web     Next.js 15 (App Router) + Tailwind v4 + shadcn-style UI   → :3000
│   ├── api/        @acsp/api     NestJS 11 REST API (global prefix /api/v1, Swagger /api/docs) → :4000
│   └── worker/     @acsp/worker  BullMQ workers + AI agents (OpenAI)
├── packages/
│   ├── shared/     @acsp/shared  enums, Zod schemas, plan limits, role permissions, queue contracts
│   └── database/   @acsp/database generated Prisma client wrapper
├── prisma/         schema.prisma, migrations/, seed.ts
├── docker/         docker-compose.yml (dev infra), docker-compose.prod.yml, Dockerfiles, nginx
├── docs/           product & technical documentation
└── .github/workflows/ CI
```

- Package manager: **pnpm** workspaces, orchestrated by **Turborepo**. Node 22+.
- Shared code is imported as `@acsp/shared` (built to CJS in `dist/`) and `@acsp/database` (Prisma client).
- Prisma enums are mirrored as string-literal unions in `@acsp/shared` so the browser never imports Prisma.

## Environment

A single root `.env` (copy from `.env.example`) is read by the API (`../../.env`), the worker and Prisma. Next.js reads `apps/web/.env.local`; the only public variable it needs is `NEXT_PUBLIC_API_URL`.

| Service  | Port | Notes                                   |
| -------- | ---- | --------------------------------------- |
| web      | 3000 | Next.js                                 |
| api      | 4000 | NestJS, `/api/v1/*`, docs at `/api/docs` |
| postgres | 5432 | `platform/platform`, db `platform`      |
| redis    | 6379 | BullMQ                                  |
| minio    | 9000 | console on 9001, `minioadmin/minioadmin` |
| nginx    | 80   | production reverse proxy                |

## HTTP API

- Base path `/api/v1`. Resources are plural nouns: `/auth`, `/companies`, `/users`, `/websites`, `/projects`, `/projects/:projectId/keywords`, `/content`, `/seo`, `/analytics`, `/integrations`, `/admin`.
- Validation with `class-validator` DTOs + global `ValidationPipe({ whitelist: true, transform: true })`. Every DTO has Swagger decorators.
- Errors are Nest `HttpException`s → `{ statusCode, message, error }`. Never leak stack traces.
- Pagination query: `page`, `limit`, `search`, `sort`, `order` → response `{ data, meta: { page, limit, total, totalPages } }`.
- Auth: JWT access token (15 min) + refresh token (7 days, hashed in `RefreshToken` table, rotated on use). Both are set as `httpOnly` cookies (`access_token`, `refresh_token`) **and** returned in the JSON body so non-browser clients can use `Authorization: Bearer`.
- Guards (global order): `JwtAuthGuard` (skip with `@Public()`), `RolesGuard` (`@Roles('COMPANY_ADMIN')`), tenant scoping via `@CurrentUser()` — every query on a tenant-owned entity **must** filter by `companyId` from the JWT. `SUPER_ADMIN` may pass `?companyId=` to act on any tenant.
- Rate limiting via `@nestjs/throttler` (`THROTTLE_TTL`/`THROTTLE_LIMIT`), stricter on `/auth/*`.
- Mutations write an `AuditLog` row through `AuditService`.
- Integration secrets are encrypted with AES-256-GCM (`ENCRYPTION_KEY`) before hitting the DB.

## Background jobs

Queue names and payload types live in `@acsp/shared` (`QUEUES`, `JobPayloadMap`). The API only **enqueues**; the worker **processes**. Every job payload carries `companyId` so usage/billing can be attributed. Every AI call records an `AIUsage` row (model, feature, tokens, estimated cost).

## Frontend

- App Router, server components by default, `'use client'` only where needed.
- Route groups: `(marketing)` for public pages, `(auth)` for login/register, `(dashboard)` for the authenticated shell.
- Forms: `react-hook-form` + `zodResolver` using schemas from `@acsp/shared`.
- API calls go through `lib/api-client.ts` (`fetch` with `credentials: 'include'`, automatic refresh on 401).
- UI primitives live in `components/ui/*` (shadcn/ui style: `cva` + `tailwind-merge`), icons from `lucide-react`, animation with `framer-motion`.

## Code style

- TypeScript strict everywhere; no `any` without a comment.
- Prettier (single quotes, 100 cols, trailing commas). ESLint flat config per package.
- Commit messages follow Conventional Commits: `feat(api): add refresh token rotation`.
- One module per feature: `apps/api/src/modules/<feature>/{<feature>.module.ts, controller, service, dto/}`.
