# Product Requirements Document

**AI Content & SEO Automation Platform** · Version 1.0 · Status: Phase 1 shipped, Phase 2 in planning

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Problem and opportunity](#2-problem-and-opportunity)
3. [Objectives and non-goals](#3-objectives-and-non-goals)
4. [Target users and roles](#4-target-users-and-roles)
5. [Core modules](#5-core-modules)
6. [Functional requirements](#6-functional-requirements)
7. [Plans, limits and billing](#7-plans-limits-and-billing)
8. [Non-functional requirements](#8-non-functional-requirements)
9. [Success metrics](#9-success-metrics)
10. [Assumptions, dependencies and risks](#10-assumptions-dependencies-and-risks)
11. [Release plan](#11-release-plan)
12. [Final vision](#12-final-vision)

---

## 1. Executive summary

The platform is a **multi-tenant SaaS** that turns a business topic into published, measured content with as little manual work as possible. A company signs up, describes its website and audience, and the platform researches keywords, clusters them by intent, writes content briefs, drafts articles with AI, scores them for SEO, repurposes them into social posts and newsletters, publishes them to the company's CMS on a schedule and reports how they perform in Google Search Console.

It is **workflow automation, not another chatbot**: every AI step is embedded in a pipeline with explicit inputs, structured outputs, quality checks, usage accounting and a human approval gate before anything is published.

## 2. Problem and opportunity

| Today | Consequence | What the platform does instead |
| --- | --- | --- |
| Keyword research lives in spreadsheets exported from several tools | Slow, stale, disconnected from what gets written | Research Agent produces clusters + intent + opportunity scores directly inside the project |
| Briefs are written by hand, if at all | Drafts miss the search intent and the FAQ coverage | Briefs are generated from the cluster and edited before drafting |
| Generic chat tools produce drafts with no brand voice or SEO structure | Heavy editing, inconsistent quality | Writing Agent is grounded in the website business profile, brand voice and brief |
| SEO checks happen in a plugin after publishing | Rework after the fact | SEO Analyzer scores every version in the editor before approval |
| Repurposing for social is a separate manual job | Content is published once and forgotten | One click creates platform-specific posts linked to the article |
| Publishing and reporting are in different tools | Nobody closes the loop | Scheduler publishes to WordPress; analytics sync pulls Search Console data back onto the same content |

## 3. Objectives and non-goals

### Objectives

1. Ship a **production-ready SaaS** on Next.js 15, NestJS 11, PostgreSQL 16 + Prisma 6, Redis + BullMQ, MinIO, Docker and the OpenAI API.
2. Support **many companies on one deployment** with strict tenant isolation and per-plan limits.
3. Make every AI action **auditable and billable**: model, feature, tokens and estimated cost are recorded for every call.
4. Keep **humans in control**: nothing is published without an explicit approval; every content change is versioned and reversible.
5. Be **operable by a small team**: one `docker compose` file per environment, structured logs, health checks, backups.

### Non-goals (v1)

- Replacing a full CMS. The platform pushes to WordPress (later Shopify, Webflow); it does not host the public website.
- Paid search, backlink outreach, technical crawling of large sites.
- Real-time collaborative editing (Google Docs style). Versioning is per save, not per keystroke.
- Fine-tuning models. Quality comes from grounding and structured prompting, not custom weights.

## 4. Target users and roles

| Role | Who | Can |
| --- | --- | --- |
| `SUPER_ADMIN` | Platform operator | Everything, across all companies: admin dashboard, platform stats, impersonate a tenant with `?companyId=` |
| `COMPANY_ADMIN` | Agency owner, marketing lead | Manage the company profile, billing and subscription, integrations, invite and manage users, plus everything a Content Manager can do |
| `CONTENT_MANAGER` | Content marketer, editor | Create projects, run research, write and edit content, approve, schedule and publish; read analytics |
| `COMPANY_USER` | Stakeholder, client, junior contributor | Read content and analytics; comment-level participation without write access |

Permissions are defined once in `packages/shared/src/constants/roles.ts` and enforced by the API `RolesGuard`; the full matrix is in [SECURITY.md](./SECURITY.md#5-rbac-matrix).

## 5. Core modules

| # | Module | Purpose | Phase |
| --- | --- | --- | --- |
| 1 | Authentication | Register, login, refresh, logout, password change; JWT in httpOnly cookies | 1 ✅ |
| 2 | Companies | Tenant profile, slug, timezone/locale, usage summary; super-admin listing | 1 ✅ |
| 3 | Users | CRUD inside a tenant, invitations with expiring tokens, role changes | 1 ✅ |
| 4 | Audit Logs | Every mutation recorded with before/after, IP and user agent | 1 ✅ |
| 5 | Admin Dashboard | Platform-wide stats for super admins | 1 ✅ (stats API) |
| 6 | Websites | Website + business profile (audience, tone, products, USPs, competitors), AI website analysis | 2 |
| 7 | Projects | SEO project scoped to a website, with topic and goals | 2 |
| 8 | Keywords | Keyword list, statuses, clusters, intent, opportunity score, CSV import | 2 |
| 9 | SEO Research | Research Agent job producing clusters from a topic | 2 |
| 10 | Content Briefs | Title, outline, audience, tone, target words, secondary keywords, FAQs | 3 |
| 11 | AI Generation | Writing Agent drafts content from a brief as a background job | 3 |
| 12 | Content Editor | Rich text editor, AI actions, version history, metadata | 4 |
| 13 | SEO Analyzer | Heuristic checks producing a 0–100 score and suggestions | 4 |
| 14 | Repurposing | Social posts, newsletters and video scripts derived from an article | 5 |
| 15 | Calendar | Month/week view of scheduled content and posts | 5 |
| 16 | Publishing | Approve → Schedule → Publish to integrations; retries and results | 6 |
| 17 | Integrations | Encrypted credentials for WordPress, Search Console and social platforms | 6 |
| 18 | Analytics | Search Console sync, keyword and page performance, reports | 6 |
| 19 | AI Usage | Per-call token and cost accounting, per-company usage view | 7 (accounting exists from 1) |
| 20 | Billing | Plans, Stripe subscription lifecycle, limit enforcement | 7 |
| 21 | Notifications | In-app notifications for job completion, failures, invitations | 7 |

## 6. Functional requirements

### 6.1 Authentication and tenancy

- FR-1 Registration creates a **User (`COMPANY_ADMIN`) and a Company** in one transaction, with a `FREE` subscription.
- FR-2 Login returns an access token (15 min) and a refresh token (7 days). Both are set as `httpOnly` cookies and returned in the body for non-browser clients.
- FR-3 Refresh tokens are stored hashed, rotated on use, and can be revoked individually (`/auth/logout`) or for all sessions (`/auth/logout-all`).
- FR-4 Invitations are emailed tokens with an expiry; accepting one creates the user under the inviting company with the invited role.
- FR-5 Every tenant-owned query filters by the caller's `companyId`. `SUPER_ADMIN` may act on any tenant explicitly.

### 6.2 Websites and business profile

- FR-6 A website has a canonical domain (unique per company), language, country, brand voice and a JSON business profile.
- FR-7 "Analyze website" enqueues `website-analysis`; the result (positioning, audience, content gaps) is stored on the website and reused by every agent.

### 6.3 Keyword workflow

```
Topic → Research Agent → Keyword Clusters → Search Intent → Content Strategy → Content Brief
```

- FR-8 A project has a topic and optional seed keywords; "Research" enqueues `keyword-research`.
- FR-9 The Research Agent returns clusters (`pillar` flag, intent) and keywords with volume/difficulty estimates, a 0–100 opportunity score and `source = ai`.
- FR-10 Keywords move through `DISCOVERED → SHORTLISTED → PLANNED → IN_PROGRESS → PUBLISHED` (or `IGNORED`). Status changes are audited.
- FR-11 Manual and CSV/GSC imports are deduplicated by `(projectId, term)`.

### 6.4 Content briefs and AI generation

- FR-12 A brief can be generated from a keyword or cluster (SEO Agent proposes title, outline, FAQs, secondary keywords) and freely edited.
- FR-13 "Generate article" creates a `Content` row in `GENERATING`, enqueues `content-generation`, and on success stores version 1 with `source = ai:generate` and status `DRAFT`.
- FR-14 Generation respects `targetWords`, tone, audience, brand voice and the plan's word budget.

### 6.5 Content editor

- FR-15 AI actions on a selection or the whole document: **rewrite, improve, shorten, expand, translate, optimize SEO, generate CTA**. Each action creates a new `ContentVersion` with `source = ai:<action>`.
- FR-16 Version history lists all versions with summaries; any version can be restored (which creates a new version).
- FR-17 Metadata fields: title, slug (unique per project), excerpt, meta title, meta description, featured image, language.

### 6.6 SEO analyzer

- FR-18 Checks: title length and keyword presence, meta description, single H1, keyword density range, heading hierarchy, internal/external links, readability, FAQ coverage, image alt text. Each check has a weight; the weighted result is a 0–100 heuristic score stored as `SEOAnalysis` and copied to `Content.seoScore`.

### 6.7 Repurposing

- FR-19 From an approved or draft article, generate per-platform outputs: Facebook post, LinkedIn post, Instagram caption, X post (thread-aware), YouTube script, email newsletter, short-video script. Each becomes a `SocialPost` linked to the content.

### 6.8 Calendar, scheduling and publishing

- FR-20 Approve → Schedule → Publish. Approval sets `approvedAt`; scheduling creates a `Schedule` with `scheduledFor` and an integration; the publishing job runs at that time.
- FR-21 WordPress is the first publishing target (REST API with application password). LinkedIn, Facebook, YouTube, Shopify and Webflow follow.
- FR-22 Failures store `lastError`, increment `attempts`, retry with exponential backoff, and notify the author.

### 6.9 Analytics

- FR-23 Connecting Google Search Console enables a daily `analytics-sync` that stores clicks, impressions, CTR and average position per page and query as `AnalyticsSnapshot` rows.
- FR-24 Dashboards show totals, trends, top pages, keyword performance and the published content that produced them; reports can be generated as files in MinIO.

### 6.10 AI usage, notifications, audit

- FR-25 Every AI call writes `AIUsage` (feature, model, prompt/completion/total tokens, estimated cost, duration, job id).
- FR-26 Users get in-app notifications for long-running job completion and failures.
- FR-27 Every mutation writes an `AuditLog` row; company admins can browse their own logs, super admins all logs.

## 7. Plans, limits and billing

Values come from `packages/shared/src/constants/plans.ts` and are enforced server-side.

| Limit (per month unless noted) | Free | Starter | Growth | Agency |
| --- | ---: | ---: | ---: | ---: |
| Price (USD / month) | 0 | 29 | 79 | 199 |
| Users | 1 | 3 | 10 | 50 |
| Websites | 1 | 2 | 5 | 50 |
| Projects | 1 | 5 | 25 | 200 |
| Keywords researched | 50 | 500 | 2,500 | 20,000 |
| Words generated | 5,000 | 50,000 | 250,000 | 1,000,000 |
| AI credits | 50 | 500 | 2,500 | 15,000 |
| Social posts | 10 | 100 | 500 | 5,000 |
| Integrations | 1 | 3 | 10 | 100 |
| Features | Keyword research, AI drafts, SEO analyzer | + Repurposing, WordPress publishing, Calendar | + Search Console analytics, Premium AI model, Reports | + White-label reports, Priority queue, Audit logs export |

- Counters `wordsUsed` and `aiCreditsUsed` live on `Subscription` and reset each billing period.
- Exceeding a hard limit returns `402 Payment Required` with the limit name; the UI links to the upgrade page.
- Stripe manages checkout and invoices; webhooks update `Subscription.status`.

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | p95 API latency < 300 ms for CRUD; long work always goes to a queue and reports progress |
| Availability | Stateless web/api containers; single-node Docker Compose target with documented backups; no single request depends on OpenAI availability |
| Security | JWT + httpOnly cookies, RBAC, tenant isolation, DTO validation, rate limiting, AES-256-GCM secrets, HTTPS via Nginx, full audit log (see [SECURITY.md](./SECURITY.md)) |
| Observability | Structured JSON logs with request id and companyId, `/health`, queue metrics, error tracking hook |
| Data | PostgreSQL with Prisma migrations; nightly `pg_dump`; MinIO bucket versioning |
| Compliance | Deleting a company cascades to all tenant data; export of audit logs on Agency plan |
| Accessibility | shadcn/ui primitives, keyboard-navigable editor, WCAG AA colour contrast |
| Internationalisation | Content `language` per item; UI English first; translate action in editor |

## 9. Success metrics

| Metric | Target after 90 days of GA |
| --- | --- |
| Time from project creation to first approved article | < 1 hour of human time |
| Share of AI drafts approved with < 20 % edits | > 60 % |
| Average SEO score of published content | ≥ 80 |
| Publishing job success rate | ≥ 99 % (after retries) |
| AI cost per published article | tracked per plan; < 15 % of plan price at target usage |
| Weekly active companies / signed-up companies | > 40 % |

## 10. Assumptions, dependencies and risks

| Risk | Mitigation |
| --- | --- |
| OpenAI outages or rate limits | Retries with backoff, fallback model, jobs stay queued; UI shows job state |
| Model cost drift | Per-call cost estimates, monthly credit caps, cheaper default model with premium opt-in on Growth+ |
| Search Console quota | Daily incremental sync per website, exponential backoff, cached snapshots |
| WordPress variations (plugins, auth) | Application passwords first; connection test on integration create; clear error surface |
| Keyword volume accuracy without a paid data provider | Values are labelled as estimates; `source` recorded; provider adapters can be added later |
| Tenant data leakage through a forgotten filter | Convention + guard + integration tests asserting cross-tenant 404s |

## 11. Release plan

Seven phases, one module per PR. See [ROADMAP.md](./ROADMAP.md).

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Auth + SaaS core (companies, users, audit, admin stats, worker skeleton, docker, CI, docs) | ✅ shipped |
| 2 | Websites, Projects, Keywords, Research Agent | next |
| 3 | Briefs, AI content generation | |
| 4 | SEO analyzer, content editor with AI actions and versions | |
| 5 | Repurposing, calendar | |
| 6 | Publishing (WordPress), integrations, Search Console analytics | |
| 7 | Billing (Stripe), notifications, production hardening | |

## 12. Final vision

A **business operating system for content marketing**: the company describes who it is once; from then on the platform proposes what to write, writes it, checks it, distributes it and reports on it, while people spend their time on judgement — choosing the strategy, approving the work and steering the brand. AI does the repetitive work; humans keep approval and strategic control.
