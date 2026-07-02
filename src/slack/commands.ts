import { DateTime } from 'luxon';
import type { App, RespondFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import type { AppCtx } from '../context.js';
import { DomainError } from '../db/index.js';
import type { User } from '../types.js';
import * as incidents from '../domain/incidents.js';
import { listServices, findServiceByName, listIntegrations } from '../domain/services.js';
import { listSchedules, findScheduleByName, renderShifts, listOverrides } from '../domain/schedules.js';
import { listPolicies } from '../domain/escalation-policies.js';
import { listUsers, findUser, findUserBySlackId } from '../domain/users.js';
import { whoIsOnCall } from '../domain/oncall.js';
import { ensureUser } from './identity.js';
import {
  helpBlocks,
  incidentBlocks,
  incidentListBlocks,
  oncallBlocks,
  timelineBlocks,
} from './blocks.js';
import { esc, fmtTime, fmtUser, incidentOneLiner, statusEmoji } from './format.js';
import { incidentCreateModal, overrideModal, policyCreateModal, scheduleCreateModal, serviceCreateModal } from './modals.js';

async function say(respond: RespondFn, blocksOrText: any, text = 'Opsly'): Promise<void> {
  if (typeof blocksOrText === 'string') {
    await respond({ response_type: 'ephemeral', text: blocksOrText });
  } else {
    await respond({ response_type: 'ephemeral', text, blocks: blocksOrText });
  }
}

function errText(err: unknown): string {
  return `⚠️ ${err instanceof DomainError ? err.message : 'Something went wrong'}`;
}

/** `12`, `#12`, `INC-12` -> incident detail (or throws DomainError). */
function incidentByRef(ctx: AppCtx, ref: string): incidents.IncidentDetail {
  const n = parseInt(ref.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n)) throw new DomainError(`"${ref}" is not an incident number`);
  const incident = incidents.findIncidentByNumber(ctx.db, n);
  if (!incident) throw new DomainError(`Incident #${n} not found`);
  return incident;
}

/** Parse Slack's escaped mention (<@U123|name> or <@U123>) into the raw user id. */
function parseMention(token: string | undefined): string | null {
  if (!token) return null;
  const m = token.match(/^<@([A-Z0-9]+)(\|[^>]*)?>$/i);
  return m ? m[1]! : null;
}

async function openModal(client: WebClient, triggerId: string, view: any, respond: RespondFn): Promise<void> {
  if (view && typeof view === 'object' && 'error' in view) {
    await say(respond, `⚠️ ${view.error}`);
    return;
  }
  await client.views.open({ trigger_id: triggerId, view });
}

