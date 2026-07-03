# 📟 Opsly

Self-hosted PagerDuty-style incident management with **deep Slack integration** — on-call
rotations, escalation policies, alert deduplication, and a paging engine your team can drive
almost entirely from Slack.

- **Incidents**: trigger → acknowledge → resolve, with timelines, notes, urgency, and
  auto-escalation when nobody acknowledges in time.
- **On-call schedules**: daily / weekly / custom rotations, layers, time-of-day restrictions,
  overrides ("cover my shift"), timezone- and DST-correct handoffs.
- **Escalation policies**: multi-level (people and/or schedules), per-level timeouts, optional
  repeat loops.
- **Events API**: PagerDuty-compatible `POST /api/v1/events` endpoint with `dedup_key` folding,
  so Prometheus/Grafana/Datadog/cron alerts open and auto-resolve incidents.
- **Slack**: slash commands, Ack/Resolve/Escalate buttons, modals for creating everything, an
  App Home dashboard, and DM paging of whoever is on call.
- **Web dashboard + REST API** for setup and visibility.
- **Zero external services**: SQLite storage via Node's built-in driver. One process.

## Quickstart

```bash
npm install
cp .env.example .env    # optional; defaults work for a local try-out
npm run seed            # demo users, schedule, policy, service
npm start               # dashboard on http://localhost:3000
```

Without Slack credentials Opsly still runs fully (API + dashboard); notifications are logged to
the console. Add Slack and it becomes a pager.

## Slack setup (~5 minutes)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From an app
   manifest** → pick your workspace → paste [`slack-app-manifest.yaml`](./slack-app-manifest.yaml).
2. On **Basic Information** → **App-Level Tokens** → *Generate Token* with the
   `connections:write` scope → this is your `SLACK_APP_TOKEN` (`xapp-…`).
3. On **Install App** → install to your workspace → copy the **Bot User OAuth Token**
   (`xoxb-…`) → `SLACK_BOT_TOKEN`.
4. On **Basic Information** → copy the **Signing Secret** → `SLACK_SIGNING_SECRET`.
5. Put all three in `.env` and restart. You should see `[slack] connected via Socket Mode`.

Opsly uses **Socket Mode**, so it needs no public URL and works from behind a firewall.

Finally: invite the bot to the channel(s) you want incident posts in (`/invite @Opsly`), and set
that channel on each service (service settings in the dashboard, or pick it in
`/opsly service create`). Anyone who runs a command is linked to an Opsly user automatically —
no signup step.

## Run your team from Slack

| Command | What it does |
| --- | --- |
| `/incident` | Open the new-incident form |
| `/incident list [service]` | Open incidents, with Ack/Resolve buttons |
| `/incident 42` | Incident #42 with timeline + actions |
| `/incident ack 42` / `resolve 42` / `escalate 42` | Work an incident |
| `/incident note 42 rolling back` | Add a timeline note |
| `/incident assign 42 @dana` | Hand it to a person |
| `/oncall` | Who is on call right now, on every schedule |
| `/opsly status` | Open-incident summary |
| `/opsly service create` | New service (modal) |
| `/opsly schedule create` | New rotation (modal) |
| `/opsly schedule Platform primary` | Next two weeks of shifts |
| `/opsly override` | "I'll cover Alice tonight" (modal) |
| `/opsly policy create` | New escalation policy (modal) |
| `/opsly services` / `schedules` / `policies` / `users` | List things |
| `/opsly whoami` / `link` | Your linked profile |

Also in Slack:

- **Incident messages** in the service channel update live and carry
  **Acknowledge / Resolve / Escalate / Add note** buttons.
- **High-urgency pages arrive as DMs** to whoever is on call, with the same buttons.
- The **App Home** tab is a live dashboard: your incidents, all open incidents, who's on call,
  your upcoming shifts, and quick-create buttons.

## Paging model

```
alert/event ──> incident (triggered, level 1)
                 │  assign whoever level 1 resolves to
                 │  (schedules -> the person on call right now)
                 ▼
        DM the assignees + post to the service channel
                 │
                 │ nobody acks within the level timeout?
                 ▼
        escalate to level 2, page again … (repeat_count loops supported)
                 │
                 ▼
        acknowledged  ──>  resolved (manually, or by a "resolve" event)
```

- Escalation only auto-advances **high-urgency**, **unacknowledged** incidents.
- Acknowledging stops the clock. Escalating or reassigning re-pages and restarts it.
- Empty levels (e.g. a schedule with nobody on call) are skipped automatically.
- Repeat triggers with the same `dedup_key` fold into the open incident (alert counter goes up).

## Events API (hook up your monitoring)

Each service gets a routing key (dashboard → Services, or `/opsly service <name>`).

```bash
# open (or dedup into) an incident
curl -X POST http://localhost:3000/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{
    "routing_key": "rk_…",
    "event_action": "trigger",
    "dedup_key": "db-primary-cpu",
    "payload": {"summary": "DB primary CPU > 95%", "source": "prometheus", "severity": "critical"}
  }'

# auto-resolve when the alert clears
curl -X POST http://localhost:3000/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{"routing_key": "rk_…", "event_action": "resolve", "dedup_key": "db-primary-cpu"}'
```

