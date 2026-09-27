# Documentation

Product and technical documentation for the **AI Content & SEO Automation Platform** — a multi-tenant SaaS that automates keyword research, SEO strategy, AI content generation, editing, repurposing, publishing and analytics.

> Source of truth for *how the code is written* is [`CONVENTIONS.md`](./CONVENTIONS.md). Everything else here explains *what* is being built and *why*.

## Index

| Document | Answers | Read it if you are… |
| --- | --- | --- |
| [PRD.md](./PRD.md) | What the product does, for whom, which modules exist and what "done" means for each | a product owner, a new engineer, anyone scoping work |
| [USER_JOURNEY.md](./USER_JOURNEY.md) | The 10-step path from registering a company to measuring published content | designing UI, writing E2E tests |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Components, request flow, job flow, ports, frontend and backend structure | building or deploying any app in the monorepo |
| [DATABASE.md](./DATABASE.md) | ER diagram of the real Prisma schema, every table, indexes and tenancy rules | touching `prisma/schema.prisma` or writing queries |
| [API.md](./API.md) | REST conventions and the endpoint catalogue (Phase 1 live, later phases planned) | writing a controller or calling the API from the web app |
| [SECURITY.md](./SECURITY.md) | Threat model, auth flow, cookie settings, RBAC matrix, tenant isolation, secrets, rate limits, audit | reviewing a PR that touches auth, guards or data access |
| [AI_AGENTS.md](./AI_AGENTS.md) | Research / SEO / Writing / Quality agents, the Orchestrator, prompt principles, cost control, failure handling | working in `apps/worker` |
| [TESTING.md](./TESTING.md) | Unit, integration and E2E strategy, fixtures, CI | adding or reviewing tests |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Local setup, Docker production stack, environment matrix, backups, monitoring, zero-downtime releases | running the platform anywhere |
| [ROADMAP.md](./ROADMAP.md) | The 7 delivery phases as checklists (Phase 1 complete) | planning the next module |
| [CONVENTIONS.md](./CONVENTIONS.md) | Workspace layout, HTTP/API rules, job rules, frontend rules, code style | writing code |
| [assets/README.md](./assets/README.md) | How the animated SVG illustrations are built and how to edit them | changing the README visuals |

## Suggested reading order

1. **PRD** → **USER_JOURNEY** to understand the product.
2. **ARCHITECTURE** → **DATABASE** → **API** to understand the system.
3. **SECURITY** and **AI_AGENTS** before touching auth or the worker.
4. **CONVENTIONS**, **TESTING**, **DEPLOYMENT** when you start shipping.

## Diagrams

Diagrams are written in [Mermaid](https://mermaid.js.org/) fenced blocks (` ```mermaid `) so GitHub renders them inline; no image export step is needed. The animated illustrations in [`assets/`](./assets) are pure SVG and render in GitHub `<img>` tags.

## Keeping docs current

- A PR that adds an endpoint updates [API.md](./API.md) and the Swagger decorators in the same change.
- A PR that changes `prisma/schema.prisma` updates the ER diagram and table notes in [DATABASE.md](./DATABASE.md).
- A PR that finishes a roadmap item ticks its checkbox in [ROADMAP.md](./ROADMAP.md) and adds a line to the root [`CHANGELOG.md`](../CHANGELOG.md).
