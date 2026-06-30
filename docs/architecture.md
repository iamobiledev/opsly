# Opsly architecture

Opsly is a TypeScript monorepo with three runtime responsibilities:

- `apps/web`: Next.js App Router dashboard, auth, API routes, webhook receivers, and Slack HTTP endpoints.
- `apps/worker`: BullMQ workers that normalize inbound events, create/update incidents, deliver notifications, and process escalations.
- `packages/db`: Prisma 7 schema, generated client, migrations, and ROWS seed data.
- `packages/core`: incident state machine, routing, redaction, schedules, escalation, notifications, crypto, and audit helpers.
- `packages/integrations`: Sentry, Nightwatch, and Slack adapters.

## Ingestion flow

1. Sentry or Nightwatch posts to `/api/webhooks/:provider/:routingKey`.
2. The route reads the raw body and verifies HMAC signatures before JSON parsing.
3. A redacted `InboundEvent` is stored with a SHA-256 payload hash for idempotency.
4. The event id is queued to Redis/BullMQ.
5. The worker normalizes the event into an `InboundSignal`.
6. Routing rules choose service, urgency, and suppression behavior.
7. The incident service deduplicates by service + dedupe key and creates/appends/resolves incidents.
8. Slack notification and escalation jobs are scheduled.

## Incident model

Incidents are state-machine controlled. Supported states are `triggered`, `acknowledged`, and `resolved`.
Every state-changing command emits a timeline entry. Audit entries are written for creation and can be extended for all admin mutations.

## Security boundaries

- Provider webhooks are accepted only after raw-body HMAC verification.
- Slack requests are verified with timestamp replay protection.
- Secrets are referenced from env or encrypted with AES-256-GCM.
- PII-heavy provider payloads are redacted before storage.
- Auth sessions use random tokens stored as SHA-256 hashes and HTTP-only cookies.
