# Architecture

How the platform is put together: components, the path of a request, the path of a background job, ports, and the internal structure of each app.

## Table of contents

- [1. Overview](#1-overview)
- [2. Component diagram](#2-component-diagram)
- [3. Monorepo layout](#3-monorepo-layout)
- [4. Request flow](#4-request-flow)
- [5. Job flow](#5-job-flow)
- [6. Ports and URLs](#6-ports-and-urls)
- [7. Frontend structure](#7-frontend-structure)
- [8. Backend modules](#8-backend-modules)
- [9. Worker structure](#9-worker-structure)
- [10. Data ownership and tenancy](#10-data-ownership-and-tenancy)
- [11. Cross-cutting concerns](#11-cross-cutting-concerns)
- [12. Technology decisions](#12-technology-decisions)
- [13. Scaling path](#13-scaling-path)

## 1. Overview

Three deployable apps share one database and one Redis:

| App | Package | Role |
| --- | --- | --- |
| `apps/web` | `@acsp/web` | Next.js 15 App Router UI. Server components render the shell; client components handle forms and the editor. Talks only to the API. |
| `apps/api` | `@acsp/api` | NestJS 11 REST API under `/api/v1`. Owns validation, auth, RBAC, tenancy, persistence and **enqueuing** jobs. Never calls OpenAI directly. |
| `apps/worker` | `@acsp/worker` | BullMQ workers. **Processes** jobs, runs the AI agents against OpenAI, writes results and `AIUsage` rows back to PostgreSQL. |

Two libraries are consumed by all apps: `@acsp/shared` (enums, Zod schemas, plan limits, role permissions, queue contracts) and `@acsp/database` (generated Prisma client).

Infrastructure: PostgreSQL 16, Redis 7, MinIO (S3), Nginx (production edge), all run with Docker Compose.

## 2. Component diagram

```mermaid
flowchart LR
  subgraph Client
    B[Browser]
  end
  subgraph Edge
    N[Nginx :80/:443<br/>TLS · routing]
  end
  subgraph Apps
    W[Next.js web :3000<br/>App Router · Tailwind · shadcn/ui]
    A[NestJS api :4000<br/>/api/v1 · Swagger /api/docs]
    K[Worker<br/>BullMQ processors · AI agents]
  end
  subgraph Data
    P[(PostgreSQL 16 :5432<br/>Prisma 6)]
    R[(Redis :6379<br/>BullMQ · throttling)]
    M[(MinIO :9000 / :9001<br/>S3 objects)]
  end
  subgraph External
    O[OpenAI API]
    G[Google Search Console]
    WP[WordPress / social APIs]
  end

  B -->|HTTPS| N
  N -->|/| W
  N -->|/api| A
  W -->|fetch · cookies| A
  A --> P
  A --> M
  A -->|enqueue| R
  R -->|process| K
  K --> P
  K --> M
  K -->|prompts| O
  K -->|sync| G
  K -->|publish| WP
```

The animated version lives in [`assets/architecture.svg`](./assets/architecture.svg).

## 3. Monorepo layout

```
ai-content-seo-platform/
├── apps/
│   ├── web/          @acsp/web      Next.js 15 (App Router) + Tailwind v4 + shadcn-style UI
│   ├── api/          @acsp/api      NestJS 11 REST API
│   └── worker/       @acsp/worker   BullMQ workers + AI agents
├── packages/
│   ├── shared/       @acsp/shared   enums, Zod schemas, plan limits, role permissions, queue contracts
│   └── database/     @acsp/database generated Prisma client wrapper
├── prisma/           schema.prisma, migrations/, seed.ts
├── docker/           docker-compose.yml (dev infra), docker-compose.prod.yml, Dockerfiles, nginx/
├── docs/             this documentation + animated assets
└── .github/workflows CI (lint, typecheck, test, build)
```

- **pnpm workspaces** + **Turborepo** (`turbo.json`) orchestrate `dev`, `build`, `lint`, `typecheck`, `test`. Shared packages build first (`dependsOn: ["^build"]`).
- A single root `.env` is read by the API, the worker and Prisma. Next.js reads `apps/web/.env.local` (only `NEXT_PUBLIC_API_URL` is required).
- Prisma enums are mirrored as string-literal unions in `@acsp/shared` so the browser never imports Prisma.

## 4. Request flow

A typical authenticated mutation, e.g. inviting a user.

```mermaid
sequenceDiagram
  autonumber
  participant U as Browser (Next.js client)
  participant N as Nginx
  participant A as NestJS API
  participant G as Guards & Pipes
  participant S as Service
  participant D as PostgreSQL (Prisma)
  participant L as AuditService

  U->>N: POST /api/v1/users/invite (cookies: access_token)
  N->>A: proxy /api → api:4000
  A->>G: ThrottlerGuard (rate limit)
  G->>G: JwtAuthGuard — verify access_token, attach user {sub, role, companyId}
  G->>G: RolesGuard — @Roles('COMPANY_ADMIN')
  G->>G: ValidationPipe — InviteUserDto (whitelist, transform)
  G->>S: controller → UsersService.invite(user.companyId, dto)
  S->>D: check plan limit (users), create Invitation
  S->>L: audit(INVITE, 'Invitation', id, before/after, ip, ua)
  L->>D: insert AuditLog
  S-->>A: Invitation
  A-->>U: 201 { data }
  Note over U,A: On 401 the api-client calls POST /auth/refresh once<br/>(rotates refresh_token) and replays the request.
```

Rules that every request obeys:

1. Global guard order: `ThrottlerGuard` → `JwtAuthGuard` (skip with `@Public()`) → `RolesGuard`.
2. Every tenant-owned query is filtered by `companyId` from the JWT; `SUPER_ADMIN` may pass `?companyId=` to act on another tenant.
3. DTOs are validated with `class-validator` and `ValidationPipe({ whitelist: true, transform: true })`; unknown fields are dropped.
4. Errors are Nest `HttpException`s → `{ statusCode, message, error }`; stack traces never leave the server.
5. List endpoints accept `page`, `limit`, `search`, `sort`, `order` and return `{ data, meta: { page, limit, total, totalPages } }`.
6. Mutations write an `AuditLog` row through `AuditService`.

## 5. Job flow

Anything that calls OpenAI, an external API or takes longer than a second becomes a job. The API enqueues; the worker processes.

```mermaid
sequenceDiagram
  autonumber
  participant U as Browser
  participant A as NestJS API
  participant Q as Redis / BullMQ
  participant W as Worker
  participant O as OpenAI
  participant D as PostgreSQL

  U->>A: POST /projects/:id/keywords/research { topic }
  A->>D: assert plan allowance (keywordsPerMonth)
  A->>Q: add('keyword-research', { companyId, userId, projectId, topic })
  A-->>U: 202 Accepted { jobId }
  loop poll or SSE
    U->>A: GET /jobs/:jobId
    A->>Q: getJobState
    A-->>U: { state: waiting | active | completed | failed, progress }
  end
  Q->>W: process keyword-research
  W->>O: Research Agent prompt (JSON schema output)
  O-->>W: clusters + keywords + usage
  W->>D: upsert KeywordCluster, Keyword rows
  W->>D: insert AIUsage { feature, model, tokens, estimatedCostUsd }
  W->>D: insert Notification (job done)
  W-->>Q: completed { counts }
```

Contracts live in `packages/shared/src/constants/queues.ts`:

| Queue | Payload | Producer | Result |
| --- | --- | --- | --- |
| `keyword-research` | `{ projectId, topic, seedKeywords?, country?, language? }` | Keywords module | `KeywordCluster`, `Keyword` rows |
| `website-analysis` | `{ websiteId }` | Websites module | `Website.analysis` |
| `content-generation` | `{ projectId, briefId, contentId? }` | Content module | `Content`, `ContentVersion`, initial `SEOAnalysis` |
| `seo-analysis` | `{ contentId, keyword? }` | SEO module | `SEOAnalysis`, `Content.seoScore` |
| `repurposing` | `{ contentId, platforms }` | Content module | `SocialPost` rows |
| `publishing` | `{ scheduleId }` | Publishing module (delayed job) | `Schedule.result`, `publishedUrl` |
| `analytics-sync` | `{ websiteId, integrationId, from?, to? }` | Analytics module / cron | `AnalyticsSnapshot` rows |
| `report-generation` | `{ projectId, from, to }` | Analytics module | `FileObject` in MinIO |

Every payload extends `BaseJobPayload { companyId, userId?, requestId? }` so usage and logs can always be attributed. Default options: 3 attempts, exponential backoff from 5 s, keep the last 500 completed and 1,000 failed jobs.

## 6. Ports and URLs

| Service | Port | URL / notes |
| --- | --- | --- |
| web | 3000 | `http://localhost:3000` |
| api | 4000 | `http://localhost:4000/api/v1`, Swagger UI `http://localhost:4000/api/docs`, health `GET /api/v1/health` |
| postgres | 5432 | `postgresql://platform:platform@localhost:5432/platform` |
| redis | 6379 | `redis://localhost:6379` |
| minio | 9000 | S3 API; console on **9001** (`minioadmin` / `minioadmin`) |
| nginx | 80 / 443 | production only; `/` → web, `/api` → api |
| worker | — | no public port; exposes health through logs / BullMQ metrics |

## 7. Frontend structure

```
apps/web/
├── app/
│   ├── (marketing)/            landing, pricing, legal
│   ├── (auth)/                 login, register, accept-invite, forgot/reset password
│   └── (dashboard)/            authenticated shell (sidebar, topbar, notifications)
│       ├── dashboard/          overview widgets
│       ├── websites/           list, new, [id] (profile, analysis)
│       ├── projects/           list, [id]/(keywords | briefs | content | calendar)
│       ├── content/[id]/       editor (Tiptap), AI actions, SEO panel, versions
│       ├── calendar/           month / week view of schedules
│       ├── analytics/          Search Console dashboards
│       ├── reports/            generated reports
│       ├── settings/           company, team, integrations, billing, security
│       └── admin/              super-admin stats, companies, audit
├── components/ui/              shadcn-style primitives (cva + tailwind-merge)
├── components/…                feature components
├── lib/api-client.ts           fetch wrapper: credentials 'include', auto refresh on 401
├── lib/…                       hooks, query keys, formatters
└── .env.local                  NEXT_PUBLIC_API_URL
```

- Server components by default; `'use client'` only for forms, editor and interactive widgets.
- Forms: `react-hook-form` + `zodResolver` with schemas imported from `@acsp/shared` — the same rules the API enforces.
- Data fetching: TanStack Query on the client; the API is the only backend the browser talks to.
- Animation: `framer-motion`; icons: `lucide-react`; toasts: `sonner`; theming: `next-themes`.

## 8. Backend modules

One folder per feature under `apps/api/src/modules/<feature>/` with `<feature>.module.ts`, controller, service and `dto/`.

| Module | Responsibility | Phase |
| --- | --- | --- |
| `auth` | register, login, refresh rotation, logout, password, JWT strategies, cookie helper | 1 ✅ |
| `users` | tenant users CRUD, invitations | 1 ✅ |
| `companies` | company profile, usage summary, super-admin listing | 1 ✅ |
| `audit` | `AuditService` + listing endpoint | 1 ✅ |
| `admin` | platform stats | 1 ✅ |
| `health` | liveness/readiness (`/health`) | 1 ✅ |
| `websites` | websites, business profile, analysis job | 2 |
| `projects` | projects | 2 |
| `keywords` | keywords, clusters, import, research job | 2 |
| `research` | research-related read models (clusters, opportunities) | 2 |
| `content` | briefs, content, versions, AI actions, repurposing | 3–5 |
| `seo` | analyzer endpoints | 4 |
| `ai` | OpenAI client wrapper, cost tables, usage recording (shared with worker via `@acsp/shared` types) | 3 |
| `agents` | agent definitions and prompts shared with the worker | 3 |
| `publishing` | schedules, integrations dispatch | 6 |
| `analytics` | Search Console read models, reports | 6 |
| `subscriptions` | plans, Stripe, limit enforcement | 7 |
| `usage` | AI usage listing per company | 7 |
| `notifications` | in-app notifications | 7 |
| `files` | MinIO presigned uploads, `FileObject` | 3 |

Shared infrastructure lives in `apps/api/src/common/` (guards, decorators `@Public()`, `@Roles()`, `@CurrentUser()`, interceptors, filters, `PrismaService`, `QueueService`).

## 9. Worker structure

```
apps/worker/src/
├── main.ts                 boots one Worker per queue, graceful shutdown
├── processors/             one file per queue name from QUEUES
├── agents/                 orchestrator, research, seo, writing, quality
├── ai/                     OpenAI client, model selection, cost estimation, usage recorder
├── integrations/           wordpress, search-console, (later) linkedin, facebook, …
└── lib/                    prisma, logger, retry helpers
```

The worker is stateless; run more replicas to add throughput. Concurrency is set per queue (AI queues low, publishing/analytics higher).

## 10. Data ownership and tenancy

```mermaid
flowchart TD
  C[Company] --> U[Users]
  C --> W[Websites]
  C --> P[Projects]
  C --> I[Integrations]
  C --> S[Subscription]
  C --> AU[AI Usage]
  C --> AL[Audit Logs · Notifications · Files]
  W --> AS[Analytics Snapshots]
  P --> K[Keywords · Clusters]
  P --> BR[Content Briefs]
  P --> CO[Content]
  CO --> V[Content Versions]
  CO --> SA[SEO Analyses]
  P --> SP[Social Posts]
  P --> SC[Schedules]
```

- **Company owns** Users, Websites, Projects, Integrations, Subscription, AI Usage, Audit Logs, Notifications, Files.
- **Projects contain** Keywords, Clusters, Briefs, Content, SEO Analyses, Social Posts, Schedules.
- **Content stores multiple versions**; `Content.currentVersionId` points at the active one.
- Deleting a Company cascades through everything it owns. Deleting a Project cascades through its pipeline data. Users referenced as authors are `SetNull` so history survives.

Full details in [DATABASE.md](./DATABASE.md).

## 11. Cross-cutting concerns

| Concern | Implementation |
| --- | --- |
| Configuration | `@nestjs/config` reading the root `.env`; validated at boot |
| Logging | structured JSON (pino-style) with `requestId`, `userId`, `companyId`; worker logs `jobId`, `queue` |
| Errors | global exception filter → `{ statusCode, message, error }`; 5xx also logged with stack |
| Rate limiting | `@nestjs/throttler` with Redis storage: `THROTTLE_LIMIT` per `THROTTLE_TTL` seconds, stricter on `/auth/*` |
| Secrets | integration credentials encrypted with AES-256-GCM using `ENCRYPTION_KEY` |
| File storage | MinIO via S3 SDK; API issues presigned URLs; `FileObject` rows track ownership |
| API docs | Swagger decorators on every DTO/controller → `/api/docs` |
| Health | `/api/v1/health` checks DB and Redis connectivity |

## 12. Technology decisions

| Choice | Why |
| --- | --- |
| Next.js App Router | Server components for fast dashboards, a single React codebase, easy route groups for marketing/auth/app |
| NestJS | Opinionated modules, guards and pipes map directly onto RBAC + validation requirements; first-class Swagger |
| PostgreSQL + Prisma | Relational model with strong constraints (`@@unique` for tenancy), typed client shared by API and worker |
| Redis + BullMQ | Durable queues with retries, delays (scheduled publishing) and rate limiting, one dependency for several needs |
| MinIO | S3-compatible locally and in production; swap for AWS S3 by changing env |
| Separate worker app | AI latency never blocks HTTP; scale AI throughput independently of the API |
| Turborepo + pnpm | Cached builds, one command to run everything, strict workspace boundaries |
| Docker Compose | The whole stack — including Nginx — is reproducible on one host; Kubernetes is not required for v1 |

## 13. Scaling path

1. **Vertical first**: one host, Compose, more worker concurrency.
2. **Horizontal workers**: run N worker containers; BullMQ distributes jobs. Add per-company rate limiting on AI queues (Agency plan gets a priority queue).
3. **Stateless web/api replicas** behind Nginx; sessions are already stateless (JWT + Redis-backed throttling).
4. **Managed data**: move PostgreSQL to a managed service with read replicas for analytics queries; S3 instead of MinIO.
5. **Partition analytics**: `AnalyticsSnapshot` grows fastest — partition by month or move to a columnar store when > 100 M rows.
