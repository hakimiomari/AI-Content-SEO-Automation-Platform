<p align="center">
  <img src="docs/assets/hero.svg" width="100%" alt="AI Content & SEO Automation Platform — animated hero banner">
</p>

<p align="center">
  <strong>A multi-tenant SaaS that turns a topic into researched, drafted, optimized, repurposed, published and measured content — AI does the repetitive work, humans keep approval and strategic control.</strong>
</p>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white">
  <img alt="NestJS 11" src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white">
  <img alt="Prisma 6" src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white">
  <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white">
  <img alt="BullMQ" src="https://img.shields.io/badge/BullMQ-queues-F59E0B">
  <img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white">
  <img alt="MinIO" src="https://img.shields.io/badge/MinIO-S3-C72E49?logo=minio&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-workspaces-F69220?logo=pnpm&logoColor=white">
  <img alt="Turborepo" src="https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="License MIT" src="https://img.shields.io/badge/License-MIT-22C55E">
  <img alt="Phase 1 · Auth & SaaS core" src="https://img.shields.io/badge/Phase%201-Auth%20%26%20SaaS%20core-7C3AED">
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#ai-agents">AI agents</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#repository-structure">Structure</a> ·
  <a href="#development-roadmap">Roadmap</a> ·
  <a href="#step-by-step-module-delivery">Module delivery</a> ·
  <a href="#scripts">Scripts</a> ·
  <a href="#environment-variables">Env</a> ·
  <a href="#documentation">Docs</a>
</p>

<img src="docs/assets/divider.svg" width="100%" alt="">

## What it does

<p align="center">
  <img src="docs/assets/pipeline.svg" width="100%" alt="The 10-step content journey: Register, Website, Project, Keywords, Brief, Article, Edit, Repurpose, Publish, Analytics">
</p>

A company signs up, describes its website and audience once, and from then on the platform proposes what to write, writes it, checks it, distributes it and reports on it. Every AI step is part of a pipeline with typed inputs, schema-validated outputs, usage accounting and a **human approval gate** before anything goes live. It is workflow automation — not another chatbot.

| Research & Strategy | Create & Optimize | Publish & Learn |
| --- | --- | --- |
| **Website analysis** — business profile, audience, tone, competitors extracted by AI and reused in every prompt | **AI article generation** — Writing Agent drafts from the brief in the brand voice, at the target length | **Repurposing** — Facebook, LinkedIn, Instagram captions, X posts, YouTube scripts, email newsletters, short-video scripts |
| **Keyword research** — Research Agent turns a topic into clusters with search intent and a 0–100 opportunity score | **Content editor** — rewrite, improve, shorten, expand, translate, optimize SEO, generate CTA; full version history | **Calendar & scheduling** — Approve → Schedule → Publish, with retries and clear failure reasons |
| **Content briefs** — SEO Agent proposes title, outline, FAQs, secondary keywords and word count; humans edit before drafting | **SEO analyzer** — title, meta description, H1, keyword density, headings, links, readability, FAQ coverage, images → heuristic score | **Publishing** — WordPress first; LinkedIn, Facebook, YouTube, Shopify, Webflow behind the same adapter interface |
| **Multi-tenant** — companies, roles (`SUPER_ADMIN`, `COMPANY_ADMIN`, `CONTENT_MANAGER`, `COMPANY_USER`), invitations | **Quality gate** — readability, repetition, completeness and factual-risk checks before a human sees the draft | **Analytics** — Google Search Console clicks, impressions, CTR, average position, top pages and keyword performance tied back to your content |
| **Plans & limits** — Free / Starter / Growth / Agency with enforced quotas | **AI usage accounting** — model, feature, tokens and estimated cost recorded for every call | **Audit log** — every mutation, login, approval and publish is recorded per tenant |

<img src="docs/assets/divider.svg" width="100%" alt="">

## Architecture

<p align="center">
  <img src="docs/assets/architecture.svg" width="100%" alt="Runtime architecture: Browser → Nginx → Next.js / NestJS → PostgreSQL, MinIO, Redis (BullMQ) → Worker → OpenAI">
