import { DateTime } from 'luxon';
import type { App } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import type { AppCtx } from '../context.js';
import { DomainError } from '../db/index.js';
import { listServices, createService, listIntegrations } from '../domain/services.js';
import { listPolicies, createPolicy, type LevelInput } from '../domain/escalation-policies.js';
import { listSchedules, createSchedule, createOverride } from '../domain/schedules.js';
import { triggerIncident, addNote, getIncident } from '../domain/incidents.js';
import { ensureUser } from './identity.js';
import { esc } from './format.js';

type ViewState = Record<string, Record<string, any>>;

/** Pull a value out of view state by block id (block and action ids are kept identical). */
function val(state: ViewState, id: string): any {
  const block = state[id];
  if (!block) return undefined;
  const el = block[id];
  if (!el) return undefined;
  switch (el.type) {
    case 'plain_text_input':
    case 'number_input':
      return el.value ?? undefined;
    case 'static_select':
    case 'radio_buttons':
      return el.selected_option?.value ?? undefined;
    case 'multi_users_select':
      return el.selected_users ?? [];
    case 'users_select':
      return el.selected_user ?? undefined;
    case 'conversations_select':
      return el.selected_conversation ?? undefined;
    case 'datepicker':
      return el.selected_date ?? undefined;
    case 'timepicker':
      return el.selected_time ?? undefined;
    case 'datetimepicker':
      return el.selected_date_time ?? undefined; // unix seconds
    case 'external_select':
      return el.selected_option?.value ?? undefined;
    default:
      return el.value ?? el.selected_option?.value ?? undefined;
  }
}

const input = (id: string, label: string, element: any, opts: { optional?: boolean; hint?: string } = {}) => ({
  type: 'input',
  block_id: id,
  optional: opts.optional ?? false,
  label: { type: 'plain_text', text: label },
  ...(opts.hint ? { hint: { type: 'plain_text', text: opts.hint } } : {}),
  element: { ...element, action_id: id },
});

const textInput = (opts: { multiline?: boolean; placeholder?: string; initial?: string } = {}) => ({
  type: 'plain_text_input',
  multiline: opts.multiline ?? false,
  ...(opts.placeholder ? { placeholder: { type: 'plain_text', text: opts.placeholder } } : {}),
  ...(opts.initial ? { initial_value: opts.initial } : {}),
});

const option = (text: string, value: string) => ({
  text: { type: 'plain_text' as const, text: text.slice(0, 75) },
  value,
});

