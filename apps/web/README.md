# @acsp/web

Next.js 15 (App Router) frontend for the AI Content & SEO Automation Platform. Tailwind CSS v4,
shadcn-style primitives, TanStack Query, react-hook-form + Zod schemas from `@acsp/shared`.

## Run

```bash
# from the repo root
pnpm install
pnpm --filter @acsp/shared build      # web imports the compiled package
pnpm --filter @acsp/web dev           # http://localhost:3000
```

`pnpm dev` at the root runs everything through Turborepo. `pnpm --filter @acsp/web typecheck | lint | build`.

## Environment

Copy `.env.example` to `.env.local`:

| Variable               | Default                          | Purpose                         |
| ---------------------- | -------------------------------- | ------------------------------- |
| `NEXT_PUBLIC_API_URL`  | `http://localhost:4000/api/v1`   | NestJS base URL (cookie auth)   |
| `NEXT_PUBLIC_APP_NAME` | `AI Content & SEO Platform`      | Branding in titles and the logo |

Auth is cookie-based (`access_token`, `refresh_token`, httpOnly, set by the API). The browser never
handles tokens; `src/lib/api-client.ts` sends `credentials: 'include'` and transparently calls
`POST /auth/refresh` once on a 401 before retrying.

## Folder map

```
src/
├── middleware.ts               cookie gate: protects the dashboard, bounces signed-in users off /login
├── app/
│   ├── layout.tsx              fonts, ThemeProvider, QueryProvider, MotionConfig, Toaster, title template
│   ├── globals.css             Tailwind v4 import, light/dark tokens, @theme inline, keyframes, utilities
│   ├── (marketing)/            public landing page (hero, 10-step journey, features, pricing, CTA)
│   ├── (auth)/                 /login, /register — react-hook-form + zodResolver(@acsp/shared)
│   └── (dashboard)/            authenticated shell + one route per module
├── components/
│   ├── ui/                     button, input, label, textarea, card, badge, skeleton, separator,
│   │                           avatar, tabs, dropdown-menu, sonner (no radix except react-slot)
│   ├── layout/                 sidebar, header, dashboard-shell, page-header, empty-state, page-transition, logo
│   ├── dashboard/              stat-card, usage-meter, getting-started, recent-activity, dashboard-overview
│   ├── marketing/              site-header, site-footer, hero, how-it-works, features, pricing, call-to-action
│   ├── auth/                   login-form, register-form, form-field, require-role, auth-form-skeleton
│   ├── settings/               settings-tabs (Profile · Company · Team · Integrations · Billing)
│   └── providers/              theme-provider, query-provider, motion-provider
├── hooks/                      use-user (useUser, useLogout), use-company (useCompany, useCompanyUsage)
└── lib/                        api-client, auth, constants (nav, roadmap), utils (cn, formatters)
```

## Where each module lands in later phases

| Route         | Phase | What replaces the placeholder                                                    |
| ------------- | ----- | -------------------------------------------------------------------------------- |
| `/websites`   | 2     | Website list, add/analyse flow, brand voice & audience editor                    |
| `/projects`   | 2     | Project CRUD, keyword research runs, clusters, strategy board                    |
| `/content`    | 3–4   | Brief builder, generation queue, editor with AI actions, SEO analyzer sidebar    |
| `/calendar`   | 5     | Repurposing variants, drag-and-drop schedule, WordPress/social publishing status |
| `/analytics`  | 6     | Search Console charts, per-article performance, keyword positions                |
| `/reports`    | 6     | Report builder, scheduled exports, shareable links                               |
| `/settings`   | 2 / 7 | Profile & company (2), team, integrations, billing (7)                           |
| `/admin`      | 7     | Tenant table, plan overrides, AI spend, audit log export (SUPER_ADMIN only)      |

Conventions: server components by default, `'use client'` only for state/effects; every API call goes
through `lib/api-client.ts`; icons from `lucide-react`; animation with `framer-motion`.