</p>

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | **Next.js 15** (App Router), TypeScript, **Tailwind CSS v4**, shadcn/ui-style components, react-hook-form + **Zod**, TanStack Query, framer-motion | `apps/web` · port **3000** |
| API | **NestJS 11** REST under `/api/v1`, class-validator DTOs, Swagger at `/api/docs`, JWT guards, RBAC, throttling | `apps/api` · port **4000** |
| Database | **PostgreSQL 16** + **Prisma 6** — 21 models, tenant-scoped uniqueness and indexes | `prisma/schema.prisma` · port 5432 |
| Jobs | **Redis 7** + **BullMQ** — 8 queues, retries with exponential backoff, delayed jobs for scheduling | port 6379 |
| Worker | Node process running BullMQ processors and the **AI agents** against the **OpenAI API** | `apps/worker` · no public port |
| Storage | **MinIO** (S3-compatible) for uploads, featured images and generated reports | ports 9000 / console 9001 |
| Edge | **Nginx** reverse proxy with TLS in production | port 80 / 443 |
| Tooling | **pnpm** workspaces, **Turborepo**, Prettier, ESLint, **Docker Compose**, GitHub Actions | root |

**Request → queue → worker flow**

```
Browser ──HTTPS──▶ Nginx ──▶ NestJS API
                               │  1. ThrottlerGuard → JwtAuthGuard → RolesGuard → ValidationPipe
                               │  2. service enforces tenant scope (companyId from JWT) and plan limits
                               │  3. writes AuditLog, enqueues a BullMQ job { companyId, … }
                               └──▶ 202 Accepted { jobId }
Redis (BullMQ) ──▶ Worker ──▶ Orchestrator ──▶ Research / SEO / Writing / Quality agents ──▶ OpenAI
                               │  writes results + AIUsage rows to PostgreSQL, files to MinIO
                               └──▶ Notification → the UI polls or streams job state
```

The API only **enqueues**; the worker **processes**. Every job payload carries `companyId`, and every AI call becomes an `AIUsage` row. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

<img src="docs/assets/divider.svg" width="100%" alt="">

## AI agents

<p align="center">
  <img src="docs/assets/agents.svg" width="100%" alt="Orchestrator in the centre with Research, SEO, Writing and Quality agents orbiting">
</p>

| Agent | Responsibility | Output |
| --- | --- | --- |
| **Orchestrator** | Deterministic code that runs the recipe for each queue, validates every result, checkpoints progress, retries or falls back, records usage | ordered agent calls, `AIUsage` rows, notifications |
| **Research Agent** | Finds keyword opportunities for a topic and analyses websites | clusters (pillar, intent), keywords with estimated volume/difficulty and an opportunity score, website analysis |
| **SEO Agent** | Turns a keyword into an on-page plan and metadata | brief outline, FAQs, secondary keywords, `metaTitle`, `metaDescription`, heading fixes |
| **Writing Agent** | Produces and transforms prose in the brand voice | full drafts, editor actions (rewrite / improve / shorten / expand / translate / optimize SEO / CTA), repurposed posts |
| **Quality Agent** | Gates output before a human sees it | readability, repetition, completeness vs. outline, factual-risk flags, score and fix list |

Model selection is per plan (`gpt-4o-mini` by default, `gpt-4o` on Growth and Agency), every prompt separates instructions from untrusted data, and all outputs are validated against Zod schemas. Details: [docs/AI_AGENTS.md](docs/AI_AGENTS.md).

<img src="docs/assets/divider.svg" width="100%" alt="">

## Quick start

**Prerequisites:** Node **22+** (`.nvmrc` pins 24), **pnpm 10+** (`corepack enable` picks the pinned version), **Docker** (Desktop or Engine with Compose v2).

1. Clone and install (also generates the Prisma client):

   ```bash
   git clone https://github.com/<your-github-user>/ai-content-seo-platform.git
   cd ai-content-seo-platform
   pnpm install
   ```

