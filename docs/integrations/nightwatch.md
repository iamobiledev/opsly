# Laravel Nightwatch integration

ROWS Nightwatch context observed from backend alerts:

- Application: `Rows Backend`
- Organization id: `9f2c42a7-1b3e-4886-acc0-275ead62523f`
- Application id: `9f2c42c9-d339-4b43-8eac-00e04871c794`
- Existing Slack channel: `#backend-alerts` (`C098K02H8H0`)
- Backend stack: Laravel 12 / PHP 8.4

## Configure

1. Seed Opsly or create a Nightwatch integration in the UI.
2. Copy the generated URL:

   ```text
   https://<opsly-host>/api/webhooks/nightwatch/rows-nightwatch-backend
   ```

3. In Nightwatch application settings for `Rows Backend`, configure a custom webhook.
4. Enable `issue.opened`, `issue.reopened`, and `issue.resolved`.
5. Store the webhook signing secret as `NIGHTWATCH_WEBHOOK_SECRET`.

Nightwatch supports one custom webhook per application. If Opsly is the canonical incident router, use Opsly for Slack fan-out rather than direct Nightwatch Slack for the same application.

## Verification

Opsly verifies `Nightwatch-Signature` with HMAC-SHA256 over the exact raw request body.

## Routing defaults

- Application `Rows Backend` maps to service `ROWS Backend`.
- Exceptions outside `Dev Server` become high-urgency incidents.
- Slow routes are severity-scored by duration/threshold ratio.
- `/_debugbar/*` in `Dev Server` is suppressed by default seed data.
