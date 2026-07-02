import type { IncidentDetail } from '../domain/incidents.js';
import type { IncidentEvent, User } from '../types.js';
import type { OnCallNow } from '../domain/oncall.js';
import { esc, fmtAge, fmtTime, fmtUser, fmtUsers, incidentOneLiner, statusEmoji, statusLabel, urgencyLabel } from './format.js';

// Block Kit payloads are deeply-nested JSON; typing them as `any[]` keeps the
// builders readable, and Slack validates the shape server-side anyway.
export type Blocks = any[];

export function incidentActionButtons(incident: IncidentDetail): any | null {
  if (incident.status === 'resolved') return null;
  const elements: any[] = [];
  if (incident.status === 'triggered') {
    elements.push({
      type: 'button',
      style: 'primary',
      text: { type: 'plain_text', text: '👍 Acknowledge' },
      action_id: 'inc_ack',
      value: incident.id,
    });
  }
  elements.push(
    {
      type: 'button',
      style: 'danger',
      text: { type: 'plain_text', text: '✅ Resolve' },
      action_id: 'inc_resolve',
      value: incident.id,
    },
    {
      type: 'button',
      text: { type: 'plain_text', text: '📣 Escalate' },
      action_id: 'inc_escalate',
      value: incident.id,
    },
    {
      type: 'button',
      text: { type: 'plain_text', text: '📝 Add note' },
      action_id: 'inc_note',
      value: incident.id,
    }
  );
  return { type: 'actions', elements };
}

export function incidentBlocks(incident: IncidentDetail, opts: { forDm?: boolean; baseUrl?: string } = {}): Blocks {
  const blocks: Blocks = [];
  if (opts.forDm) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🚨 *You are assigned to an incident on ${esc(incident.service.name)}*` },
    });
  }
  blocks.push(
    {
      type: 'header',
      text: { type: 'plain_text', text: `${statusEmoji(incident.status)} #${incident.number} ${incident.title}`.slice(0, 150) },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Status:*\n${statusEmoji(incident.status)} ${statusLabel(incident.status)}` },
        { type: 'mrkdwn', text: `*Service:*\n${esc(incident.service.name)}` },
        { type: 'mrkdwn', text: `*Urgency:*\n${urgencyLabel(incident.urgency)}` },
        { type: 'mrkdwn', text: `*Assigned to:*\n${fmtUsers(incident.assignees)}` },
      ],
    }
  );
  if (incident.description) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: esc(incident.description).slice(0, 2900) },
    });
  }
  const contextBits = [`Opened ${fmtTime(incident.created_at)}`];
  if (incident.source) contextBits.push(`Source: ${esc(incident.source)}`);
  if (incident.alert_count > 1) contextBits.push(`${incident.alert_count} alerts folded in`);
  if (incident.status === 'resolved' && incident.resolved_at) contextBits.push(`Resolved ${fmtTime(incident.resolved_at)}`);
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: contextBits.join(' · ') }] });

  const actions = incidentActionButtons(incident);
  if (actions) blocks.push(actions);
  if (opts.baseUrl) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${opts.baseUrl}/#/incidents|Open dashboard>` }],
    });
  }
  return blocks;
}

export function incidentListBlocks(list: IncidentDetail[], title: string): Blocks {
  const blocks: Blocks = [{ type: 'header', text: { type: 'plain_text', text: title.slice(0, 150) } }];
  if (!list.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '🎉 Nothing here. All quiet.' } });
    return blocks;
  }
  const shown = list.slice(0, 8);
  for (const incident of shown) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `${incidentOneLiner(incident)}\n` +
          `${esc(incident.service.name)} · ${urgencyLabel(incident.urgency)} · ${fmtAge(incident.created_at)} old · assigned to ${fmtUsers(incident.assignees)}`,
      },
    });
    const actions = incidentActionButtons(incident);
    if (actions) blocks.push(actions);
  }
  if (list.length > shown.length) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `…and ${list.length - shown.length} more. Use the dashboard for the full list.` }],
    });
  }
  return blocks;
}

export function timelineBlocks(incident: IncidentDetail, events: IncidentEvent[], usersById: Map<string, User>): Blocks {
  const blocks: Blocks = incidentBlocks(incident);
  blocks.push({ type: 'divider' });
  const recent = events.slice(-10);
  const lines = recent.map((e) => {
    const actor = e.actor_user_id ? usersById.get(e.actor_user_id) : null;
    const prefix = actor ? `${esc(actor.name)}: ` : '';
    return `• ${fmtTime(e.created_at, '{time}')} — ${prefix}${esc(e.message ?? e.type)}`;
  });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*Timeline*\n${lines.join('\n') || '_empty_'}` },
  });
  return blocks;
}

export function oncallBlocks(oncalls: OnCallNow[]): Blocks {
  const blocks: Blocks = [{ type: 'header', text: { type: 'plain_text', text: '🗓️ Who is on call' } }];
  if (!oncalls.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: 'No schedules yet. Create one with `/opsly schedule create`.' },
    });
    return blocks;
  }
  for (const oc of oncalls) {
    const untilTxt = oc.until ? ` until ${fmtTime(oc.until)}` : '';
    const viaTxt = oc.source === 'override' ? ' _(override)_' : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${esc(oc.schedule.name)}*\n${fmtUser(oc.user)}${viaTxt}${oc.user ? untilTxt : ' — nobody is on call'}`,
      },
    });
  }
  return blocks;
}

export function helpBlocks(): Blocks {
  const section = (text: string) => ({ type: 'section', text: { type: 'mrkdwn', text } });
  return [
    { type: 'header', text: { type: 'plain_text', text: '🛟 Opsly — command reference' } },
    section(
      '*Incidents*\n' +
        '`/incident` — open the new-incident form\n' +
        '`/incident list` — open incidents (add a service name to filter)\n' +
        '`/incident 42` — show incident #42 with actions\n' +
        '`/incident ack 42` · `/incident resolve 42` · `/incident escalate 42`\n' +
        '`/incident note 42 <text>` — add a timeline note\n' +
        '`/incident assign 42 @someone` — hand it to a person'
    ),
    section('*On-call*\n`/oncall` — who is on call right now, across all schedules'),
    section(
      '*Setup & admin* (`/opsly …`)\n' +
        '`status` — open incident summary\n' +
        '`services` · `service create`\n' +
        '`schedules` · `schedule <name>` · `schedule create`\n' +
        '`override` — cover a shift (creates a schedule override)\n' +
        '`policies` · `policy create`\n' +
        '`users` — everyone Opsly knows about\n' +
        '`whoami` — your linked Opsly profile\n' +
        '`dashboard` — link to the web dashboard'
    ),
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Tip: open the *Opsly* App Home for a live dashboard inside Slack.' }],
    },
  ];
}
