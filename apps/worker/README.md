# @acsp/worker

BullMQ background worker for the AI Content & SEO Automation Platform. It consumes the queues
defined in `@acsp/shared` (`QUEUES`), runs the AI agents against OpenAI and writes results back
to Postgres through `@acsp/database` (Prisma).

The API only **enqueues** jobs; this process is the only thing that **processes** them.

## Running

```bash
# from the repo root — needs Postgres + Redis (pnpm docker:up) and a root .env
pnpm --filter @acsp/worker dev        # tsx watch src/main.ts
pnpm --filter @acsp/worker build      # tsc → dist/
pnpm --filter @acsp/worker start      # node dist/main.js
pnpm --filter @acsp/worker test       # vitest (pure helpers only, no DB/Redis needed)
pnpm --filter @acsp/worker typecheck
pnpm --filter @acsp/worker lint
```

In Docker the worker is built from `docker/Dockerfile.worker` and exposes a health endpoint on
`WORKER_HEALTH_PORT` (default `4001`): `GET /health` → `{ status, redis, queues, workers, aiConfigured }`.

Graceful shutdown on `SIGINT`/`SIGTERM`: workers stop taking jobs, in-flight jobs finish (30 s cap),
then Prisma and Redis connections are closed.

## Environment

Read from the repo-root `.env` (see `.env.example`), with `apps/worker/.env` as optional local override.

| Variable               | Default                  | Notes                                                        |
| ---------------------- | ------------------------ | ------------------------------------------------------------ |
| `DATABASE_URL`         | —                        | required                                                     |
| `REDIS_URL`            | `redis://localhost:6379` | BullMQ connection (`maxRetriesPerRequest: null`)             |
| `OPENAI_API_KEY`       | —                        | optional; without it AI jobs fail with `AIConfigurationError` |
| `OPENAI_MODEL`         | `gpt-4o-mini`            | default model (FREE / STARTER)                               |
| `OPENAI_MODEL_PREMIUM` | `gpt-4o`                 | used for GROWTH / AGENCY plans (`chooseModel`)               |
| `WORKER_CONCURRENCY`   | `3`                      | base concurrency per queue (content-generation uses half)    |
| `WORKER_HEALTH_PORT`   | `4001`                   | `0` disables the HTTP health server                          |
| `LOG_LEVEL`            | `info`                   | pino level; pretty output when `NODE_ENV=development`        |
| `ENCRYPTION_KEY`       | —                        | 32-byte hex; decrypts integration credentials (AES-256-GCM)  |
| `WEB_URL`              | `http://localhost:3000`  | used for links in notifications                              |

## Queues

| Queue               | Payload (`@acsp/shared`) | What it does                                                                                                                        | AI credits |
| ------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `keyword-research`  | `KeywordResearchJob`     | Research Agent → upserts `KeywordCluster`s and `Keyword`s (`source: 'ai'`, status `DISCOVERED`); never overwrites manual/GSC numbers | 1–2        |
| `website-analysis`  | `WebsiteAnalysisJob`     | Fetches the homepage (10 s timeout), parses with cheerio (title, meta, H1/H2, nav, CMS hints), AI builds `businessProfile`, `brandVoice`, topics | 1          |
| `content-generation`| `ContentGenerationJob`   | Orchestrator: SEO Agent → Writing Agent → Quality Agent (one revision loop) → `Content` + `ContentVersion`, status `DRAFT`           | 3–8        |
| `seo-analysis`      | `SeoAnalysisJob`         | `analyzeSeo()` from `@acsp/shared` on the current version → `SEOAnalysis` row + `Content.seoScore`                                    | 0          |
| `repurposing`       | `RepurposingJob`         | AI drafts platform-native posts/scripts; `truncateForPlatform()` enforces limits (X 280, LinkedIn 3000, Instagram 2200) → `SocialPost` DRAFTs | 1          |
| `publishing`        | `PublishingJob`          | Executes a `Schedule`; WordPress via REST + application password (credentials decrypted with `ENCRYPTION_KEY`); others → FAILED "not yet supported" | 0          |
| `analytics-sync`    | `AnalyticsSyncJob`       | Search Console sync scaffold: validates integration, `fetchSearchAnalytics()` → upserts `AnalyticsSnapshot`, sets `lastSyncAt` (OAuth in Phase 6) | 0          |
| `report-generation` | `ReportGenerationJob`    | Aggregates snapshots + content stats for a period, AI executive summary → `Notification` (MinIO/FileObject upload hook in Phase 7)   | 1          |

Every processor is built with `defineProcessor()` (`src/processors/define-processor.ts`): the payload is
validated with zod (invalid payloads fail immediately as `UnrecoverableError`), start/end/failure are
logged with the job id, and errors are re-thrown so BullMQ applies `DEFAULT_JOB_OPTIONS` (3 attempts,
exponential backoff). Plan-limit and configuration errors extend `UnrecoverableError` so they are not retried.

## Agents (`src/agents`)

| Agent            | Feature              | Input → Output                                                                                                                         |
| ---------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ResearchAgent`  | `KEYWORD_RESEARCH`   | topic, seeds, business profile, country/language → `{ clusters: [{ name, intent, pillar, keywords: [{ term, estimatedVolume, estimatedDifficulty, intent, opportunity, rationale }] }] }` |
| `SeoAgent`       | `CONTENT_BRIEF`      | keyword + brief → `{ title, metaTitle, metaDescription, slug, h1, outline: [{ h2, h3s, keyPoints }], faqs, internalLinkSuggestions }`   |
| `WritingAgent`   | `CONTENT_GENERATION` | SEO structure + brand voice → body HTML with exactly one `<h1>`; section-by-section generation above 1 500 words with rolling context   |
| `QualityAgent`   | `QUALITY_CHECK`      | html + keyword + brief → `{ score, readability, keywordUsage, repetition, completeness, issues, fixes }`; blends model judgement (60 %) with `analyzeSeo` heuristics (40 %); revises once below 75 |
| `Orchestrator`   | —                    | `generateArticle({ companyId, userId, projectId, briefId, contentId? })` — loads brief/project/website, chooses the model by plan, checks plan limits, runs the chain, persists content/version/SEO analysis, marks the brief `USED`, records word usage |

`BaseAgent` provides `completeJson()` (zod-validated JSON mode with one automatic repair round-trip),
`completeText()`, and prompt helpers. `EDITORIAL_RULES` (E-E-A-T, no fabricated data, no filler,
intent-matching headings) is appended to every system prompt.

### AI usage & billing

`AIClient.complete()` (`src/lib/ai.ts`) records an `AIUsage` row for every call (feature, model,
tokens, `estimatedCostUsd` from `MODEL_PRICING`, duration, job id) and increments
`Subscription.aiCreditsUsed` by one. `assertWithinLimits()` / `recordUsage()` in `src/lib/usage-guard.ts`
enforce `PLAN_LIMITS.wordsPerMonth` and `aiCreditsPerMonth` from `@acsp/shared`.

## Layout

```
src/
├── main.ts                  workers per queue, QueueEvents logging, health server, graceful shutdown
├── config.ts                dotenv (root .env) + zod-validated env
├── lib/                     logger, redis, prisma, ai (OpenAI wrapper), usage-guard, crypto, gsc, notifications, text
├── agents/                  base-agent, research, seo, writing, quality, orchestrator
└── processors/              one *.processor.ts per queue, define-processor, schemas, repurposing.limits
```