2. Create your environment file and set at least `OPENAI_API_KEY`:

   ```bash
   cp .env.example .env
   ```

3. Start the infrastructure (PostgreSQL, Redis, MinIO):

   ```bash
   pnpm docker:up
   ```

4. Create the database schema:

   ```bash
   pnpm db:migrate        # applies migrations (recommended)
   # or, for a first quick start without migration files:
   pnpm db:push
   ```

5. Seed demo data:

   ```bash
   pnpm db:seed
   ```

   | Login | Password | Role |
   | --- | --- | --- |
   | `admin@platform.local` | `Password123!` | `SUPER_ADMIN` |
   | `owner@acme.local` | `Password123!` | `COMPANY_ADMIN` of *Acme Demo Co* (Growth plan) |
   | `editor@acme.local` | `Password123!` | `CONTENT_MANAGER` of *Acme Demo Co* |

6. Run everything with hot reload:

   ```bash
   pnpm dev
   ```

7. Open:

   | URL | Service |
   | --- | --- |
   | http://localhost:3000 | Web app |
   | http://localhost:4000/api/v1 | REST API (`GET /health`) |
   | http://localhost:4000/api/docs | Swagger UI |
   | http://localhost:9001 | MinIO console (`minioadmin` / `minioadmin`) |

Then:

```bash
pnpm test          # unit + integration tests across the workspace
pnpm build         # production builds for web, api, worker, shared
pnpm docker:prod   # full production stack (nginx, web, api, worker, postgres, redis, minio)
```

<img src="docs/assets/divider.svg" width="100%" alt="">

## Repository structure

```
ai-content-seo-platform/
├── apps/
│   ├── web/                 @acsp/web      Next.js 15 App Router · Tailwind v4 · shadcn-style UI      → :3000
│   │   ├── app/(marketing)  (auth)  (dashboard)/{dashboard,websites,projects,content,calendar,analytics,reports,settings,admin}
│   │   ├── components/ui    primitives (cva + tailwind-merge)
│   │   └── lib/api-client.ts  fetch with credentials + refresh-on-401
│   ├── api/                 @acsp/api      NestJS 11 · /api/v1 · Swagger /api/docs                    → :4000
│   │   └── src/modules/{auth,users,companies,audit,admin,health, …websites,projects,keywords,content,seo,publishing,analytics}
│   └── worker/              @acsp/worker   BullMQ processors · Orchestrator · Research/SEO/Writing/Quality agents
├── packages/
│   ├── shared/              @acsp/shared   enums · Zod schemas · PLAN_LIMITS · Permissions · QUEUES + job payloads
│   └── database/            @acsp/database generated Prisma client
├── prisma/                  schema.prisma · migrations/ · seed.ts
├── docker/                  docker-compose.yml (dev infra) · docker-compose.prod.yml · Dockerfiles · nginx/
├── docs/                    PRD · ARCHITECTURE · DATABASE · API · SECURITY · AI_AGENTS · TESTING · DEPLOYMENT · ROADMAP · USER_JOURNEY
│   └── assets/              animated SVG illustrations used by this README
├── .github/workflows/       CI
├── .env.example             every variable with a development default
├── package.json             root scripts (see below) · pnpm-workspace.yaml · turbo.json · tsconfig.base.json
├── CONTRIBUTING.md · CHANGELOG.md · SECURITY.md · LICENSE
└── README.md
```

<img src="docs/assets/divider.svg" width="100%" alt="">

## Development roadmap

<p align="center">
  <img src="docs/assets/roadmap.svg" width="100%" alt="Roadmap: Phase 1 shipped, Phase 2 up next, phases 3–7 planned">
</p>

