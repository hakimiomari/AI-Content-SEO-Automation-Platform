# REST API

Base URL: `http://localhost:4000/api/v1` (development). Interactive documentation with every DTO is served by Swagger at **`/api/docs`**.

Legend: ✅ **live** (Phase 1) · 🔜 **planned** (later phase; shape may change).

## Table of contents

- [1. Conventions](#1-conventions)
- [2. Health](#2-health)
- [3. Auth](#3-auth)
- [4. Users and invitations](#4-users-and-invitations)
- [5. Companies](#5-companies)
- [6. Audit](#6-audit)
- [7. Admin](#7-admin)
- [8. Websites 🔜](#8-websites-)
- [9. Projects 🔜](#9-projects-)
- [10. Keywords and research 🔜](#10-keywords-and-research-)
- [11. Briefs and content 🔜](#11-briefs-and-content-)
- [12. SEO 🔜](#12-seo-)
- [13. Publishing and calendar 🔜](#13-publishing-and-calendar-)
- [14. Analytics 🔜](#14-analytics-)
- [15. Integrations 🔜](#15-integrations-)
- [16. Subscriptions, usage, notifications, files 🔜](#16-subscriptions-usage-notifications-files-)
- [17. Jobs 🔜](#17-jobs-)

## 1. Conventions

### Authentication

| Mechanism | Detail |
| --- | --- |
| Access token | JWT, 15 min (`JWT_ACCESS_TTL`), payload `{ sub, email, role, companyId, type: 'access' }` |
| Refresh token | JWT, 7 days (`JWT_REFRESH_TTL`), stored **hashed** in `RefreshToken`, rotated on every use |
| Cookies | `access_token` and `refresh_token`, `httpOnly`, `sameSite=lax`, `secure` in production, `domain=COOKIE_DOMAIN` |
| Header | `Authorization: Bearer <accessToken>` also accepted (CLI, tests, server-to-server) |
| Public routes | marked with `@Public()`; everything else requires a valid access token |

### Authorization

`@Roles('COMPANY_ADMIN')` on a handler is checked by `RolesGuard`. `SUPER_ADMIN` passes every role check. The permission → role mapping is in [SECURITY.md](./SECURITY.md#5-rbac-matrix).

### Tenancy

Every tenant-owned resource is scoped to the caller's `companyId`. A resource from another tenant returns `404`. `SUPER_ADMIN` may add `?companyId=<id>` to any tenant endpoint.

### Request validation

DTOs use `class-validator`; the global `ValidationPipe({ whitelist: true, transform: true })` strips unknown fields and coerces query types. The same rules exist as Zod schemas in `@acsp/shared` for the frontend.

### Responses

| Case | Shape |
| --- | --- |
| Single resource | `{ data: {...} }` |
| Created | `201 { data: {...} }` |
| List | `{ data: [...], meta: { page, limit, total, totalPages } }` |
| Accepted (job) | `202 { data: { jobId, queue } }` |
| Error | `{ statusCode, message, error, requestId? }` — `message` is a string or an array of validation messages |

### Pagination, search and sorting

`GET /resource?page=1&limit=20&search=acme&sort=createdAt&order=desc`. `limit` is capped (see `PAGINATION.MAX_LIMIT` in `@acsp/shared`).

### Status codes

| Code | Meaning here |
| --- | --- |
| `400` | validation failed |
| `401` | missing / expired token — the web client calls `/auth/refresh` once and retries |
| `402` | plan limit reached (`message` names the limit) |
| `403` | authenticated but role not allowed |
| `404` | not found, or belongs to another tenant |
| `409` | uniqueness conflict (email, slug, domain, term) |
| `429` | rate limited (`Retry-After` header) |

### Rate limits

`THROTTLE_LIMIT` requests per `THROTTLE_TTL` seconds per IP (defaults 120 / 60 s). `/auth/*` uses a stricter bucket (10 / 60 s).

### Audit

Every mutation writes an `AuditLog` row (action, entity, id, before, after, ip, user agent).

---

## 2. Health

| Method | Path | Auth | Status | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | public | ✅ | `{ status: 'ok', db: 'up', redis: 'up', uptime, version }` — used by Docker health checks |

## 3. Auth

| Method | Path | Auth | Status | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/register` | public | ✅ | Create user (`COMPANY_ADMIN`), company and `FREE` subscription. Body: `{ name, email, password, companyName }`. Sets cookies, returns `{ user, tokens }` |
| `POST` | `/auth/login` | public | ✅ | Body `{ email, password }`. Sets cookies, returns `{ user, tokens }`, updates `lastLoginAt`, audits `LOGIN` |
| `POST` | `/auth/refresh` | refresh cookie or body `{ refreshToken }` | ✅ | Verifies, revokes the used token, issues a new pair (rotation). Reuse of a revoked token revokes the whole family |
| `POST` | `/auth/logout` | access | ✅ | Revokes the current refresh token, clears cookies, audits `LOGOUT` |
| `POST` | `/auth/logout-all` | access | ✅ | Revokes every refresh token of the user |
| `GET` | `/auth/me` | access | ✅ | Current user with company `{ id, name, slug, plan, subscriptionStatus }` |
| `PATCH` | `/auth/password` | access | ✅ | Body `{ currentPassword, newPassword }`; revokes other sessions |
| `POST` | `/auth/forgot-password` | public | 🔜 | Email a reset token |
| `POST` | `/auth/reset-password` | public | 🔜 | Body `{ token, password }` |

Example:

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "owner@acme.local", "password": "Password123!" }
```

```json
{
  "data": {
    "user": { "id": "ck…", "email": "owner@acme.local", "name": "Acme Owner", "role": "COMPANY_ADMIN",
              "companyId": "ck…", "company": { "id": "ck…", "name": "Acme Demo Co", "slug": "acme-demo",
              "plan": "GROWTH", "subscriptionStatus": "ACTIVE" } },
    "tokens": { "accessToken": "eyJ…", "refreshToken": "eyJ…", "expiresIn": 900 }
  }
}
```

## 4. Users and invitations

| Method | Path | Roles | Status | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/users` | any (tenant) | ✅ | Paginated users of the caller's company |
| `GET` | `/users/:id` | any (tenant) | ✅ | One user |
| `POST` | `/users` | `COMPANY_ADMIN` | ✅ | Create a user directly (password set by admin); checks plan `users` limit |
| `PATCH` | `/users/:id` | `COMPANY_ADMIN` (self: name/avatar) | ✅ | Body `{ name?, avatarUrl?, role?, isActive? }`; role can never be `SUPER_ADMIN` |
| `DELETE` | `/users/:id` | `COMPANY_ADMIN` | ✅ | Cannot delete yourself or the last admin |
| `POST` | `/users/invite` | `COMPANY_ADMIN` | ✅ | Body `{ email, role }`; creates/refreshes an `Invitation`, audits `INVITE` |
| `GET` | `/users/invitations` | `COMPANY_ADMIN` | ✅ | Pending invitations of the company |
| `DELETE` | `/users/invitations/:id` | `COMPANY_ADMIN` | ✅ | Revoke an invitation |
| `POST` | `/users/accept-invite` | public | ✅ | Body `{ token, name, password }`; creates the user in the inviting company, logs in |

## 5. Companies

| Method | Path | Roles | Status | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/companies/me` | any (tenant) | ✅ | Company profile + subscription |
| `PATCH` | `/companies/me` | `COMPANY_ADMIN` | ✅ | Body from `updateCompanySchema`: `{ name?, slug?, industry?, description?, timezone?, locale?, logoUrl? }` |
| `GET` | `/companies/me/usage` | any (tenant) | ✅ | Plan limits vs. current counts: users, websites, projects, words, AI credits, social posts, integrations, plus AI cost this period |
| `GET` | `/companies` | `SUPER_ADMIN` | ✅ | Paginated list of all companies with plan and counts |
| `GET` | `/companies/:id` | `SUPER_ADMIN` | ✅ | Any company |
| `PATCH` | `/companies/:id` | `SUPER_ADMIN` | ✅ | Edit any company (e.g. change plan manually) |
| `DELETE` | `/companies/:id` | `SUPER_ADMIN` | ✅ | Delete a tenant and all its data |

## 6. Audit

| Method | Path | Roles | Status | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/audit` | `COMPANY_ADMIN` (own tenant), `SUPER_ADMIN` (all) | ✅ | Paginated; filters `action`, `entity`, `entityId`, `userId`, `from`, `to` |
| `GET` | `/audit/export` | `COMPANY_ADMIN` on Agency plan | 🔜 | CSV export |

## 7. Admin

| Method | Path | Roles | Status | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/admin/stats` | `SUPER_ADMIN` | ✅ | Platform totals: companies by plan, users, active users (30 d), content by status, AI tokens and cost (30 d), queue depths |
| `GET` | `/admin/usage` | `SUPER_ADMIN` | 🔜 | AI usage across tenants, grouped by company/feature/model |
| `GET` | `/admin/queues` | `SUPER_ADMIN` | 🔜 | BullMQ queue health, failed jobs, retry |

---

## 8. Websites 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/websites` | any | List |
| `POST` | `/websites` | `CONTENT_MANAGER`+ | `{ name, url, language?, country?, brandVoice?, businessProfile? }` — checks `websites` limit |
| `GET` | `/websites/:id` | any | Detail incl. `analysis` |
| `PATCH` | `/websites/:id` | `CONTENT_MANAGER`+ | Update profile |
| `DELETE` | `/websites/:id` | `COMPANY_ADMIN` | Cascade projects' `websiteId` to null |
| `POST` | `/websites/:id/analyze` | `CONTENT_MANAGER`+ | Enqueue `website-analysis` → `202 { jobId }` |

## 9. Projects 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/projects` | any | List with counts (keywords, content) |
| `POST` | `/projects` | `CONTENT_MANAGER`+ | `{ name, websiteId?, topic?, description?, goals? }` — checks `projects` limit |
| `GET` | `/projects/:id` | any | Detail |
| `PATCH` | `/projects/:id` | `CONTENT_MANAGER`+ | Update, change `status` |
| `DELETE` | `/projects/:id` | `COMPANY_ADMIN` | Cascade |

## 10. Keywords and research 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/projects/:projectId/keywords` | any | Filters `status`, `intent`, `clusterId`, `minOpportunity` |
| `POST` | `/projects/:projectId/keywords` | `CONTENT_MANAGER`+ | Add manually `{ term, intent?, clusterId? }` |
| `POST` | `/projects/:projectId/keywords/import` | `CONTENT_MANAGER`+ | CSV upload (multipart) |
| `PATCH` | `/projects/:projectId/keywords/:id` | `CONTENT_MANAGER`+ | Status, cluster, intent |
| `DELETE` | `/projects/:projectId/keywords/:id` | `CONTENT_MANAGER`+ | |
| `POST` | `/projects/:projectId/keywords/research` | `CONTENT_MANAGER`+ | `{ topic, seedKeywords?, country?, language? }` → enqueue `keyword-research`, `202 { jobId }` — checks `keywordsPerMonth` |
| `GET` | `/projects/:projectId/clusters` | any | Clusters with keyword counts |
| `POST` / `PATCH` / `DELETE` | `/projects/:projectId/clusters[/:id]` | `CONTENT_MANAGER`+ | Manage clusters |

## 11. Briefs and content 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/projects/:projectId/briefs` | any | List |
| `POST` | `/projects/:projectId/briefs` | `CONTENT_MANAGER`+ | `{ keywordId? \| clusterId?, generate?: boolean, …fields }`; `generate` asks the SEO Agent for the outline |
| `PATCH` | `/projects/:projectId/briefs/:id` | `CONTENT_MANAGER`+ | Edit, set `status` |
| `GET` | `/content` | any | Filters `projectId`, `status`, `contentType`, `search` |
| `POST` | `/content` | `CONTENT_MANAGER`+ | `{ projectId, briefId }` → `Content(GENERATING)` + enqueue `content-generation`, `202`; or `{ projectId, title, body }` for a manual draft — checks `wordsPerMonth` |
| `GET` | `/content/:id` | any | Content with current version and latest SEO analysis |
| `PATCH` | `/content/:id` | `CONTENT_MANAGER`+ | Metadata, `status` transitions (`DRAFT → IN_REVIEW → APPROVED`, audits `APPROVE`) |
| `DELETE` | `/content/:id` | `CONTENT_MANAGER`+ | Archive (`status=ARCHIVED`) |
| `GET` | `/content/:id/versions` | any | Version history |
| `POST` | `/content/:id/versions` | `CONTENT_MANAGER`+ | Save a user version `{ body, bodyJson, summary }` |
| `POST` | `/content/:id/versions/:versionId/restore` | `CONTENT_MANAGER`+ | Creates a new version from an old one |
| `POST` | `/content/:id/ai` | `CONTENT_MANAGER`+ | `{ action: rewrite \| improve \| shorten \| expand \| translate \| optimize_seo \| generate_cta, selection?, targetLanguage? }` → new version, records `AIUsage(CONTENT_EDIT)` |
| `POST` | `/content/:id/repurpose` | `CONTENT_MANAGER`+ | `{ platforms: SocialPlatform[] }` → enqueue `repurposing`, `202` — checks `socialPostsPerMonth` |
| `GET` | `/content/:id/social-posts` | any | Repurposed posts |
| `GET` / `PATCH` / `DELETE` | `/social-posts[/:id]` | `CONTENT_MANAGER`+ | Manage posts, approve |

## 12. SEO 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `POST` | `/seo/analyze` | `CONTENT_MANAGER`+ | `{ contentId, keyword? }` → synchronous heuristic analysis, stores `SEOAnalysis`, updates `Content.seoScore` (or `202` when queued for long documents) |
| `GET` | `/seo/analyses?contentId=` | any | History of scores |
| `POST` | `/seo/suggest-metadata` | `CONTENT_MANAGER`+ | `{ contentId }` → SEO Agent proposes `metaTitle`, `metaDescription`, headings |

## 13. Publishing and calendar 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/publishing/schedules?from&to&projectId` | any | Calendar feed |
| `POST` | `/publishing/schedules` | `CONTENT_MANAGER`+ | `{ contentId \| socialPostId, integrationId, scheduledFor }` → `Schedule(PENDING)` + delayed `publishing` job; content must be `APPROVED` |
| `PATCH` | `/publishing/schedules/:id` | `CONTENT_MANAGER`+ | Reschedule or cancel |
| `POST` | `/publishing/schedules/:id/publish-now` | `CONTENT_MANAGER`+ | Enqueue immediately |
| `POST` | `/publishing/schedules/:id/retry` | `CONTENT_MANAGER`+ | Re-enqueue a `FAILED` schedule |

## 14. Analytics 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/analytics/overview?websiteId&from&to` | any | Totals and daily series: clicks, impressions, CTR, average position |
| `GET` | `/analytics/pages?websiteId&from&to` | any | Top pages, matched to `Content.publishedUrl` |
| `GET` | `/analytics/keywords?websiteId&from&to` | any | Query performance, matched to `Keyword.term` |
| `POST` | `/analytics/sync` | `COMPANY_ADMIN` | `{ websiteId }` → enqueue `analytics-sync` |
| `POST` | `/analytics/reports` | `CONTENT_MANAGER`+ | `{ projectId, from, to, format }` → enqueue `report-generation`, `202` |
| `GET` | `/analytics/reports` | any | Generated reports (`FileObject` links) |

## 15. Integrations 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/integrations` | `COMPANY_ADMIN` | List (credentials never returned) |
| `POST` | `/integrations` | `COMPANY_ADMIN` | `{ provider, name, websiteId?, credentials, config? }` — credentials encrypted with AES-256-GCM; connection tested before saving; checks `integrations` limit |
| `PATCH` | `/integrations/:id` | `COMPANY_ADMIN` | Update config / rotate credentials |
| `DELETE` | `/integrations/:id` | `COMPANY_ADMIN` | Schedules referencing it get `integrationId=null` |
| `POST` | `/integrations/:id/test` | `COMPANY_ADMIN` | Live connectivity check |
| `GET` | `/integrations/oauth/:provider/start` | `COMPANY_ADMIN` | OAuth redirect (Search Console, LinkedIn, Facebook, YouTube) |
| `GET` | `/integrations/oauth/:provider/callback` | public (state-checked) | OAuth callback |

## 16. Subscriptions, usage, notifications, files 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/subscriptions/plans` | public | Plan catalogue from `PLAN_LIMITS` |
| `GET` | `/subscriptions/me` | `COMPANY_ADMIN` | Current subscription |
| `POST` | `/subscriptions/checkout` | `COMPANY_ADMIN` | `{ plan }` → Stripe Checkout session URL |
| `POST` | `/subscriptions/portal` | `COMPANY_ADMIN` | Stripe customer portal URL |
| `POST` | `/subscriptions/webhook` | Stripe signature | Updates plan/status, resets counters on renewal, audits `BILLING` |
| `GET` | `/usage` | `COMPANY_ADMIN` | `AIUsage` rows with filters `feature`, `model`, `from`, `to`; totals |
| `GET` | `/notifications` | any | Own notifications, unread count |
| `PATCH` | `/notifications/:id/read` · `POST /notifications/read-all` | any | Mark read |
| `POST` | `/files/presign` | `CONTENT_MANAGER`+ | `{ fileName, mimeType, size }` → presigned PUT URL + `FileObject` |
| `GET` | `/files/:id` | any | Metadata + public/presigned URL |

## 17. Jobs 🔜

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/jobs/:queue/:jobId` | any (job must belong to tenant) | `{ state, progress, result?, failedReason? }` for polling |
| `GET` | `/jobs/stream` | any | Server-sent events for the caller's jobs and notifications |