`severity: critical|error` → high urgency (pages); `warning|info` → low urgency (notifies, no
paging). `acknowledge` events work too. The endpoint authenticates by routing key alone, so
monitoring tools don't need your API token.

## REST API

Everything the dashboard does is plain JSON under `/api/v1`:

```
GET/POST   /users            /services            /schedules            /escalation-policies
GET/PATCH/DELETE             …/:id
POST       /schedules/:id/overrides      DELETE /overrides/:id
POST       /services/:id/integrations    DELETE /integrations/:id
GET/POST   /incidents        GET /incidents/:id (timeline included)
POST       /incidents/:id/acknowledge | resolve | escalate | reassign | notes
GET        /oncalls          GET /incidents/stats        GET /users/:id/shifts
```

Incident endpoints accept either the UUID or the plain incident number (`/incidents/42/resolve`).
Set `API_TOKEN` in `.env` to require `Authorization: Bearer …` on everything except
`/api/v1/events`.

## Configuration

All via environment variables (see [`.env.example`](./.env.example)):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API + dashboard port |
| `DB_PATH` | `./data/opsly.db` | SQLite file (`:memory:` for throwaway) |
| `API_TOKEN` | _(unset)_ | Bearer token for the REST API + dashboard |
| `BASE_URL` | `http://localhost:PORT` | Used in links inside Slack messages |
| `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` / `SLACK_SIGNING_SECRET` | _(unset)_ | Enable Slack |
| `SLACK_DEFAULT_CHANNEL` | _(unset)_ | Fallback channel for services without one |
| `ESCALATION_SWEEP_SECONDS` | `15` | Escalation engine tick |
| `CRON_SECRET` | _(unset)_ | Extra bearer token accepted only by `/api/v1/escalation-sweep` (sent by Vercel Cron) |
| `SEED_ON_START` | _(unset)_ | `1` = ensure the demo dataset exists at startup (idempotent) |

## Deploy to Vercel

The repo is Vercel-ready: [`vercel.json`](./vercel.json) runs the whole app — dashboard, REST
API, events endpoint — as a single serverless function ([`api/index.ts`](./api/index.ts)), and
a Vercel Cron entry drives escalations by calling `GET /api/v1/escalation-sweep` every minute
in place of the in-process engine.

1. Import the repo at [vercel.com/new](https://vercel.com/new) — no framework or build
   settings needed; `vercel.json` covers everything.
2. Set environment variables (Project → Settings → Environment Variables):
   - `API_TOKEN` — **recommended**: the deployment is on the public internet, and this makes
     the REST API + dashboard require a bearer token.
   - `CRON_SECRET` — Vercel Cron sends it automatically as a bearer token, and the sweep
     endpoint then rejects unauthenticated callers.
   - `SEED_ON_START=1` — optional: recreates the demo data whenever the database starts empty.
3. Deploy. The dashboard is at the deployment URL; `POST /api/v1/events` works as usual.

Know the serverless trade-offs — this deployment is a **demo/evaluation**, not a durable pager:

- **Storage is ephemeral.** Serverless functions have no persistent disk, so SQLite lives in
  `/tmp`: each instance has its own database, wiped on cold starts. Nothing survives.
- **Slack is disabled.** Socket Mode needs a persistent WebSocket connection, which
  serverless functions can't hold. The API + dashboard still work fully, as in local
  no-Slack mode.
- **Escalations advance at the cron cadence, not every 15s.** Per-minute crons need a paid
  Vercel plan; Hobby crons only run about once a day. On Hobby, point any external scheduler
  (GitHub Actions schedule, cron-job.org, an uptime pinger) at
  `GET /api/v1/escalation-sweep` with `Authorization: Bearer $CRON_SECRET`.

For the real thing — durable SQLite, Slack Socket Mode, 15-second escalations — run the one
process on any persistent host (Fly.io, Railway, Render, a VPS, Docker):
`npm ci && npm run seed && npm start`.

## Development

```bash
npm run dev         # watch mode
npm test            # vitest: rotation math (incl. DST), lifecycle, escalation, dedup, HTTP API
npm run typecheck
npm run build       # emit dist/ (production: node dist/index.js)
```

Requires Node 22.x, ≥ 22.5 (uses the built-in `node:sqlite`). Pinned to the 22 line so
deploy platforms that auto-resolve `engines` (e.g. Vercel) build with the Node version the
app is tested on.

### Layout

```
src/
  domain/      users, services, schedules (rotation math), escalation-policies,
               incidents (state machine), events (dedup ingest), oncall
  engine/      escalation sweeper (DB-backed, restart-safe)
  slack/       Bolt app: commands, actions, modals, App Home, notifier, identity
  api/         Express REST API + events endpoint + static dashboard
  db/          node:sqlite schema & helpers
web/           dashboard (vanilla JS, no build step)
tests/         vitest suites
```
