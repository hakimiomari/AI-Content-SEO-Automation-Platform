# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately using one of these channels:

1. **GitHub private vulnerability reporting** — open the repository's *Security* tab and choose *Report a vulnerability*. This is the preferred channel.
2. **Email** — `security@<your-domain>` (replace with the address configured for this deployment). Encrypt sensitive details with the maintainer's PGP key if one is published in the repository.

Include as much of the following as you can:

- the affected component (`apps/web`, `apps/api`, `apps/worker`, `packages/*`, `docker/`) and version or commit,
- steps to reproduce or a proof of concept,
- the impact you believe it has (for example cross-tenant data access, privilege escalation, secret disclosure),
- any suggested fix.

## What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | within 3 business days |
| Initial assessment and severity | within 7 days |
| Fix for critical / high issues | as soon as possible, typically within 14 days |
| Fix for medium / low issues | next scheduled release |
| Public disclosure | coordinated with you after a fix is available; credit given unless you prefer otherwise |

We follow coordinated disclosure: please give us the opportunity to fix the issue before publishing details.

## Scope

In scope:

- authentication, session handling and token rotation,
- role-based access control and tenant isolation (any way for one company to read or modify another company's data),
- input validation, injection, SSRF through website analysis or integrations,
- handling of secrets (JWT secrets, `ENCRYPTION_KEY`, integration credentials, API keys),
- background job processing and AI prompt-injection paths that affect stored data,
- the Docker and Nginx configuration shipped in this repository.

Out of scope:

- vulnerabilities in third-party services (OpenAI, Stripe, WordPress, Google) — report those to the vendor,
- issues that require physical access or a compromised developer machine,
- rate-limit findings without a demonstrated impact,
- findings against deployments that changed the shipped configuration in insecure ways (for example `COOKIE_SECURE=false` in production).

## Supported versions

| Version | Supported |
| --- | --- |
| `main` branch | ✅ security fixes land here first |
| latest `0.x` release | ✅ |
| older `0.x` releases | ❌ upgrade to the latest release |

Until `1.0.0`, security fixes are released as new minor or patch versions of the `0.x` line.

## Security practices in this project

- Secrets are never committed; `.env.example` contains placeholders only.
- Dependencies are locked (`pnpm-lock.yaml`), post-install scripts are allow-listed, and `pnpm audit` runs in CI.
- The threat model, authentication design, RBAC matrix and production hardening checklist are documented in [docs/SECURITY.md](docs/SECURITY.md).

Thank you for helping keep the platform and its users safe.