export function registerCommands(app: App, ctx: AppCtx): void {
  // ------------------------------------------------------------------ /incident
  app.command('/incident', async ({ ack, command, client, respond }) => {
    await ack();
    const user = await ensureUser(ctx, client as WebClient, command.user_id);
    const [sub = '', ...rest] = command.text.trim().split(/\s+/).filter(Boolean);
    try {
      switch (sub.toLowerCase()) {
        case '': {
          await openModal(client as WebClient, command.trigger_id, incidentCreateModal(ctx), respond);
          return;
        }
        case 'help': {
          await say(respond, helpBlocks());
          return;
        }
        case 'list': {
          const serviceName = rest.join(' ').trim();
          let serviceId: string | undefined;
          if (serviceName) {
            const service = findServiceByName(ctx.db, serviceName);
            if (!service) throw new DomainError(`Service "${serviceName}" not found`);
            serviceId = service.id;
          }
          const open = incidents.listIncidents(ctx.db, { status: 'open', service_id: serviceId });
          await say(respond, incidentListBlocks(open, serviceName ? `Open incidents · ${serviceName}` : 'Open incidents'));
          return;
        }
        case 'ack':
        case 'acknowledge': {
          const incident = incidentByRef(ctx, rest[0] ?? '');
          const updated = incidents.acknowledgeIncident(ctx, incident.id, user.id);
          await say(respond, `🟡 Acknowledged *#${updated.number}* — ${esc(updated.title)}`);
          return;
        }
        case 'resolve':
        case 'res': {
          const incident = incidentByRef(ctx, rest[0] ?? '');
          const updated = incidents.resolveIncident(ctx, incident.id, user.id);
          await say(respond, `✅ Resolved *#${updated.number}* — ${esc(updated.title)}`);
          return;
        }
        case 'escalate':
        case 'esc': {
          const incident = incidentByRef(ctx, rest[0] ?? '');
          const updated = incidents.escalateIncident(ctx, incident.id, { actor_user_id: user.id });
          await say(respond, `📣 Escalated *#${updated.number}* to level ${updated.escalation_level}`);
          return;
        }
        case 'note': {
          const incident = incidentByRef(ctx, rest[0] ?? '');
          const note = rest.slice(1).join(' ').trim();
          if (!note) throw new DomainError('Usage: `/incident note <number> <text>`');
          incidents.addNote(ctx, incident.id, note, user.id);
          await say(respond, `📝 Note added to *#${incident.number}*`);
          return;
        }
        case 'assign': {
          const incident = incidentByRef(ctx, rest[0] ?? '');
          const slackId = parseMention(rest[1]);
          if (!slackId) throw new DomainError('Usage: `/incident assign <number> @someone`');
          const assignee = await ensureUser(ctx, client as WebClient, slackId);
          const updated = incidents.reassignIncident(ctx, incident.id, assignee.id, user.id);
          await say(respond, `👉 *#${updated.number}* assigned to ${fmtUser(assignee)}`);
          return;
        }
        default: {
          // `/incident 42` -> detail view with timeline + buttons
          if (/^#?\d+/.test(sub)) {
            const incident = incidentByRef(ctx, sub);
            const events = incidents.getTimeline(ctx.db, incident.id);
            const usersById = new Map(listUsers(ctx.db).map((u) => [u.id, u]));
            await say(respond, timelineBlocks(incident, events, usersById), `Incident #${incident.number}`);
            return;
          }
          await say(respond, 'Unknown subcommand. Try `/incident help`.');
        }
      }
    } catch (err) {
      await say(respond, errText(err));
    }
  });

  // ------------------------------------------------------------------ /oncall
  app.command('/oncall', async ({ ack, command, client, respond }) => {
    await ack();
    await ensureUser(ctx, client as WebClient, command.user_id);
    try {
      await say(respond, oncallBlocks(whoIsOnCall(ctx.db)), 'Who is on call');
    } catch (err) {
      await say(respond, errText(err));
    }
  });

  // ------------------------------------------------------------------ /opsly
  app.command('/opsly', async ({ ack, command, client, respond }) => {
    await ack();
    const user = await ensureUser(ctx, client as WebClient, command.user_id);
    const [sub = '', sub2 = '', ...rest] = command.text.trim().split(/\s+/).filter(Boolean);
    const restJoined = [sub2, ...rest].join(' ').trim();
    try {
      switch (sub.toLowerCase()) {
        case '':
        case 'help':
          await say(respond, helpBlocks());
          return;

        case 'status': {
          const stats = incidents.incidentStats(ctx.db);
          const open = incidents.listIncidents(ctx.db, { status: 'open', limit: 8 });
          const lines = open.map((i) => `${incidentOneLiner(i)} · ${esc(i.service.name)}`);
          await say(
            respond,
            [
              { type: 'header', text: { type: 'plain_text', text: '📟 Opsly status' } },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `🔴 ${stats.triggered} triggered · 🟡 ${stats.acknowledged} acknowledged · ✅ ${stats.resolved_today} resolved in the last 24h`,
                },
              },
              ...(lines.length
                ? [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }]
                : [{ type: 'section', text: { type: 'mrkdwn', text: '🎉 No open incidents.' } }]),
            ],
            'Opsly status'
          );
          return;
        }

        case 'whoami': {
          await say(
            respond,
            `You are *${esc(user.name)}*${user.email ? ` (${esc(user.email)})` : ''} — role: ${user.role}, timezone: ${user.timezone}.`
          );
          return;
        }
        case 'link': {
          await say(respond, `✅ Linked as *${esc(user.name)}*. You will be paged via DM when assigned to incidents.`);
          return;
        }

        case 'services': {
          const services = listServices(ctx.db);
          if (!services.length) {
            await say(respond, 'No services yet. Create one with `/opsly service create`.');
            return;
          }
          const policies = new Map(listPolicies(ctx.db).map((p) => [p.id, p.name]));
          const lines = services.map((s) => {
            const bits = [
              `*${esc(s.name)}*`,
              s.escalation_policy_id ? `policy: ${esc(policies.get(s.escalation_policy_id) ?? '?')}` : '_no escalation policy_',
              s.slack_channel_id ? `channel: <#${s.slack_channel_id}>` : '_no channel_',
            ];
            return `• ${bits.join(' · ')}`;
          });
          await say(respond, lines.join('\n'));
          return;
        }
        case 'service': {
          if (sub2.toLowerCase() === 'create') {
            await openModal(client as WebClient, command.trigger_id, serviceCreateModal(ctx), respond);
            return;
          }
          const service = findServiceByName(ctx.db, restJoined);
          if (!service) throw new DomainError(`Service "${restJoined}" not found. Try \`/opsly services\`.`);
          const integrations = listIntegrations(ctx.db, service.id);
          const key = integrations[0]?.routing_key;
          await say(
            respond,
            `*${esc(service.name)}*\n` +
              `${service.description ? esc(service.description) + '\n' : ''}` +
              `Default urgency: ${service.default_urgency}\n` +
              (key
                ? `Events API key: \`${key}\`\nSend events to \`POST ${ctx.config.baseUrl}/api/v1/events\``
                : '_No integrations_')
          );
          return;
        }

        case 'schedules': {
          const schedules = listSchedules(ctx.db);
          if (!schedules.length) {
            await say(respond, 'No schedules yet. Create one with `/opsly schedule create`.');
            return;
          }
          await say(respond, oncallBlocks(whoIsOnCall(ctx.db)), 'Schedules');
          return;
        }
        case 'schedule': {
          if (sub2.toLowerCase() === 'create') {
            await openModal(client as WebClient, command.trigger_id, scheduleCreateModal(), respond);
            return;
          }
          const schedule = findScheduleByName(ctx.db, restJoined);
          if (!schedule) throw new DomainError(`Schedule "${restJoined}" not found. Try \`/opsly schedules\`.`);
          const from = DateTime.utc();
          const shifts = renderShifts(ctx.db, schedule.id, from.toISO()!, from.plus({ days: 14 }).toISO()!);
          const usersById = new Map(listUsers(ctx.db).map((u) => [u.id, u]));
          const lines = shifts
            .slice(0, 20)
            .map((s) => {
              const who = usersById.get(s.user_id) ?? null;
              const mark = s.source === 'override' ? ' _(override)_' : '';
              return `• ${fmtTime(s.start)} → ${fmtTime(s.end)}: ${fmtUser(who)}${mark}`;
            });
          const overrides = listOverrides(ctx.db, schedule.id);
          await say(
            respond,
            [
              { type: 'header', text: { type: 'plain_text', text: `🗓️ ${schedule.name}`.slice(0, 150) } },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Timezone: ${schedule.timezone} · ${schedule.layers.length} layer(s) · ${overrides.length} upcoming override(s)` }],
              },
              { type: 'section', text: { type: 'mrkdwn', text: `*Next 14 days*\n${lines.join('\n') || '_nobody on call_'}` } },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: 'Need someone to cover a shift? `/opsly override`' }],
              },
            ],
            schedule.name
          );
          return;
        }

        case 'override': {
          await openModal(client as WebClient, command.trigger_id, overrideModal(ctx), respond);
          return;
        }

        case 'policies': {
          const policies = listPolicies(ctx.db);
          if (!policies.length) {
            await say(respond, 'No escalation policies yet. Create one with `/opsly policy create`.');
            return;
          }
          const usersById = new Map(listUsers(ctx.db).map((u) => [u.id, u]));
          const schedulesById = new Map(listSchedules(ctx.db).map((s) => [s.id, s]));
          const lines = policies.map((p) => {
            const levels = p.levels
              .map((l) => {
                const targets = l.targets
                  .map((t) =>
                    t.target_type === 'user'
                      ? esc(usersById.get(t.target_id)?.name ?? '?')
                      : `🗓️ ${esc(schedulesById.get(t.target_id)?.name ?? '?')}`
                  )
                  .join(', ');
                return `L${l.level_index}: ${targets} (${l.timeout_minutes}m)`;
              })
              .join(' → ');
            return `• *${esc(p.name)}* — ${levels}${p.repeat_count ? ` · repeats ×${p.repeat_count}` : ''}`;
          });
          await say(respond, lines.join('\n'));
          return;
        }
        case 'policy': {
          if (sub2.toLowerCase() === 'create') {
            await openModal(client as WebClient, command.trigger_id, policyCreateModal(ctx), respond);
            return;
          }
          await say(respond, 'Usage: `/opsly policy create` or `/opsly policies`.');
          return;
        }

        case 'users': {
          const users = listUsers(ctx.db);
          const lines = users.map(
            (u) => `• ${fmtUser(u)}${u.email ? ` · ${esc(u.email)}` : ''}${u.role === 'admin' ? ' · admin' : ''}`
          );
          await say(respond, lines.join('\n') || 'Nobody yet — anyone who runs a command gets linked automatically.');
          return;
        }

        case 'dashboard': {
          await say(respond, `📊 Dashboard: ${ctx.config.baseUrl}`);
          return;
        }

        default:
          await say(respond, 'Unknown subcommand. Try `/opsly help`.');
      }
    } catch (err) {
      await say(respond, errText(err));
    }
  });
}
