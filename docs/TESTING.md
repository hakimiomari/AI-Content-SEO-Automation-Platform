# Testing

How the platform is tested: what each layer covers, which tools are used, how test data is created and what CI runs.

## Table of contents

- [1. Strategy](#1-strategy)
- [2. Tooling per package](#2-tooling-per-package)
- [3. Unit tests](#3-unit-tests)
- [4. Integration tests](#4-integration-tests)
- [5. End-to-end tests](#5-end-to-end-tests)
- [6. Worker and agent tests](#6-worker-and-agent-tests)
- [7. Test data and fixtures](#7-test-data-and-fixtures)
- [8. Running tests](#8-running-tests)
- [9. Continuous integration](#9-continuous-integration)
- [10. Definition of done](#10-definition-of-done)

## 1. Strategy

```mermaid
flowchart TB
  E2E["E2E — Playwright<br/>registration → publishing, a few golden paths"]
  INT["Integration — Supertest + real PostgreSQL/Redis<br/>every endpoint, tenancy, RBAC, jobs enqueued"]
  UNIT["Unit — Vitest / Jest<br/>services, schemas, guards, agents' deterministic parts, UI components"]
  E2E --> INT --> UNIT
```

| Layer | Question it answers | Speed | Where it runs |
| --- | --- | --- | --- |
| Unit | Does this function/service/component behave correctly in isolation? | ms | every push |
| Integration | Do controller + guards + service + database produce the right HTTP result, including cross-tenant `404`s and role `403`s? | s | every push (Docker services in CI) |
| E2E | Can a user go from registering to publishing in a real browser? | min | PRs to `main`, nightly |

Principles: test behaviour through public interfaces; no mocking Prisma in integration tests (use a real database); mock only the network edge (OpenAI, WordPress, Search Console); every bug fix adds a regression test.

## 2. Tooling per package

| Package | Runner | Helpers |
| --- | --- | --- |
| `packages/shared` | **Vitest** (`vitest run`) — already covers Zod schemas, `hasPermission`, `isPlanAtLeast` | — |
| `apps/api` | **Jest** (NestJS default) with `ts-jest`; **Supertest** for HTTP | `@nestjs/testing` `Test.createTestingModule`, a `TestApp` helper that boots the real app against `DATABASE_URL_TEST` |
| `apps/worker` | **Jest**; processors tested with an in-memory BullMQ or direct calls to the orchestrator | recorded OpenAI fixtures via `nock`/`msw` |
| `apps/web` | **Vitest** + **React Testing Library** for components and hooks; **Playwright** for E2E | `msw` to stub the API in component tests |

Coverage is collected by Turborepo (`outputs: ["coverage/**"]`); target ≥ 80 % lines on services and agents, no threshold on UI glue.

## 3. Unit tests

**What to cover**

- Services: business rules (plan limits, status transitions, refresh token rotation, invitation expiry, opportunity score, heuristic SEO analyzer, pricing).
- Guards and decorators: `JwtAuthGuard` with `@Public()`, `RolesGuard` with the hierarchy, tenant scoping helper.
- Shared package: every Zod schema's accept/reject cases, enum mirrors match Prisma (`Object.values(PrismaRole)` equals `Roles`).
- Web: form validation messages, `api-client` refresh-on-401 logic, permission-based rendering (`hasPermission`).

**Example (API service, Jest)**

```ts
describe('AuthService.refresh', () => {
  it('rotates the token and revokes the old one', async () => {
    const { service, prisma } = await createAuthTestbed();
    const { refreshToken } = await service.login({ email: 'owner@acme.local', password: 'Password123!' }, meta);
    const next = await service.refresh(refreshToken, meta);
    const old = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    expect(old?.revokedAt).not.toBeNull();
    expect(next.tokens.refreshToken).not.toEqual(refreshToken);
  });

  it('revokes the whole family when a revoked token is replayed', async () => { /* … */ });
});
```

Naming: `<file>.spec.ts` next to the code for the API/worker; `__tests__/*.test.ts` in shared and web.

## 4. Integration tests

Boot the Nest application once per file with a real PostgreSQL (schema pushed to a dedicated test database) and Redis; truncate tables between tests.

**Every module ships these cases**

| Case | Expectation |
| --- | --- |
| Happy path per endpoint | correct status and response shape (`{ data }`, `{ data, meta }`) |
| Validation | unknown fields stripped, invalid payload → `400` with messages |
| Unauthenticated | `401` |
| Wrong role | `403` (e.g. `COMPANY_USER` calling `POST /users/invite`) |
| **Cross-tenant** | user of company A requesting company B's id → `404` |
| Super admin override | `?companyId=` works only for `SUPER_ADMIN` |
| Plan limit | creating the (limit + 1)th website on Free → `402` |
| Audit | mutation creates an `AuditLog` row with the right `action`/`entity` |
| Jobs | AI endpoints enqueue the right queue with `companyId` in the payload (assert via BullMQ `getJobs`) — the worker is **not** run |
| Rate limit | `/auth/login` 11th call within 60 s → `429` |

**Example (Supertest)**

```ts
it('does not leak websites across tenants', async () => {
  const acme = await loginAs('owner@acme.local');
  const other = await loginAs('owner@other.local');
  const { body } = await api.post('/websites').set(acme.cookies).send(validWebsite).expect(201);
  await api.get(`/websites/${body.data.id}`).set(other.cookies).expect(404);
});
```

Database for tests: `DATABASE_URL_TEST=postgresql://platform:platform@localhost:5432/platform_test`; CI creates it in the Postgres service container.

## 5. End-to-end tests

Playwright against the full stack (`pnpm dev` or the Docker prod image), external providers mocked at the network edge with a local fake WordPress server and an OpenAI stub returning fixtures.

**Golden paths (the user journey)**

1. Register → company created → dashboard shows the company name.
2. Invite a teammate → accept invite in a second browser context → teammate sees the project but cannot open Settings → Billing.
3. Add website → analyze (stubbed) → analysis shown.
4. Create project → research keywords (stubbed) → clusters appear → shortlist one.
5. Generate brief → edit outline → mark ready.
6. Generate article (stubbed) → editor opens → run *improve* on a paragraph → version 2 exists → SEO score visible.
7. Approve → schedule to fake WordPress → job publishes → live URL shown.
8. Repurpose to LinkedIn and X → posts drafted.
9. Analytics page renders seeded snapshots.
10. Logout → protected route redirects to `/login`.

Tests are tagged `@smoke` (1, 4, 6, 7) for PR runs; the full suite runs nightly. Screenshots and traces are uploaded as CI artifacts on failure.

## 6. Worker and agent tests

- **Deterministic code** (opportunity score, readability, analyzer, pricing, `pickModel`, sanitiser, encryption helpers) → plain unit tests, 100 % coverage expected.
- **Agents** → recorded fixtures: one JSON response per agent task in `apps/worker/test/fixtures/openai/`; tests assert schema validity, persistence and `AIUsage` rows. Fixtures are re-recorded with a script when prompts change (`RECORD=1 pnpm --filter @acsp/worker test`), never in CI.
- **Processors** → call the processor function with a payload against the test database; assert rows and job progress; assert idempotency by running twice.
- **Retry behaviour** → simulate 429 twice then success; assert three attempts and one `AIUsage` row per successful call.
- **Prompt-injection guard** → a fixture web page containing "ignore previous instructions" must not change the schema-validated output.

## 7. Test data and fixtures

- `prisma/seed.ts` provides the baseline: super admin, Acme (Growth) with owner and editor, a website, a project and a cluster. Integration tests call the same seed functions programmatically, then add what they need.
- Factories (`test/factories/*.ts`) build valid DTOs with overrides: `websiteFactory({ domain: 'b.example' })`.
- A second tenant (`other.local`) exists in every integration file to make cross-tenant assertions trivial.
- Time is controlled with fake timers where expiry matters (tokens, invitations, schedules).
- No real API keys in tests; `OPENAI_API_KEY=test` and the client is stubbed.

## 8. Running tests

| Command | Runs |
| --- | --- |
| `pnpm test` | every package's tests via Turborepo (`turbo run test`) |
| `pnpm --filter @acsp/shared test` | shared package (Vitest) |
| `pnpm --filter @acsp/api test` | API unit + integration (needs `pnpm docker:up`) |
| `pnpm --filter @acsp/api test -- --coverage` | with coverage |
| `pnpm --filter @acsp/worker test` | worker |
| `pnpm --filter @acsp/web test` | web unit/component |
| `pnpm --filter @acsp/web e2e` | Playwright (expects the stack on :3000/:4000) |
| `pnpm lint && pnpm typecheck` | static checks — part of "tests" in CI |

Before integration tests locally: `pnpm docker:up` then `DATABASE_URL=$DATABASE_URL_TEST pnpm db:push`.

## 9. Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) on every push and PR:

```mermaid
flowchart LR
  I[install<br/>pnpm --frozen-lockfile] --> L[lint] --> T[typecheck] --> U[unit tests]
  I --> S[services: postgres:16, redis:7]
  S --> IT[integration tests<br/>prisma db push → jest]
  U --> B[build all apps]
  IT --> B
  B --> D[docker build<br/>api · web · worker]
  D -.->|main only| E2E[Playwright smoke]
```

- Node 22, pnpm from `packageManager`, Turborepo remote cache optional.
- Required checks for merging to `main`: lint, typecheck, unit, integration, build.
- `pnpm audit --prod` runs weekly and on dependency PRs.
- Coverage summary is posted as a PR comment; a drop of more than 2 % on services fails the check.

## 10. Definition of done

A PR that adds or changes a module is complete when:

- [ ] unit tests for new business rules
- [ ] integration tests for every new endpoint including `401`, `403`, cross-tenant `404`, validation `400`
- [ ] plan-limit and audit assertions where applicable
- [ ] worker processor tests with fixtures if a queue is touched
- [ ] E2E smoke path updated if the user journey changed
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass locally
