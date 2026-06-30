# ROWS Opsly runbook

## Seeded services

### ROWS Frontend

- Source: Sentry
- Sentry org: `rows`
- Project: `rows-frontend-dev`
- Production-like environments: `key-health`, `steady-steps`, `amethyst`, `radiant`
- Other environment: `test`
- Slack channel: `#frontend-alerts` (`C0AK9BYH475`)

### ROWS Backend

- Source: Laravel Nightwatch
- Nightwatch org id: `9f2c42a7-1b3e-4886-acc0-275ead62523f`
- Nightwatch app id: `9f2c42c9-d339-4b43-8eac-00e04871c794`
- Environments: `Test`, `Dev Server`, `Amethyst`, `Stellar`, `Careers`
- Slack channel: `#backend-alerts` (`C098K02H8H0`)

## Cutover plan

1. Deploy Opsly web, worker, Postgres, and Redis.
2. Run migrations and seed data.
3. Install the Slack app and invite it to alert channels.
4. Configure Sentry webhook and send a test alert.
5. Configure Nightwatch webhook and send a test issue.
6. Compare Opsly incidents with existing direct Slack alerts for one business day.
7. Decide whether Opsly replaces direct Sentry/Nightwatch Slack posting or runs in parallel.

## Current known alert examples

- Sentry `ROWS-FRONTEND-DEV-1K`: React child object crash on applications/job listing pages.
- Nightwatch slow route `#521`: withholding federal candidate form exceeded 4s.
- Nightwatch exception `#519`: log file permission issue in Indeed inbound logging.

## Noise controls

- Suppress Laravel `/_debugbar/*` slow route alerts in `Dev Server`.
- Treat `Dev Server` backend alerts as warning unless explicitly critical.
- Treat customer environment exceptions as high urgency.
