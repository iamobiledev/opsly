# Opsly

Opsly is a PagerDuty-style incident response and on-call platform for ROWS. It ingests alerts from Sentry and Laravel Nightwatch, deduplicates them into incidents, routes them through services and escalation policies, and coordinates responders through Slack and a web dashboard.

## What is included

- Multi-tenant organizations, teams, users, RBAC, and audit logging.
- Services, integrations, schedules, escalation policies, maintenance windows, and suppression rules.
- Incident and alert lifecycle: triggered, acknowledged, escalated, annotated, and resolved.
- Secure webhook ingestion for Sentry and Laravel Nightwatch using raw-body HMAC verification.
- Slack notifications, interactive actions, and slash command handlers.
- Next.js dashboard, Node.js worker, Prisma/Postgres persistence, Redis/BullMQ background jobs.
- ROWS defaults for `rows-frontend-dev`, `Rows Backend`, `#frontend-alerts`, and `#backend-alerts`.

## Local development

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web app runs on `http://localhost:3000`. The worker runs in a parallel process through the root `dev` script.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Integration setup

See the docs in `docs/integrations/`:

- Sentry: `docs/integrations/sentry.md`
- Laravel Nightwatch: `docs/integrations/nightwatch.md`
- Slack: `docs/integrations/slack.md`

## ROWS runbook

`docs/rows-runbook.md` captures the ROWS-specific service, channel, environment, and cutover plan.