| Phase | Scope | Deliverables | Status |
| --- | --- | --- | :-: |
| **1** | Auth + SaaS core | Monorepo, Prisma schema, shared package, auth (JWT + refresh rotation, cookies), users + invitations, companies + usage, audit log, admin stats, worker skeleton, Docker, CI, docs | ✅ |
| **2** | Projects & Keywords | Websites + business profile + AI analysis, projects, keywords + clusters, Research Agent job | ⬜ |
| **3** | AI Content | Content briefs, AI article generation, files/uploads | ⬜ |
| **4** | SEO & Editor | Heuristic SEO analyzer, rich editor with AI actions, version history, approval workflow | ⬜ |
| **5** | Repurposing | Social posts, newsletters, video scripts, calendar | ⬜ |
| **6** | Analytics & Integrations | Encrypted integrations, WordPress publishing, scheduling, Search Console analytics, reports | ⬜ |
| **7** | Billing & Production | Stripe subscriptions, limit enforcement, usage views, notifications, hardening, 1.0 | ⬜ |

Checklists per phase: [docs/ROADMAP.md](docs/ROADMAP.md).

<img src="docs/assets/divider.svg" width="100%" alt="">

## Step-by-step module delivery

The platform is shipped **one module per pull request**, in roadmap order, so every PR is reviewable and `main` is always deployable.

**Branch naming** — `feat/<phase>-<module>` (fixes: `fix/<module>-<issue>`, chores: `chore/<topic>`):

```
feat/2-websites   feat/2-projects   feat/2-keywords   feat/2-research
feat/3-briefs     feat/3-content    feat/4-editor     feat/4-seo
feat/5-repurposing feat/5-calendar  feat/6-publishing feat/6-analytics feat/6-integrations
feat/7-billing
```

