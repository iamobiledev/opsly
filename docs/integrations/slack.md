# Slack integration

ROWS Slack context:

- Current relevant channels:
  - `#frontend-alerts` (`C0AK9BYH475`)
  - `#backend-alerts` (`C098K02H8H0`)

## Slack app endpoints

Configure the Slack app with:

```text
Events:        https://<opsly-host>/api/slack/events
Interactivity: https://<opsly-host>/api/slack/interactions
Slash command: https://<opsly-host>/api/slack/commands
```

Set:

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- optional OAuth values `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`

## Scopes

Minimum useful bot scopes:

- `chat:write`
- `commands`
- `channels:read`
- `groups:read`
- `users:read`

Invite the bot to `#frontend-alerts` and `#backend-alerts`.

## Supported commands

- `/opsly incidents`
- `/opsly incident <id>`
- `/opsly ack <id>`
- `/opsly resolve <id> [note]`
- `/opsly escalate <id>`
- `/opsly oncall [team/service]`
- `/opsly trigger <title>`

Incident cards include Ack, Resolve, Escalate, Open in Opsly, and Open source alert buttons.
