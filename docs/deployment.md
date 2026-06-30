# Deployment

## Required services

- Next.js web runtime.
- Long-running Node.js worker.
- PostgreSQL 16+.
- Redis 7+.

## Recommended production topology

- Web: Vercel, Render, Fly.io, Railway, ECS, or any Node-compatible Next.js host.
- Worker: long-running container host such as Fly.io, Render worker, Railway worker, ECS, EC2, or a VPS.
- Database: managed Postgres.
- Queue: managed Redis.

## Environment variables

See `.env.example`. Required:

- `DATABASE_URL`
- `REDIS_URL`
- `APP_URL`
- `SESSION_SECRET`
- `SECRET_ENCRYPTION_KEY`
- `SENTRY_WEBHOOK_SECRET`
- `NIGHTWATCH_WEBHOOK_SECRET`
- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`

## Release steps

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @opsly/db prisma migrate deploy
pnpm build
pnpm --filter @opsly/db db:seed
```

Start web:

```bash
pnpm --filter @opsly/web start
```

Start worker:

```bash
pnpm --filter @opsly/worker dev
```

Use a process manager for the worker in production.