**Commits** follow [Conventional Commits](https://www.conventionalcommits.org) with the package as scope: `feat(api): …`, `feat(web): …`, `feat(worker): …`, `feat(shared): …`, `feat(db): …`, `test(api): …`, `docs: …`, `chore(ci): …`.

**Workflow for one module**

```bash
git checkout main && git pull
git checkout -b feat/2-websites

# 1. schema + shared contracts first
git commit -m "feat(db): add Website business profile fields and migration"
git commit -m "feat(shared): add website schemas and website-analysis job payload"
# 2. API module with tests
git commit -m "feat(api): add websites module (CRUD, domain uniqueness, plan limit)"
git commit -m "test(api): cover websites endpoints incl. cross-tenant 404s"
# 3. worker processor
git commit -m "feat(worker): implement website-analysis processor with Research Agent"
# 4. UI
git commit -m "feat(web): add websites list, create form and analysis card"
# 5. docs
git commit -m "docs: mark websites endpoints live in API.md and tick roadmap"

git push -u origin feat/2-websites
gh pr create --fill          # the PR template in .github/ carries the checklist below
```

**PR checklist** (mirrored by the PR template)

- [ ] Scope is one module; title follows Conventional Commits
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass
- [ ] New endpoints have Swagger decorators, DTO validation and integration tests for `401` / `403` / cross-tenant `404` / `400`
- [ ] Mutations write `AuditLog`; plan limits enforced where relevant
- [ ] New queue work has `companyId` in the payload and records `AIUsage`
- [ ] `docs/API.md`, `docs/DATABASE.md`, `docs/ROADMAP.md`, `CHANGELOG.md` updated

<details>
<summary><strong>Suggested commit sequence for the coming modules</strong></summary>

| Order | Branch | Key commits |
| --- | --- | --- |
| 1 | `feat/2-websites` | `feat(api): websites module` · `feat(worker): website-analysis processor` · `feat(web): websites pages` |
| 2 | `feat/2-projects` | `feat(api): projects module` · `feat(web): projects list/detail` |
| 3 | `feat/2-keywords` | `feat(api): keywords + clusters CRUD, CSV import` · `feat(web): keyword table, cluster view` |
| 4 | `feat/2-research` | `feat(worker): Research Agent discover/cluster/score` · `feat(api): research endpoint + jobs polling` · `feat(web): research dialog with job progress` |
| 5 | `feat/3-briefs` | `feat(api): briefs CRUD with SEO Agent generation` · `feat(web): brief editor` |
| 6 | `feat/3-content` | `feat(api): content + versions, create from brief` · `feat(worker): content-generation recipe` · `feat(api): files module (MinIO presign)` · `feat(web): content list + generate flow` |
| 7 | `feat/4-editor` | `feat(web): Tiptap editor, autosave versions` · `feat(api): AI editor actions` · `feat(web): version history + restore` |
| 8 | `feat/4-seo` | `feat(api): heuristic SEO analyzer + suggest-metadata` · `feat(web): SEO panel` · `feat(api): approval workflow` |
| 9 | `feat/5-repurposing` | `feat(worker): repurposing processor with platform profiles` · `feat(api): social posts endpoints` · `feat(web): repurpose dialog + post cards` |
| 10 | `feat/5-calendar` | `feat(api): schedules read model` · `feat(web): calendar month/week views` |
| 11 | `feat/6-integrations` | `feat(api): integrations with AES-256-GCM credentials + connection test` · `feat(web): integrations settings` |
| 12 | `feat/6-publishing` | `feat(worker): WordPress adapter + publishing processor` · `feat(api): schedules, publish-now, retry` · `feat(web): schedule from content + calendar` |
| 13 | `feat/6-analytics` | `feat(worker): Search Console sync + report generation` · `feat(api): analytics endpoints` · `feat(web): analytics dashboards + reports` |
| 14 | `feat/7-billing` | `feat(api): subscriptions (Stripe checkout, portal, webhooks)` · `feat(api): usage + notifications` · `feat(web): billing, usage, notification center` · `chore: production hardening` |

</details>

Full conventions: [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

<img src="docs/assets/divider.svg" width="100%" alt="">

## Scripts

Run from the repository root (`package.json`).

| Script | What it does |
| --- | --- |
| `pnpm dev` | `turbo run dev` — web, api, worker and shared (watch) with hot reload |
| `pnpm build` | `turbo run build` — production builds, shared packages first |
| `pnpm lint` | ESLint in every package |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | all test suites (Vitest / Jest) |
| `pnpm clean` | remove build outputs and `node_modules` |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm db:generate` | `prisma generate` (also runs on `postinstall`) |
| `pnpm db:migrate` | `prisma migrate dev` — create and apply a migration locally |
| `pnpm db:deploy` | `prisma migrate deploy` — apply pending migrations in production |
| `pnpm db:push` | push the schema without migrations (quick local start) |
| `pnpm db:reset` | drop, recreate, migrate and seed |
| `pnpm db:seed` | run `prisma/seed.ts` |
| `pnpm db:studio` | open Prisma Studio |
| `pnpm docker:up` / `pnpm docker:down` / `pnpm docker:logs` | dev infrastructure (`docker/docker-compose.yml`) |
| `pnpm docker:prod` | build and start the production stack (`docker/docker-compose.prod.yml`) |

## Environment variables

Copy `.env.example` to `.env`. One root file is read by the API, the worker and Prisma; Next.js reads `apps/web/.env.local` (`NEXT_PUBLIC_API_URL`).

<details>
<summary><strong>All variables, grouped</strong></summary>

**App**

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | runtime mode |
| `APP_NAME` | `AI Content & SEO Automation Platform` | display name |
| `WEB_URL` | `http://localhost:3000` | public web origin (links, CORS) |
| `API_URL` | `http://localhost:4000` | API origin |
| `API_PORT` | `4000` | API listen port |
| `API_GLOBAL_PREFIX` | `api/v1` | route prefix |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated allow-list |

**Database**

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `platform` / `platform` / `platform` | container bootstrap |
| `DATABASE_URL` | `postgresql://platform:platform@localhost:5432/platform?schema=public` | Prisma connection |

**Redis / BullMQ**

| Variable | Default | Purpose |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | queues and throttling |

**Auth**

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_ACCESS_SECRET` | placeholder | ≥ 32 chars, `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | placeholder | separate secret for refresh tokens |
| `JWT_ACCESS_TTL` | `15m` | access token lifetime |
| `JWT_REFRESH_TTL` | `7d` | refresh token lifetime |
| `COOKIE_DOMAIN` | `localhost` | cookie domain |
| `COOKIE_SECURE` | `false` | `true` in production |
| `ENCRYPTION_KEY` | zeros | 32-byte hex, AES-256-GCM for integration credentials (`openssl rand -hex 32`) |

**Rate limiting**

| Variable | Default | Purpose |
| --- | --- | --- |
| `THROTTLE_TTL` | `60` | window in seconds |
| `THROTTLE_LIMIT` | `120` | requests per window per IP |

**OpenAI**

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | `sk-your-key` | API key used by the worker |
| `OPENAI_MODEL` | `gpt-4o-mini` | default model |
| `OPENAI_MODEL_PREMIUM` | `gpt-4o` | premium model (Growth, Agency) |

**MinIO / S3**

| Variable | Default | Purpose |
| --- | --- | --- |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` | `localhost` / `9000` / `false` | S3 endpoint |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `minioadmin` / `minioadmin` | credentials |
| `MINIO_BUCKET` | `platform-uploads` | bucket |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | public base URL for objects |

**Web (Next.js)**

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | API base for the browser |
| `NEXT_PUBLIC_APP_NAME` | `AI Content & SEO Platform` | display name |

</details>

Production values and rotation guidance: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#4-environment-variable-matrix).

<img src="docs/assets/divider.svg" width="100%" alt="">

## API at a glance

Base URL `http://localhost:4000/api/v1` · Swagger `http://localhost:4000/api/docs` · responses `{ data }` / `{ data, meta }` · errors `{ statusCode, message, error }`.

<details>
<summary><strong>Phase 1 endpoints (live)</strong></summary>

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | public | DB + Redis status |
| `POST` | `/auth/register` | public | create user + company + free subscription |
| `POST` | `/auth/login` | public | login, sets `access_token` / `refresh_token` cookies |
| `POST` | `/auth/refresh` | refresh cookie | rotate tokens |
| `POST` | `/auth/logout` | access | revoke current session |
| `POST` | `/auth/logout-all` | access | revoke all sessions |
| `GET` | `/auth/me` | access | current user + company |
| `PATCH` | `/auth/password` | access | change password |
| `GET` `POST` | `/users` | tenant / `COMPANY_ADMIN` | list / create users |
| `GET` `PATCH` `DELETE` | `/users/:id` | tenant / `COMPANY_ADMIN` | read / update / delete |
| `POST` | `/users/invite` | `COMPANY_ADMIN` | invite by email + role |
| `GET` | `/users/invitations` | `COMPANY_ADMIN` | pending invitations |
| `POST` | `/users/accept-invite` | public | accept with token |
| `GET` `PATCH` | `/companies/me` | tenant / `COMPANY_ADMIN` | company profile |
| `GET` | `/companies/me/usage` | tenant | plan limits vs. usage |
| `GET` | `/companies` | `SUPER_ADMIN` | all companies |
| `GET` | `/audit` | `COMPANY_ADMIN` / `SUPER_ADMIN` | audit log |
| `GET` | `/admin/stats` | `SUPER_ADMIN` | platform statistics |

</details>

<details>
<summary><strong>Planned endpoints (Phases 2–7)</strong></summary>

| Module | Endpoints |
| --- | --- |
| Websites | `GET/POST /websites`, `GET/PATCH/DELETE /websites/:id`, `POST /websites/:id/analyze` |
| Projects | `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id` |
| Keywords | `GET/POST /projects/:projectId/keywords`, `POST …/keywords/import`, `PATCH/DELETE …/keywords/:id`, `POST …/keywords/research`, `…/clusters` |
| Briefs & content | `…/briefs`, `GET/POST /content`, `GET/PATCH/DELETE /content/:id`, `…/versions`, `…/versions/:versionId/restore`, `POST /content/:id/ai`, `POST /content/:id/repurpose`, `/social-posts` |
| SEO | `POST /seo/analyze`, `GET /seo/analyses`, `POST /seo/suggest-metadata` |
| Publishing | `GET/POST /publishing/schedules`, `PATCH …/:id`, `POST …/:id/publish-now`, `POST …/:id/retry` |
| Analytics | `GET /analytics/overview`, `/pages`, `/keywords`, `POST /analytics/sync`, `/reports` |
| Integrations | `GET/POST /integrations`, `PATCH/DELETE /integrations/:id`, `POST …/:id/test`, `/integrations/oauth/:provider/*` |
| Billing & ops | `/subscriptions/*`, `/usage`, `/notifications`, `/files/presign`, `/jobs/:queue/:jobId`, `/admin/usage`, `/admin/queues` |

</details>

Full catalogue with request/response shapes: [docs/API.md](docs/API.md).

<img src="docs/assets/divider.svg" width="100%" alt="">

## Testing

Three layers: **unit** (services, guards, Zod schemas, deterministic agent code — Vitest/Jest), **integration** (Supertest against real PostgreSQL and Redis; every endpoint asserts `401`, `403`, validation `400` and cross-tenant `404`), **E2E** (Playwright through the user journey from registration to publishing with OpenAI and WordPress stubbed). CI runs lint → typecheck → unit → integration → build on every push. See [docs/TESTING.md](docs/TESTING.md).

## Deployment

Development runs infrastructure in Docker and apps on the host. Production is one `docker-compose.prod.yml`: Nginx (TLS), Next.js, NestJS, worker, PostgreSQL, Redis, MinIO — with nightly `pg_dump` and bucket mirroring, structured JSON logs, `/health` checks, queue and AI-spend alerts, and additive migrations for zero-downtime releases. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security

JWT access (15 min) + refresh (7 days, hashed, rotated) in `httpOnly` cookies; RBAC from a single permission map; strict tenant isolation (`companyId` from the token, foreign rows → `404`); DTO validation with whitelisting; Redis-backed rate limiting, stricter on `/auth/*`; AES-256-GCM for integration credentials; HTTPS at Nginx; an append-only audit log; prompt-injection defences in every agent. Threat model and checklists: [docs/SECURITY.md](docs/SECURITY.md). To report a vulnerability: [SECURITY.md](SECURITY.md).

<img src="docs/assets/divider.svg" width="100%" alt="">

## Documentation

| Document | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | index and reading order |
| [docs/PRD.md](docs/PRD.md) | product requirements: summary, objectives, roles, modules, functional and non-functional requirements, plans, metrics, vision |
| [docs/USER_JOURNEY.md](docs/USER_JOURNEY.md) | the 10-step journey with UI, API calls, jobs and data per step |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | components, request and job flows, ports, frontend/backend/worker structure, decisions |
| [docs/DATABASE.md](docs/DATABASE.md) | Mermaid ER diagram of the real schema, table-by-table notes, indexes, tenancy rules, migrations |
| [docs/API.md](docs/API.md) | REST conventions and the endpoint catalogue |
| [docs/SECURITY.md](docs/SECURITY.md) | threat model, auth sequence, cookies, RBAC matrix, isolation, secrets, rate limits, audit |
| [docs/AI_AGENTS.md](docs/AI_AGENTS.md) | agents, orchestration, prompt principles, structured outputs, model selection, cost control, failure handling |
| [docs/TESTING.md](docs/TESTING.md) | strategy, tooling, cases per layer, CI |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | local, Docker production, env matrix, Nginx, backups, monitoring, zero-downtime, runbook |
| [docs/ROADMAP.md](docs/ROADMAP.md) | phase checklists |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | engineering conventions shared by every package |
| [docs/assets/README.md](docs/assets/README.md) | how the animated SVGs are built and edited |

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch and commit conventions, the PR checklist, code style, and how to add a NestJS module, a Next.js page or a worker processor. Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Kamranullah Hakimi

<p align="center"><sub>Built with Next.js · NestJS · Prisma · BullMQ · OpenAI — a business operating system for content marketing where AI does the repetitive work and humans keep approval and strategic control.</sub></p>
