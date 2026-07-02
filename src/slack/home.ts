import type { WebClient } from '@slack/web-api';
import type { AppCtx } from '../context.js';
import * as incidents from '../domain/incidents.js';
import { whoIsOnCall, upcomingShiftsForUser } from '../domain/oncall.js';
import { findUserBySlackId } from '../domain/users.js';
import { incidentActionButtons } from './blocks.js';
import { esc, fmtAge, fmtTime, fmtUsers, incidentOneLiner, urgencyLabel } from './format.js';

/** Build and publish the App Home dashboard for one user. */
export async function publishHome(ctx: AppCtx, client: WebClient, slackUserId: string): Promise<void> {
  const user = findUserBySlackId(ctx.db, slackUserId);
  const stats = incidents.incidentStats(ctx.db);
  const open = incidents.listIncidents(ctx.db, { status: 'open', limit: 30 });
  const mine = user ? open.filter((i) => i.assignees.some((a) => a.id === user.id)) : [];
  const others = open.filter((i) => !mine.includes(i));

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: '📟 Opsly' } },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🔴 ${stats.triggered} triggered · 🟡 ${stats.acknowledged} acknowledged · ✅ ${stats.resolved_today} resolved in the last 24h`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: '🚨 New incident' },
          action_id: 'home_new_incident',
        },
        { type: 'button', text: { type: 'plain_text', text: '🗓️ Cover a shift' }, action_id: 'home_new_override' },
        { type: 'button', text: { type: 'plain_text', text: '🛠️ New service' }, action_id: 'home_new_service' },
        { type: 'button', text: { type: 'plain_text', text: '📅 New schedule' }, action_id: 'home_new_schedule' },
        { type: 'button', text: { type: 'plain_text', text: '📣 New policy' }, action_id: 'home_new_policy' },
        { type: 'button', text: { type: 'plain_text', text: '🔄 Refresh' }, action_id: 'home_refresh' },
      ],
    },
    { type: 'divider' },
  ];

  const incidentSection = (list: incidents.IncidentDetail[], title: string, withButtons: boolean, cap: number) => {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } });
    if (!list.length) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '🎉 none' }] });
      return;
    }
    for (const incident of list.slice(0, cap)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `${incidentOneLiner(incident)}\n` +
            `${esc(incident.service.name)} · ${urgencyLabel(incident.urgency)} · ${fmtAge(incident.created_at)} old · ${fmtUsers(incident.assignees)}`,
        },
      });
      if (withButtons) {
        const actions = incidentActionButtons(incident);
        if (actions) blocks.push(actions);
      }
    }
    if (list.length > cap) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `…and ${list.length - cap} more` }] });
    }
  };

  incidentSection(mine, '🧯 Your open incidents', true, 5);
  blocks.push({ type: 'divider' });
  incidentSection(others, '📋 Other open incidents', true, 5);
  blocks.push({ type: 'divider' });

  // On-call snapshot.
  const oncalls = whoIsOnCall(ctx.db);
  const onCallLines = oncalls.map((oc) => {
    const youMarker = user && oc.user?.id === user.id ? ' ← *you*' : '';
    const until = oc.until ? ` until ${fmtTime(oc.until)}` : '';
    return `• *${esc(oc.schedule.name)}*: ${oc.user ? esc(oc.user.name) + until : '_nobody_'}${youMarker}`;
  });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*🗓️ On call right now*\n${onCallLines.join('\n') || '_no schedules yet_'}` },
  });

  // The viewer's upcoming shifts.
  if (user) {
    const shifts = upcomingShiftsForUser(ctx.db, user.id, 14).slice(0, 8);
    if (shifts.length) {
      const lines = shifts.map((s) => `• ${esc(s.schedule_name)}: ${fmtTime(s.start)} → ${fmtTime(s.end)}`);
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*⏭️ Your shifts (next 14 days)*\n${lines.join('\n')}` },
      });
    }
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `<${ctx.config.baseUrl}|Open the web dashboard> · \`/incident help\` for commands`,
        },
      ],
    }
  );

  await client.views.publish({
    user_id: slackUserId,
    view: { type: 'home', blocks: blocks.slice(0, 100) },
  });
}
