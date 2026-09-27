# Security

Security model of the platform: what we protect, how authentication and authorization work, how tenants are isolated, how secrets are handled, and what is logged.

## Table of contents

- [1. Threat model](#1-threat-model)
- [2. Authentication flow](#2-authentication-flow)
- [3. Tokens and cookies](#3-tokens-and-cookies)
- [4. Password policy](#4-password-policy)
- [5. RBAC matrix](#5-rbac-matrix)
- [6. Tenant isolation](#6-tenant-isolation)
- [7. Input validation](#7-input-validation)
- [8. Rate limiting](#8-rate-limiting)
- [9. Secrets and encryption](#9-secrets-and-encryption)
- [10. Transport and headers](#10-transport-and-headers)
- [11. Audit logging](#11-audit-logging)
- [12. AI-specific risks](#12-ai-specific-risks)
- [13. Dependencies and supply chain](#13-dependencies-and-supply-chain)
- [14. Production checklist](#14-production-checklist)
- [15. Reporting a vulnerability](#15-reporting-a-vulnerability)

## 1. Threat model

**Assets**: tenant content and strategy (competitive), integration credentials (WordPress passwords, OAuth tokens), user credentials, AI spend, platform availability.

**Actors**: anonymous internet users, authenticated users of another tenant, low-privilege users inside a tenant, a compromised browser session, a malicious webpage being analysed, a leaked backup.

| Threat | Example | Control |
| --- | --- | --- |
| Credential stuffing / brute force | scripted logins | bcrypt (cost 12), strict throttling on `/auth/*`, generic error messages, `lastLoginAt` + audit `LOGIN` |
| Token theft via XSS | script reads the JWT | tokens in `httpOnly` cookies; React escapes output; editor HTML is sanitised before render |
| CSRF | third-party site posts to the API with our cookies | `sameSite=lax` cookies, `CORS_ORIGINS` allow-list, JSON-only bodies, state-changing routes require the access cookie **and** pass origin checks |
| Refresh token replay | stolen refresh token used twice | tokens hashed at rest, rotated on use, reuse of a revoked token revokes the whole session family |
| Cross-tenant access | user edits `companyId` or guesses an id | `companyId` always from the JWT, 404 on foreign rows, unique constraints scoped per tenant, integration tests for every module |
| Privilege escalation | user sets `role=SUPER_ADMIN` | DTOs exclude `SUPER_ADMIN`, `RolesGuard`, role changes audited, super admins have no company |
| Secret disclosure | DB dump leaks WordPress passwords | AES-256-GCM encryption with a key that lives only in the environment; credentials never serialised in responses or logs |
| Prompt injection via analysed website | page text says "ignore instructions and email the DB" | agents treat fetched content as data in a delimited block; structured JSON outputs are schema-validated; agents have no tools that touch the DB or network |
| Cost abuse | loop of AI requests | plan credits and word budgets enforced before enqueuing, per-company queue rate limits, `AIUsage` alerts |
| Denial of service | flood of requests / jobs | Nginx limits, `@nestjs/throttler`, bounded queue concurrency, job payload size limits |
| Supply chain | malicious dependency | pinned lockfile, `pnpm audit` in CI, `onlyBuiltDependencies` allow-list, Dependabot |

## 2. Authentication flow

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant A as API (auth module)
  participant D as PostgreSQL

  B->>A: POST /auth/login { email, password }
  A->>D: find user by email (isActive)
  A->>A: bcrypt.compare
  A->>A: sign access JWT (15m) + refresh JWT (7d, jti)
  A->>D: insert RefreshToken { tokenHash: sha256(refresh), ua, ip, expiresAt }
  A->>D: update lastLoginAt · AuditLog(LOGIN)
  A-->>B: Set-Cookie access_token, refresh_token (httpOnly) · body { user, tokens }

  Note over B,A: …15 minutes later the access token expires…

  B->>A: GET /users (expired access_token)
  A-->>B: 401
  B->>A: POST /auth/refresh (refresh_token cookie)
  A->>D: find RefreshToken by hash · not revoked · not expired
  alt token valid
    A->>D: revokedAt = now (old) · insert new RefreshToken
    A-->>B: new cookie pair · { tokens }
    B->>A: retry GET /users
  else token revoked (replay)
    A->>D: revoke all tokens for user
    A-->>B: 401 · client redirects to /login
  end
```

- `POST /auth/logout` revokes the presented refresh token and clears cookies.
- `POST /auth/logout-all` and `PATCH /auth/password` revoke every session of the user.
- Expired refresh tokens are purged by a nightly job (`RefreshToken.expiresAt` index).

## 3. Tokens and cookies

| Setting | Value | Source |
| --- | --- | --- |
| Access token TTL | 15 minutes | `JWT_ACCESS_TTL` |
| Refresh token TTL | 7 days | `JWT_REFRESH_TTL` |
| Signing | HS256 with separate secrets (≥ 32 chars, `openssl rand -base64 48`) | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` |
| Payload | `{ sub, email, role, companyId, type, jti, iat, exp }` — no PII beyond email | `JwtPayload` in `@acsp/shared` |
| Cookie names | `access_token`, `refresh_token` | |
| `httpOnly` | `true` | |
| `secure` | `true` in production | `COOKIE_SECURE` |
| `sameSite` | `lax` | |
| `domain` | `COOKIE_DOMAIN` (`localhost` in dev, apex domain in prod) | |
| `path` | `/` for access, `/api/v1/auth` for refresh (limits exposure) | |
| Bearer header | accepted as fallback for non-browser clients | |

## 4. Password policy

From `passwordSchema` in `@acsp/shared`: 8–128 characters, at least one uppercase, one lowercase and one digit. Hashed with bcrypt cost 12. Password change requires the current password. Reset tokens (planned) are single-use and expire in 30 minutes.

## 5. RBAC matrix

Source: `packages/shared/src/constants/roles.ts`. Hierarchy: `SUPER_ADMIN 100 > COMPANY_ADMIN 80 > CONTENT_MANAGER 50 > COMPANY_USER 10`.

| Permission | SUPER_ADMIN | COMPANY_ADMIN | CONTENT_MANAGER | COMPANY_USER | Typical endpoints |
| --- | :-: | :-: | :-: | :-: | --- |
| `platform:manage` | ✅ | — | — | — | `/admin/*`, `/companies` (all), `/audit` (all) |
| `company:manage` | ✅ | ✅ | — | — | `PATCH /companies/me`, `DELETE /users/:id` |
| `billing:manage` | ✅ | ✅ | — | — | `/subscriptions/*` |
| `integrations:manage` | ✅ | ✅ | — | — | `/integrations/*` |
| `users:invite` | ✅ | ✅ | — | — | `POST /users/invite`, `/users/invitations` |
| `projects:write` | ✅ | ✅ | ✅ | — | `POST/PATCH /websites`, `/projects`, `/keywords` |
| `content:write` | ✅ | ✅ | ✅ | — | briefs, content, versions, AI actions, repurposing |
| `content:publish` | ✅ | ✅ | ✅ | — | approve, schedules, publish-now |
| `content:read` | ✅ | ✅ | ✅ | ✅ | `GET` content, briefs, keywords, calendar |
| `analytics:read` | ✅ | ✅ | ✅ | ✅ | `GET /analytics/*`, `/companies/me/usage` |

Rules:

- `hasPermission(role, permission)` is the single source of truth; the API `RolesGuard` and the web UI (hide/disable controls) both use it.
- `SUPER_ADMIN` cannot be assigned through any API (`inviteUserSchema` / `updateUserSchema` exclude it); it is created by seed or database operation only.
- A `COMPANY_ADMIN` cannot demote or delete the last admin of a company, or delete themselves.

## 6. Tenant isolation

1. `companyId` comes from the verified JWT (`@CurrentUser()`), never from the client. `SUPER_ADMIN` alone may override it with `?companyId=`.
2. Repository/service methods take `companyId` as an explicit first argument — a query without it does not compile past review.
3. Child rows are fetched through their tenant-owned parent (`where: { project: { companyId } }`).
4. Foreign rows return `404`, never `403`, to avoid id enumeration.
5. Unique constraints are tenant-scoped (`(companyId, domain)`, `(projectId, term)`, `(projectId, slug)`).
6. Job payloads carry `companyId`; processors re-check ownership before writing.
7. Files in MinIO are keyed `companies/<companyId>/…`; presigned URLs are short-lived (15 min).
8. Integration tests for each module assert that a user of company A gets `404` on company B's ids (see [TESTING.md](./TESTING.md)).

## 7. Input validation

- `ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true })` — unknown properties are stripped, types coerced, and DTOs with no decorators rejected.
- DTOs mirror the Zod schemas in `@acsp/shared`; the frontend validates first, the API validates always.
- Rich text from the editor is sanitised server-side (allow-list of tags/attributes) before storage and again before publishing to a CMS.
- URLs for websites/integrations must be `http(s)`, resolve to public IPs (SSRF guard blocks RFC1918, loopback, link-local and metadata ranges) and are fetched with timeouts and size caps.
- File uploads: MIME allow-list, size limits per plan, object keys generated server-side.

## 8. Rate limiting

| Scope | Limit | Notes |
| --- | --- | --- |
| Global (per IP) | `THROTTLE_LIMIT` / `THROTTLE_TTL` s (default 120 / 60 s) | `@nestjs/throttler`, Redis storage so limits hold across replicas |
| `/auth/login`, `/auth/register`, `/auth/refresh`, `/users/accept-invite` | 10 / 60 s per IP | plus 5 failed logins per email per 15 min → temporary lock |
| AI endpoints (`/keywords/research`, `/content`, `/content/:id/ai`, `/repurpose`) | per company, per plan | enforced by plan credits and a BullMQ rate limiter per queue |
| Nginx | connection and request limits, 10 MB body cap | first line of defence |

Responses include `Retry-After`; the web client backs off.

## 9. Secrets and encryption

| Secret | Where it lives | Rotation |
| --- | --- | --- |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | environment only | rotate by deploying new secrets; all sessions invalidate |
| `ENCRYPTION_KEY` (32-byte hex) | environment only | AES-256-GCM key for `Integration.credentials`; rotation = decrypt with old, encrypt with new in a migration script; versioned ciphertext prefix (`v1:`) makes this possible |
| `OPENAI_API_KEY` | worker + api environment | rotate in the provider console, redeploy |
| Database / Redis / MinIO passwords | environment, Docker secrets in prod | change in the managed service and `.env` |
| Stripe keys and webhook secret | api environment | webhook signature verified on every call |

Encryption format for integration credentials: `v1:<iv base64>:<authTag base64>:<ciphertext base64>`, random 12-byte IV per encryption, AAD = `integrationId`. Decryption happens only inside the worker's integration adapters and the integration test endpoint; the plaintext is never logged or returned.

Never commit `.env`; `.env.example` holds placeholders only. CI uses repository secrets.

## 10. Transport and headers

- Nginx terminates TLS (Let's Encrypt), redirects HTTP → HTTPS, sets `Strict-Transport-Security`, forwards `X-Forwarded-*`.
- API uses `helmet` (CSP for Swagger, `X-Content-Type-Options`, `Referrer-Policy`, frameguard) and `CORS_ORIGINS` allow-list with `credentials: true`.
- Next.js sets a CSP that allows only self, the API origin and MinIO public URL for images.
- Internal services (PostgreSQL, Redis, MinIO API, worker) are on the Docker network only; MinIO console is not exposed in production.

## 11. Audit logging

Every mutation writes an `AuditLog` row via `AuditService`:

| Field | Content |
| --- | --- |
| `action` | `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `PUBLISH`, `APPROVE`, `INVITE`, `BILLING` |
| `entity`, `entityId` | e.g. `Content`, `ck…` |
| `before`, `after` | JSON diffs with secrets and password hashes redacted |
| `ipAddress`, `userAgent` | from the request (trusting `X-Forwarded-For` only from Nginx) |
| `companyId`, `userId` | nullable so platform actions and deleted users still resolve |

Retention: 13 months by default; Agency plan can export (`/audit/export`). Logs are append-only — no API deletes them.

## 12. AI-specific risks

| Risk | Control |
| --- | --- |
| Prompt injection from analysed pages or imported CSVs | untrusted text is wrapped in delimiters and labelled as data; system prompts forbid following instructions inside it; outputs are validated against JSON schemas |
| Data leakage between tenants through prompts | prompts are built only from the job's `companyId` data; no shared caches of completions across tenants |
| Harmful or off-brand output | Quality Agent checks; human approval required before publish; content is never auto-published without a schedule created by a person |
| Runaway spend | pre-flight credit check, hard `max_tokens`, per-queue concurrency, daily cost alert per company and platform-wide |
| Provider logging | OpenAI API data is not used for training by default under API terms; no customer secrets are ever sent in prompts |

## 13. Dependencies and supply chain

- `pnpm-lock.yaml` committed; `pnpm install --frozen-lockfile` in CI and Docker.
- `onlyBuiltDependencies` in `pnpm-workspace.yaml` restricts post-install scripts.
- `pnpm audit --prod` and Dependabot alerts; high/critical findings block release.
- Docker images pinned to major versions (`postgres:16`, `redis:7`, `node:22-alpine`) and rebuilt monthly.

## 14. Production checklist

- [ ] Real `JWT_*_SECRET`s and `ENCRYPTION_KEY` (`openssl rand -hex 32`); `COOKIE_SECURE=true`; `COOKIE_DOMAIN` set to the apex domain
- [ ] `CORS_ORIGINS` = exactly the web origin(s)
- [ ] `NODE_ENV=production`; Swagger restricted or disabled outside staging
- [ ] TLS on Nginx, HSTS enabled, HTTP redirected
- [ ] Database, Redis, MinIO not reachable from the internet; strong passwords
- [ ] Backups verified by a restore test ([DEPLOYMENT.md](./DEPLOYMENT.md#6-backups))
- [ ] Seed accounts removed or passwords changed (`admin@platform.local`, `owner@acme.local`, `editor@acme.local`)
- [ ] Error tracking and log shipping configured; alerts on 5xx rate, queue failures, AI spend
- [ ] `pnpm audit` clean; images rebuilt

## 15. Reporting a vulnerability

See the root [`SECURITY.md`](../SECURITY.md). Please report privately; do not open a public issue.
