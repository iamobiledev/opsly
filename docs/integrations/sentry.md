# Sentry integration

ROWS Sentry context:

- Organization: `rows`
- Region URL: `https://us.sentry.io`
- Project: `rows-frontend-dev`
- Existing Slack channel: `#frontend-alerts` (`C0AK9BYH475`)

## Configure

1. Seed Opsly or create a Sentry integration in the UI.
2. Copy the generated URL:

   ```text
   https://<opsly-host>/api/webhooks/sentry/rows-sentry-frontend
   ```

3. In Sentry, configure an internal integration/service hook for `rows-frontend-dev`.
4. Subscribe to issue/error/alert events.
5. Store the Sentry signing secret as `SENTRY_WEBHOOK_SECRET`.

## Verification

Opsly verifies `Sentry-Hook-Signature` or `X-Sentry-Hook-Signature` with HMAC-SHA256 over the exact raw request body.

## Routing defaults

- Project `rows-frontend-dev` maps to service `ROWS Frontend`.
- Environments `key-health`, `steady-steps`, `amethyst`, and `radiant` are production-like.
- `error`, `fatal`, and critical frontend events become high-urgency incidents.
- Sentry source URLs and short ids are preserved on alerts.
