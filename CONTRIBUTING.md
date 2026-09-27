# Contributing

Thanks for helping build the AI Content & SEO Automation Platform. This guide covers local setup, how we branch and commit, what a pull request needs, code style, and step-by-step recipes for the three most common additions: a NestJS module, a Next.js page and a worker processor.

Read [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) first — it is the short list of rules every package follows.

## Table of contents

- [Setup](#setup)
- [Development loop](#development-loop)
- [Branches](#branches)
- [Commits](#commits)
- [Pull requests](#pull-requests)
- [Code style](#code-style)
- [Adding a NestJS module](#adding-a-nestjs-module)
- [Adding a Next.js page](#adding-a-nextjs-page)
- [Adding a worker processor](#adding-a-worker-processor)
- [Changing the database schema](#changing-the-database-schema)
- [Documentation](#documentation)

## Setup

Prerequisites: Node 22+ (`.nvmrc` pins 24 — `nvm use`), pnpm 10+ (`corepack enable` uses the version pinned in `package.json`), Docker with Compose v2.

```bash
git clone https://github.com/<your-github-user>/ai-content-seo-platform.git
cd ai-content-seo-platform
pnpm install            # installs all workspaces and runs prisma generate
cp .env.example .env    # set OPENAI_API_KEY; the rest works locally as-is
pnpm docker:up          # postgres, redis, minio
pnpm db:migrate         # or pnpm db:push for a quick start
pnpm db:seed            # demo accounts (Password123!)
pnpm dev                # web :3000, api :4000 (+ /api/docs), worker
```

If `@acsp/shared` types are missing in an app, run `pnpm --filter @acsp/shared build` once (Turborepo does this automatically for `dev`/`build`).

## Development loop

| Task | Command |
| --- | --- |
| Run everything | `pnpm dev` |
| Run one app | `pnpm --filter @acsp/api dev` (also `@acsp/web`, `@acsp/worker`) |
| Lint / types | `pnpm lint` · `pnpm typecheck` |
| Tests | `pnpm test` · `pnpm --filter @acsp/api test -- --watch` |
| Format | `pnpm format` |
| Database | `pnpm db:studio` · `pnpm db:reset` |
| Logs | `pnpm docker:logs` |

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before opening a PR — CI runs the same.

## Branches

- `main` is always deployable. Work happens on short-lived branches and lands through pull requests.
- Naming: `feat/<phase>-<module>` for roadmap work (`feat/2-websites`), `fix/<module>-<short-issue>` (`fix/auth-refresh-race`), `chore/<topic>` (`chore/ci-cache`), `docs/<topic>`.
- One module per branch. If a module needs a schema change, the migration ships in the same PR, additive and backwards-compatible.
- Rebase on `main` before requesting review; squash-merge with a Conventional Commit title.

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<scope>): <imperative summary, lower case, no period>

[optional body: what and why, not how]
[optional footer: BREAKING CHANGE:, Closes #123]
```

| Type | Use for |
| --- | --- |
| `feat` | new user-visible capability |
| `fix` | bug fix |
| `refactor` | code change with no behaviour change |
| `perf` | performance |
| `test` | tests only |
| `docs` | documentation only |
| `chore` | tooling, dependencies, CI |
| `build` | Docker, build config |

Scopes are packages or areas: `api`, `web`, `worker`, `shared`, `db`, `docker`, `ci`, `docs`. Examples:

```
feat(api): add websites module with domain uniqueness and plan limit
feat(worker): implement keyword-research processor
fix(web): retry request once after refresh on 401
test(api): assert cross-tenant 404 for projects
docs: mark projects endpoints live in API.md
```

## Pull requests

Keep PRs reviewable: one module or one fix, ideally under ~600 changed lines excluding tests and generated files. Fill in the template (`.github/`) — it mirrors this checklist:

- [ ] Title follows Conventional Commits; description explains **why** and links the roadmap item or issue
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass locally
- [ ] New endpoints: DTOs with `class-validator` + Swagger decorators; integration tests for happy path, `400`, `401`, `403` and cross-tenant `404`
- [ ] Tenant scoping: every query on tenant-owned data filters by `companyId` from `@CurrentUser()`
- [ ] Mutations write an `AuditLog` via `AuditService`; plan limits enforced where applicable
- [ ] Queue work: payload extends `BaseJobPayload` (`companyId`), processor is idempotent, AI calls record `AIUsage`
- [ ] Schema changes: migration included, additive, `docs/DATABASE.md` updated
- [ ] Docs updated: `docs/API.md`, `docs/ROADMAP.md` checkbox, `CHANGELOG.md` under *Unreleased*
- [ ] No secrets, no `console.log` left behind, no `any` without a comment

Reviews focus on correctness, tenancy/security, and consistency with conventions. Two approvals are not required; one maintainer approval plus green CI is enough.

## Code style

- **TypeScript strict** everywhere. No `any` without a `// reason` comment. Prefer `unknown` + narrowing.
- **Prettier**: single quotes, 100 columns, trailing commas (`.prettierrc`). **ESLint** flat config per package. Run `pnpm format` before committing.
- **Naming**: files `kebab-case.ts`; classes `PascalCase`; functions and variables `camelCase`; enums and constants `UPPER_SNAKE` where they mirror Prisma enums.
- **Imports**: from `@acsp/shared` for enums, schemas, limits, permissions and queue names — never duplicate them. Never import Prisma in the web app.
- **Errors**: throw Nest `HttpException`s in the API (`NotFoundException`, `ForbiddenException`, `ConflictException`, …); never leak stack traces or Prisma errors to clients.
- **Async**: no floating promises; use `await` or return the promise. Long work goes to a queue.
- **Comments**: explain *why*, not *what*. Keep JSDoc on exported functions in `packages/*`.
- **Tests** live next to the code as `*.spec.ts` (API, worker) or under `__tests__/` (shared, web).

## Adding a NestJS module

Example: `websites`.

1. **Contracts first** in `packages/shared`:
   - add/extend Zod schemas in `src/schemas/website.ts` and export from `src/schemas/index.ts`;
   - add job payload types to `src/constants/queues.ts` if the module enqueues work.
2. **Schema** in `prisma/schema.prisma` if needed, then `pnpm db:migrate --name add_websites` (see [Changing the database schema](#changing-the-database-schema)).
3. **Create the module** at `apps/api/src/modules/websites/`:

   ```
   websites.module.ts
   websites.controller.ts
   websites.service.ts
   dto/create-website.dto.ts
   dto/update-website.dto.ts
   dto/website-query.dto.ts
   websites.service.spec.ts
   websites.e2e-spec.ts
   ```

4. **DTOs**: `class-validator` decorators mirroring the Zod schema, `@ApiProperty()` on every field.
5. **Controller**:

   ```ts
   @ApiTags('websites')
   @ApiBearerAuth()
   @Controller('websites')
   export class WebsitesController {
     constructor(private readonly websites: WebsitesService) {}

     @Get()
     list(@CurrentUser() user: AuthUser, @Query() query: WebsiteQueryDto) {
       return this.websites.list(user.companyId!, query);
     }

     @Post()
     @Roles('CONTENT_MANAGER')
     create(@CurrentUser() user: AuthUser, @Body() dto: CreateWebsiteDto, @Req() req: Request) {
       return this.websites.create(user.companyId!, user.id, dto, auditMeta(req));
     }
   }
   ```

6. **Service**: every method takes `companyId` first; check plan limits via `PLAN_LIMITS`; wrap mutations with `AuditService.log(...)`; return `{ data }` / paginated shapes through the shared helpers.
7. **Register** the module in `app.module.ts`.
8. **Tests**: unit-test business rules; integration-test each endpoint including a second tenant asserting `404`.
9. **Docs**: flip the endpoints in `docs/API.md` from planned to live; tick `docs/ROADMAP.md`; add a `CHANGELOG.md` line.

## Adding a Next.js page

Example: websites list under the dashboard.

1. **Route**: `apps/web/app/(dashboard)/websites/page.tsx` (server component). Fetch through the server-side API client; pass data to a client component only where interaction is needed.
2. **Loading and errors**: add `loading.tsx` and `error.tsx` siblings for the route segment.
3. **Forms**: `apps/web/components/websites/website-form.tsx` with `'use client'`, `react-hook-form` + `zodResolver(createWebsiteSchema)` imported from `@acsp/shared`; submit through `lib/api-client.ts`; show `sonner` toasts; invalidate TanStack Query keys.
4. **UI**: compose from `components/ui/*` (Button, Card, Input, Table, Dialog). Add a new primitive only if it will be reused; follow the `cva` + `tailwind-merge` pattern.
5. **Permissions**: hide or disable write actions with `hasPermission(user.role, 'projects:write')`; the API still enforces.
6. **Navigation**: add the entry to the dashboard sidebar config and, if it is a settings tab, to the settings layout.
7. **Empty state**: every list page has a first-run empty state that points to the next step of the user journey.
8. **Tests**: component tests for the form validation messages and permission-gated controls; add or extend the Playwright path if the journey changed.

## Adding a worker processor

Example: `website-analysis`.

1. **Queue name and payload** already exist in `@acsp/shared` (`QUEUES.WEBSITE_ANALYSIS`, `WebsiteAnalysisJob`); add them if not.
2. **Processor** at `apps/worker/src/processors/website-analysis.processor.ts`:

   ```ts
   export async function processWebsiteAnalysis(job: Job<WebsiteAnalysisJob>) {
     const { companyId, websiteId } = job.data;
     const website = await prisma.website.findFirst({ where: { id: websiteId, companyId } });
     if (!website) throw new UnrecoverableError('website not found for tenant');

     await job.updateProgress(10);
     const pages = await fetchSitePages(website.url);            // SSRF-guarded, size-capped
     const analysis = await researchAgent.analyzeWebsite({ website, pages, companyId, jobId: job.id });
     await prisma.website.update({ where: { id: websiteId }, data: { analysis, lastAnalyzedAt: new Date() } });
     await notify(companyId, job.data.userId, 'SUCCESS', 'Website analysis complete', `/websites/${websiteId}`);
     return { pages: pages.length };
   }
   ```

3. **Register** it in `main.ts` with the queue name, concurrency and `DEFAULT_JOB_OPTIONS`.
4. **Agent calls** go through `ai/client.ts` and must call `recordUsage()` with `feature`, `model`, tokens and `jobId` — this writes the `AIUsage` row and credit accounting.
5. **Idempotency**: use upserts keyed by natural keys; re-running a job must not duplicate rows.
6. **Failure**: throw for retryable errors (BullMQ retries with backoff); throw `UnrecoverableError` for permanent ones; always leave a `Notification` on final failure.
7. **API side**: the module enqueues with `QueueService.add(QUEUES.WEBSITE_ANALYSIS, payload)` and returns `202 { jobId }`.
8. **Tests**: run the processor against the test database with a recorded OpenAI fixture; assert rows, progress, `AIUsage`, and idempotency on a second run.

## Changing the database schema

1. Edit `prisma/schema.prisma`; keep the tenancy pattern (`companyId` or a path to it, tenant-scoped `@@unique`).
2. `pnpm db:migrate --name <change>` creates `prisma/migrations/<timestamp>_<change>/migration.sql`. Review the SQL.
3. Additive only for zero-downtime: add nullable columns, backfill, then tighten in a later migration. Never edit an applied migration.
4. Mirror new enums in `packages/shared/src/enums.ts` and update Zod schemas.
5. Update `docs/DATABASE.md` (ER diagram, table notes, indexes) and, if seed data changes, `prisma/seed.ts`.

## Documentation

- Every endpoint change updates `docs/API.md`; every schema change updates `docs/DATABASE.md`; every completed roadmap item ticks `docs/ROADMAP.md` and adds a `CHANGELOG.md` line.
- Diagrams are Mermaid in Markdown. The animated README illustrations are hand-edited SVGs — see [`docs/assets/README.md`](docs/assets/README.md) for the rules they must follow.
- Write for the next engineer: short sentences, tables for reference material, examples over prose.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
