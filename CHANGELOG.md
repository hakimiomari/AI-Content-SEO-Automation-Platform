# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until `1.0.0`, minor versions may contain breaking changes.

## [Unreleased]

### Planned

- Phase 2 — Websites, Projects, Keywords, Research Agent (see [docs/ROADMAP.md](docs/ROADMAP.md)).

## [0.1.0] — 2026-09-27

Phase 1 — Auth + SaaS core. Initial scaffold of the multi-tenant platform.

### Added

- **Monorepo**: pnpm workspaces + Turborepo, shared `tsconfig.base.json`, Prettier and ESLint configuration, `.editorconfig`, `.nvmrc`, root scripts for dev, build, lint, typecheck, test, database and Docker.
- **Database**: Prisma 6 schema for PostgreSQL 16 with 21 models (`Company`, `User`, `RefreshToken`, `Invitation`, `Website`, `Project`, `KeywordCluster`, `Keyword`, `ContentBrief`, `Content`, `ContentVersion`, `SEOAnalysis`, `SocialPost`, `Schedule`, `Integration`, `AnalyticsSnapshot`, `AIUsage`, `Subscription`, `Notification`, `FileObject`, `AuditLog`) and 17 enums; tenant-scoped unique constraints and indexes; idempotent seed with demo accounts (`admin@platform.local`, `owner@acme.local`, `editor@acme.local`).
- **`@acsp/shared`**: string-literal enum mirrors, Zod schemas (auth, common, company, website, project, keyword, content), `PLAN_LIMITS` for Free / Starter / Growth / Agency, `Permissions` + `hasPermission` + `roleAtLeast`, `QUEUES` with typed job payloads and `DEFAULT_JOB_OPTIONS`, API response types; Vitest tests.
- **`@acsp/database`**: generated Prisma client wrapper.
- **API (`@acsp/api`, NestJS 11)**: global prefix `/api/v1`, `ValidationPipe` with whitelisting, exception filter, Swagger at `/api/docs`, throttling, `GET /health`.
  - Auth: register (user + company + free subscription), login, refresh with hashed and rotated refresh tokens, logout, logout-all, me, change password; `httpOnly` cookies plus bearer support.
  - Guards and decorators: `JwtAuthGuard`, `@Public()`, `RolesGuard`, `@Roles()`, `@CurrentUser()`; tenant scoping with super-admin `?companyId=` override.
  - Users: CRUD, invitations (`/users/invite`, `/users/invitations`, `/users/accept-invite`), plan `users` limit.
  - Companies: `/companies/me`, `/companies/me/usage`, super-admin `/companies`.
  - Audit: `AuditService` on every mutation, `GET /audit`.
  - Admin: `GET /admin/stats`.
- **Web (`@acsp/web`, Next.js 15)**: App Router with `(marketing)`, `(auth)`, `(dashboard)` route groups, Tailwind CSS v4, shadcn-style UI primitives, `api-client` with automatic refresh on 401, login / register / accept-invite forms validated with shared Zod schemas, dashboard shell, company and team settings, admin stats page.
- **Worker (`@acsp/worker`)**: BullMQ worker skeleton with one worker per queue, graceful shutdown, OpenAI client wrapper and `AIUsage` recorder, processor stubs for all eight queues.
- **Docker**: `docker/docker-compose.yml` (PostgreSQL, Redis, MinIO) for development, `docker/docker-compose.prod.yml` (Nginx, web, api, worker, data services) for production, multi-stage Dockerfiles, Nginx configuration.
- **CI**: GitHub Actions workflow running install, lint, typecheck, test and build.
- **Documentation**: PRD, architecture, database (Mermaid ER diagram), API catalogue, security, AI agents, testing, deployment, roadmap, user journey, engineering conventions; animated SVG assets for the README; `CONTRIBUTING.md`, `SECURITY.md`, MIT `LICENSE`.

[Unreleased]: https://github.com/<your-github-user>/ai-content-seo-platform/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/<your-github-user>/ai-content-seo-platform/releases/tag/v0.1.0