function modal(callbackId: string, title: string, blocks: any[], opts: { submit?: string; privateMetadata?: string } = {}) {
  return {
    type: 'modal' as const,
    callback_id: callbackId,
    title: { type: 'plain_text', text: title.slice(0, 24) },
    submit: { type: 'plain_text', text: opts.submit ?? 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    ...(opts.privateMetadata ? { private_metadata: opts.privateMetadata } : {}),
    blocks,
  };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function incidentCreateModal(ctx: AppCtx): any | { error: string } {
  const services = listServices(ctx.db);
  if (!services.length) {
    return { error: 'No services exist yet. Create one first with `/opsly service create`.' };
  }
  return modal(
    'modal_incident_create',
    'New incident',
    [
      input('service', 'Service', {
        type: 'static_select',
        placeholder: { type: 'plain_text', text: 'Pick a service' },
        options: services.slice(0, 100).map((s) => option(s.name, s.id)),
      }),
      input('title', 'Title', textInput({ placeholder: 'What is broken?' })),
      input('description', 'Details', textInput({ multiline: true }), { optional: true }),
      input(
        'urgency',
        'Urgency',
        {
          type: 'radio_buttons',
          initial_option: option('High — page the on-call responder', 'high'),
          options: [option('High — page the on-call responder', 'high'), option('Low — notify without paging', 'low')],
        }
      ),
    ],
    { submit: 'Trigger' }
  );
}

export function noteModal(incidentId: string, incidentNumber: number): any {
  return modal(
    'modal_note',
    `Note · #${incidentNumber}`,
    [input('note', 'Note', textInput({ multiline: true, placeholder: 'What do we know?' }))],
    { submit: 'Add note', privateMetadata: incidentId }
  );
}

export function overrideModal(ctx: AppCtx): any | { error: string } {
  const schedules = listSchedules(ctx.db);
  if (!schedules.length) {
    return { error: 'No schedules exist yet. Create one first with `/opsly schedule create`.' };
  }
  const now = Math.floor(Date.now() / 1000 / 60) * 60;
  return modal(
    'modal_override_create',
    'Cover a shift',
    [
      input('schedule', 'Schedule', {
        type: 'static_select',
        options: schedules.slice(0, 100).map((s) => option(s.name, s.id)),
      }),
      input('user', 'Who takes the shift', { type: 'users_select' }),
      input('start', 'From', { type: 'datetimepicker', initial_date_time: now }),
      input('end', 'Until', { type: 'datetimepicker', initial_date_time: now + 4 * 3600 }),
    ],
    { submit: 'Create override' }
  );
}

export function serviceCreateModal(ctx: AppCtx): any {
  const policies = listPolicies(ctx.db);
  return modal(
    'modal_service_create',
    'New service',
    [
      input('name', 'Name', textInput({ placeholder: 'e.g. Checkout API' })),
      input('description', 'Description', textInput({ multiline: true }), { optional: true }),
      input(
        'policy',
        'Escalation policy',
        {
          type: 'static_select',
          placeholder: { type: 'plain_text', text: policies.length ? 'Pick a policy' : 'No policies yet' },
          options: policies.length
            ? policies.slice(0, 100).map((p) => option(p.name, p.id))
            : [option('None', 'none')],
        },
        { optional: true, hint: 'Who gets paged, and how it escalates. Create one with /opsly policy create.' }
      ),
      input(
        'channel',
        'Slack channel for incidents',
        { type: 'conversations_select', filter: { include: ['public', 'private'], exclude_bot_users: true } },
        { optional: true, hint: 'Incident updates for this service will be posted here.' }
      ),
      input('urgency', 'Default urgency', {
        type: 'radio_buttons',
        initial_option: option('High — page the on-call responder', 'high'),
        options: [option('High — page the on-call responder', 'high'), option('Low — notify without paging', 'low')],
      }),
    ],
    { submit: 'Create' }
  );
}

export function scheduleCreateModal(): any {
  const today = DateTime.utc().toISODate();
  return modal(
    'modal_schedule_create',
    'New schedule',
    [
      input('name', 'Name', textInput({ placeholder: 'e.g. Platform primary on-call' })),
      input(
        'users',
        'Rotation members',
        { type: 'multi_users_select', placeholder: { type: 'plain_text', text: 'Select in rotation order' } },
        { hint: 'The order you select people is the rotation order.' }
      ),
      input('rotation', 'Rotation', {
        type: 'radio_buttons',
        initial_option: option('Weekly — hand off once a week', 'weekly'),
        options: [
          option('Weekly — hand off once a week', 'weekly'),
          option('Daily — hand off every day', 'daily'),
        ],
      }),
      input('handoff', 'Handoff time', { type: 'timepicker', initial_time: '09:00' }, { hint: 'In the schedule timezone.' }),
      input('anchor', 'First shift starts on', { type: 'datepicker', initial_date: today }),
      input(
        'tz',
        'Timezone',
        {
          type: 'external_select',
          min_query_length: 0,
          placeholder: { type: 'plain_text', text: 'Search timezones…' },
        },
        { hint: 'Handoffs happen at the local time in this zone (DST-safe).' }
      ),
    ],
    { submit: 'Create' }
  );
}

export function policyCreateModal(ctx: AppCtx): any {
  const schedules = listSchedules(ctx.db);
  const scheduleOptions = [option('— none —', 'none'), ...schedules.slice(0, 99).map((s) => option(s.name, s.id))];
  const levelBlocks = (i: number, required: boolean): any[] => [
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Level ${i}*${required ? '' : ' _(optional)_'} — paged ${i === 1 ? 'immediately' : 'if the previous level does not acknowledge in time'}`,
      },
    },
    input(`l${i}_users`, `Level ${i}: people`, { type: 'multi_users_select' }, { optional: !required }),
    input(`l${i}_schedule`, `Level ${i}: on-call schedule`, { type: 'static_select', options: scheduleOptions }, { optional: true }),
    input(
      `l${i}_timeout`,
      `Level ${i}: escalate after (minutes)`,
      { type: 'number_input', is_decimal_allowed: false, initial_value: '15', min_value: '1', max_value: '1440' },
      { optional: true }
    ),
  ];
  return modal(
    'modal_policy_create',
    'New policy',
    [
      input('name', 'Policy name', textInput({ placeholder: 'e.g. Platform standard' })),
      input('repeat', 'If nobody acknowledges, repeat all levels', {
        type: 'static_select',
        initial_option: option('Do not repeat', '0'),
        options: [option('Do not repeat', '0'), option('1 more time', '1'), option('2 more times', '2'), option('3 more times', '3')],
      }),
      ...levelBlocks(1, true),
      ...levelBlocks(2, false),
      ...levelBlocks(3, false),
    ],
    { submit: 'Create' }
  );
}

// ---------------------------------------------------------------------------
// Registration (submission + options handlers)
// ---------------------------------------------------------------------------

async function dm(client: WebClient, slackUserId: string, text: string, blocks?: any[]): Promise<void> {
  try {
    await client.chat.postMessage({ channel: slackUserId, text, ...(blocks ? { blocks } : {}) });
  } catch (err) {
    console.error('[slack] DM failed:', err instanceof Error ? err.message : err);
  }
}

export function registerModals(app: App, ctx: AppCtx): void {
  // Timezone search for the schedule modal.
  app.options('tz', async ({ options, ack }) => {
    const query = (options.value ?? '').toLowerCase();
    const zones = (Intl as any).supportedValuesOf('timeZone') as string[];
    const matches = zones.filter((z) => z.toLowerCase().includes(query)).slice(0, 100);
    const preferred = ['UTC', ...matches.filter((z) => z !== 'UTC')];
    await ack({ options: preferred.slice(0, 100).map((z) => option(z, z)) });
  });

  app.view('modal_incident_create', async ({ ack, body, view, client }) => {
    const state = view.state.values as ViewState;
    const user = await ensureUser(ctx, client as WebClient, body.user.id);
    try {
      const incident = triggerIncident(ctx, {
        service_id: val(state, 'service'),
        title: val(state, 'title'),
        description: val(state, 'description') || null,
        urgency: val(state, 'urgency') === 'low' ? 'low' : 'high',
        source: 'slack',
        actor_user_id: user.id,
      });
      await ack();
      await dm(client as WebClient, body.user.id, `🚨 Triggered incident *#${incident.number}* — ${esc(incident.title)}`);
    } catch (err) {
      await ackWithError(ack, 'title', err);
    }
  });

  app.view('modal_note', async ({ ack, body, view, client }) => {
    const state = view.state.values as ViewState;
    const user = await ensureUser(ctx, client as WebClient, body.user.id);
    try {
      const incident = getIncident(ctx.db, view.private_metadata);
      addNote(ctx, incident.id, val(state, 'note'), user.id);
      await ack();
    } catch (err) {
      await ackWithError(ack, 'note', err);
    }
  });

  app.view('modal_override_create', async ({ ack, body, view, client }) => {
    const state = view.state.values as ViewState;
    await ensureUser(ctx, client as WebClient, body.user.id);
    const startUnix = val(state, 'start');
    const endUnix = val(state, 'end');
    try {
      if (!startUnix || !endUnix) throw new DomainError('Both start and end are required');
      const coveringUser = await ensureUser(ctx, client as WebClient, val(state, 'user'));
      const override = createOverride(ctx.db, {
        schedule_id: val(state, 'schedule'),
        user_id: coveringUser.id,
        start_at: DateTime.fromSeconds(Number(startUnix)).toUTC().toISO()!,
        end_at: DateTime.fromSeconds(Number(endUnix)).toUTC().toISO()!,
      });
      await ack();
      const schedule = listSchedules(ctx.db).find((s) => s.id === override.schedule_id);
      await dm(
        client as WebClient,
        body.user.id,
        `🗓️ Override created: *${esc(coveringUser.name)}* covers *${esc(schedule?.name ?? 'schedule')}* from ${DateTime.fromISO(override.start_at).toFormat('MMM d HH:mm')} to ${DateTime.fromISO(override.end_at).toFormat('MMM d HH:mm')} UTC.`
      );
    } catch (err) {
      await ackWithError(ack, 'end', err);
    }
  });

  app.view('modal_service_create', async ({ ack, body, view, client }) => {
    const state = view.state.values as ViewState;
    await ensureUser(ctx, client as WebClient, body.user.id);
    try {
      const policyId = val(state, 'policy');
      const service = createService(ctx.db, {
        name: val(state, 'name'),
        description: val(state, 'description') || null,
        escalation_policy_id: policyId && policyId !== 'none' ? policyId : null,
        slack_channel_id: val(state, 'channel') || null,
        default_urgency: val(state, 'urgency') === 'low' ? 'low' : 'high',
      });
      await ack();
      const key = listIntegrations(ctx.db, service.id)[0]?.routing_key;
      await dm(
        client as WebClient,
        body.user.id,
        `🛠️ Service *${esc(service.name)}* created.` +
          (key
            ? `\nEvents API routing key: \`${key}\`\nPoint your monitoring at \`POST ${ctx.config.baseUrl}/api/v1/events\` with this key.`
            : ''),
      );
    } catch (err) {
      await ackWithError(ack, 'name', err);
    }
  });

  app.view('modal_schedule_create', async ({ ack, body, view, client }) => {
    const state = view.state.values as ViewState;
    await ensureUser(ctx, client as WebClient, body.user.id);
    try {
      const slackUserIds: string[] = val(state, 'users') ?? [];
      if (!slackUserIds.length) throw new DomainError('Pick at least one rotation member');
      const members = [];
      for (const suid of slackUserIds) {
        members.push(await ensureUser(ctx, client as WebClient, suid));
      }
      const schedule = createSchedule(ctx.db, {
        name: val(state, 'name'),
        timezone: val(state, 'tz') || 'UTC',
        layers: [
          {
            rotation_type: val(state, 'rotation') === 'daily' ? 'daily' : 'weekly',
            handoff_time: val(state, 'handoff') || '09:00',
            anchor_date: val(state, 'anchor'),
            user_ids: members.map((m) => m.id),
          },
        ],
      });
      await ack();
      await dm(
        client as WebClient,
        body.user.id,
        `🗓️ Schedule *${esc(schedule.name)}* created with ${members.length} member(s) rotating ${val(state, 'rotation') === 'daily' ? 'daily' : 'weekly'} at ${val(state, 'handoff') || '09:00'} (${schedule.timezone}). Check it with \`/oncall\` or \`/opsly schedule ${schedule.name}\`.`
      );
    } catch (err) {
      await ackWithError(ack, 'name', err);
    }
  });

  app.view('modal_policy_create', async ({ ack, body, view, client }) => {
    const state = view.state.values as ViewState;
    await ensureUser(ctx, client as WebClient, body.user.id);
    try {
      const levels: LevelInput[] = [];
      for (const i of [1, 2, 3]) {
        const slackUserIds: string[] = val(state, `l${i}_users`) ?? [];
        const scheduleId = val(state, `l${i}_schedule`);
        const targets: LevelInput['targets'] = [];
        for (const suid of slackUserIds) {
          const member = await ensureUser(ctx, client as WebClient, suid);
          targets.push({ target_type: 'user', target_id: member.id });
        }
        if (scheduleId && scheduleId !== 'none') targets.push({ target_type: 'schedule', target_id: scheduleId });
        if (targets.length) {
          const timeout = parseInt(val(state, `l${i}_timeout`) ?? '15', 10);
          levels.push({ timeout_minutes: Number.isFinite(timeout) ? timeout : 15, targets });
        }
      }
      if (!levels.length) throw new DomainError('Level 1 needs at least one person or schedule');
      const policy = createPolicy(ctx.db, {
        name: val(state, 'name'),
        repeat_count: parseInt(val(state, 'repeat') ?? '0', 10),
        levels,
      });
      await ack();
      await dm(
        client as WebClient,
        body.user.id,
        `📣 Escalation policy *${esc(policy.name)}* created with ${policy.levels.length} level(s). Attach it to a service via \`/opsly service create\` or the dashboard.`
      );
    } catch (err) {
      await ackWithError(ack, 'name', err);
    }
  });
}

async function ackWithError(ack: any, blockId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : 'Something went wrong';
  await ack({ response_action: 'errors', errors: { [blockId]: message } });
}
