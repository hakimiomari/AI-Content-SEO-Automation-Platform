## Summary

<!-- What does this PR change and why? Link the issue/ticket. -->

Closes #

## Type of change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` / `perf` — no behaviour change
- [ ] `docs` / `chore` / `ci`
- [ ] Database migration included (`prisma/migrations/*`)

## Affected packages

- [ ] `apps/web`
- [ ] `apps/api`
- [ ] `apps/worker`
- [ ] `packages/shared`
- [ ] `packages/database` / `prisma`
- [ ] `docker` / CI

## How to test

<!-- Steps a reviewer can follow locally. Include seed data, env vars or queue jobs to trigger. -->

1.
2.

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally
- [ ] Tenant scoping: every query on a tenant-owned entity filters by `companyId`
- [ ] Mutations write an `AuditLog` entry; AI calls record `AIUsage`
- [ ] New env vars are added to `.env.example` and documented
- [ ] Shared contracts (`@acsp/shared`) updated when enums / queue payloads / schemas change
- [ ] No secrets, tokens or customer data in code, fixtures or logs
- [ ] Commit messages follow Conventional Commits (`feat(api): …`)

## Screenshots / recordings

<!-- UI changes only -->
