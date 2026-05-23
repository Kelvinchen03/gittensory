# Gittensory

Gittensory is a backend-only GitHub App/API layer for Gittensor registered repositories.

It gives maintainers and serious contributors advisory signals around repository configuration,
pull requests, issues, bounty context, duplicate risk, and queue health. It does not auto-label,
comment, close, merge, or store user GitHub PATs.

The product wedge is signal, not UI. Gittensory is not a replacement frontend for Gittensor or
gittensor-hub; it is a private API and GitHub App surface that exposes evidence-backed context
other frontends usually do not show clearly.

The frontend is intentionally out of scope for this repo slice. Lovable can consume the JSON API
and OpenAPI document once the backend is deployed.

## What It Does

- Helps contributors understand which repos fit their GitHub history and which submissions need
  cleanup before they become maintainer burden.
- Helps maintainers identify noisy queues, duplicate or overlapping work, missing issue linkage,
  stale PRs, and repo config problems.
- Helps repo owners see whether their Gittensor registration, labels, and participation lane are
  likely to attract useful work.
- Keeps the first intelligence layer deterministic and evidence-based. LLMs may summarize later,
  but core trust/ranking decisions stay rule-driven.

## Backend Stack

- Cloudflare Workers + Hono
- Cloudflare D1 + Drizzle schema/migrations
- Cloudflare Queues for async webhook/check processing
- GitHub App webhooks and check runs
- Zod schemas with generated OpenAPI JSON

## Local Setup

```bash
npm install
npm run cf-typegen
npm run db:migrate:local
npm run dev
```

Secrets are configured through Cloudflare, not committed:

```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put GITHUB_APP_PRIVATE_KEY
```

For local development, put non-production test values in `.dev.vars`.

## API

- `GET /health`
- `GET /openapi.json`
- `GET /v1/registry/snapshot`
- `GET /v1/repos`
- `GET /v1/repos/:owner/:repo`
- `GET /v1/repos/:owner/:repo/advisory`
- `GET /v1/repos/:owner/:repo/workboard`
- `GET /v1/repos/:owner/:repo/queue-health`
- `GET /v1/repos/:owner/:repo/collisions`
- `GET /v1/repos/:owner/:repo/config-quality`
- `GET /v1/repos/:owner/:repo/maintainer-packet`
- `GET /v1/repos/:owner/:repo/pulls/:number/advisory`
- `GET /v1/repos/:owner/:repo/issues/:number/advisory`
- `GET /v1/contributors/:login/profile`
- `GET /v1/contributors/:login/opportunities`
- `POST /v1/preflight/pr`
- `GET /v1/bounties`
- `GET /v1/bounties/:id/advisory`
- `POST /v1/github/webhook`
- `POST /v1/internal/jobs/refresh-registry`

## Validation

```bash
npm run validate
```
