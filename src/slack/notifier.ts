import type { WebClient } from '@slack/web-api';
import type { AppCtx } from '../context.js';
import { uuid } from '../db/index.js';
import type { IncidentMessageRef, NotifyEvent, Notifier } from '../types.js';
import { getIncident } from '../domain/incidents.js';
import { incidentBlocks } from './blocks.js';
import { esc, fmtUser, statusEmoji } from './format.js';

/**
 * Slack delivery for incident lifecycle events:
 *  - posts (and thereafter updates) one message in the service's channel
 *  - DMs newly-paged responders on trigger / escalate / reassign (high urgency)
 *  - keeps every copy in sync as status changes, and threads notes
 */
export class SlackNotifier implements Notifier {
  constructor(
    private ctx: AppCtx,
    private client: WebClient
  ) {}

  async notify(event: NotifyEvent): Promise<void> {
    // Re-read latest state; notifications can arrive after further transitions.
    const incident = getIncident(this.ctx.db, event.incident.id);
    const { db } = this.ctx;
    const refs = db
      .prepare('SELECT * FROM incident_messages WHERE incident_id = ?')
      .all(incident.id) as unknown as IncidentMessageRef[];

    const channelId = incident.service.slack_channel_id || this.ctx.config.slack?.defaultChannel || null;
    const channelBlocks = incidentBlocks(incident, { baseUrl: this.ctx.config.baseUrl });
    const fallback = `${statusEmoji(incident.status)} #${incident.number} ${incident.title} [${incident.status}]`;

    // 1. Channel message: create once, then keep it updated.
    const channelRef = refs.find((r) => r.kind === 'channel');
    if (channelRef) {
      await this.tryCall('chat.update', () =>
        this.client.chat.update({ channel: channelRef.channel_id, ts: channelRef.ts, text: fallback, blocks: channelBlocks })
      );
    } else if (channelId) {
      const posted = await this.tryCall('chat.postMessage', () =>
        this.client.chat.postMessage({ channel: channelId, text: fallback, blocks: channelBlocks, unfurl_links: false })
      );
      if (posted?.ts) {
        this.saveRef(incident.id, String(posted.channel ?? channelId), String(posted.ts), 'channel');
      }
    }

    // 2. Page assignees by DM when they are (re)assigned.
    if (['triggered', 'escalated', 'reassigned'].includes(event.kind) && incident.urgency === 'high') {
      for (const user of incident.assignees) {
        if (!user.slack_user_id) continue;
        const already = refs.find((r) => r.kind === 'dm' && r.channel_id === `dm:${user.slack_user_id}`);
        if (already) continue;
        const opened = await this.tryCall('conversations.open', () =>
          this.client.conversations.open({ users: user.slack_user_id! })
        );
        const dmChannel = opened?.channel?.id;
        if (!dmChannel) continue;
        const posted = await this.tryCall('chat.postMessage(dm)', () =>
          this.client.chat.postMessage({
            channel: dmChannel,
            text: `🚨 You are assigned to incident #${incident.number}: ${incident.title}`,
            blocks: incidentBlocks(incident, { forDm: true, baseUrl: this.ctx.config.baseUrl }),
          })
        );
        if (posted?.ts) {
          // channel_id records the Slack user so we can dedup pages; ts + real channel let us update later.
          this.saveRef(incident.id, `dm:${user.slack_user_id}`, `${dmChannel}|${posted.ts}`, 'dm');
        }
      }
    }

    // 3. Keep DM copies in sync on state changes.
    if (['acknowledged', 'resolved', 'escalated', 'reassigned'].includes(event.kind)) {
      for (const ref of refs.filter((r) => r.kind === 'dm')) {
        const [dmChannel, ts] = ref.ts.split('|');
        if (!dmChannel || !ts) continue;
        await this.tryCall('chat.update(dm)', () =>
          this.client.chat.update({ channel: dmChannel, ts, text: fallback, blocks: incidentBlocks(incident, { forDm: true }) })
        );
      }
    }

    // 4. Thread significant moments under the channel message.
    if (channelRef) {
      const threadText = this.threadText(event);
      if (threadText) {
        await this.tryCall('chat.postMessage(thread)', () =>
          this.client.chat.postMessage({
            channel: channelRef.channel_id,
            thread_ts: channelRef.ts,
            text: threadText,
          })
        );
      }
    }
  }

  private threadText(event: NotifyEvent): string | null {
    const by = event.actor ? ` by ${fmtUser(event.actor)}` : '';
    switch (event.kind) {
      case 'note':
        return `📝 Note${by}: ${esc(event.note ?? '')}`;
      case 'acknowledged':
        return `🟡 Acknowledged${by}`;
      case 'resolved':
        return `✅ Resolved${by}`;
      case 'escalated':
        return `📣 ${esc(event.summary)}${by} — now paging ${event.assignees.map((u) => fmtUser(u)).join(', ') || 'nobody'}`;
      case 'reassigned':
        return `👉 ${esc(event.summary)}${by}`;
      default:
        return null;
    }
  }

  private saveRef(incidentId: string, channelId: string, ts: string, kind: 'channel' | 'dm'): void {
    this.ctx.db
      .prepare('INSERT INTO incident_messages (id, incident_id, channel_id, ts, kind) VALUES (?, ?, ?, ?, ?)')
      .run(uuid(), incidentId, channelId, ts, kind);
  }

  private async tryCall<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      console.error(`[slack] ${label} failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
}
