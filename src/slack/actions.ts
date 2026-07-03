import type { App } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import type { AppCtx } from '../context.js';
import { DomainError } from '../db/index.js';
import * as incidents from '../domain/incidents.js';
import { ensureUser } from './identity.js';
import { publishHome } from './home.js';
import { incidentBlocks } from './blocks.js';
import { incidentCreateModal, noteModal, overrideModal, scheduleCreateModal, serviceCreateModal, policyCreateModal } from './modals.js';

type Handler = (ctx: AppCtx, incidentId: string, actorId: string) => incidents.IncidentDetail;

const OPS: Record<string, { run: Handler; past: string }> = {
  inc_ack: { run: (c, id, actor) => incidents.acknowledgeIncident(c, id, actor), past: 'acknowledged' },
  inc_resolve: { run: (c, id, actor) => incidents.resolveIncident(c, id, actor), past: 'resolved' },
  inc_escalate: {
    run: (c, id, actor) => incidents.escalateIncident(c, id, { actor_user_id: actor }),
    past: 'escalated',
  },
};

export function registerActions(app: App, ctx: AppCtx): void {
  // Ack / Resolve / Escalate buttons — shared handler.
  for (const [actionId, op] of Object.entries(OPS)) {
    app.action(actionId, async ({ ack, body, client, respond }) => {
      await ack();
      const b = body as any;
      const user = await ensureUser(ctx, client as WebClient, b.user.id);
      const incidentId: string = b.actions?.[0]?.value;
      const inHome = b.view?.type === 'home';
      try {
        const updated = op.run(ctx, incidentId, user.id);
        // Ephemeral surfaces (slash command output) can't be updated by the
        // notifier, so refresh them inline here.
        if (!inHome && b.container?.is_ephemeral && respond) {
          await respond({
            response_type: 'ephemeral',
            replace_original: true,
            text: `Incident #${updated.number} ${op.past}`,
            blocks: incidentBlocks(updated),
          });
        }
      } catch (err) {
        const message = `⚠️ ${err instanceof DomainError ? err.message : 'Something went wrong'}`;
        if (!inHome && b.container?.is_ephemeral && respond) {
          await respond({ response_type: 'ephemeral', replace_original: false, text: message });
        } else {
          try {
            await (client as WebClient).chat.postMessage({ channel: b.user.id, text: message });
          } catch {
            /* last resort: nothing to do */
          }
        }
      }
      if (inHome) await publishHome(ctx, client as WebClient, b.user.id);
    });
  }

  // "Add note" button -> modal.
  app.action('inc_note', async ({ ack, body, client }) => {
    await ack();
    const b = body as any;
    const incidentId: string = b.actions?.[0]?.value;
    try {
      const incident = incidents.getIncident(ctx.db, incidentId);
      await (client as WebClient).views.open({
        trigger_id: b.trigger_id,
        view: noteModal(incident.id, incident.number),
      });
    } catch (err) {
      console.error('[slack] inc_note failed:', err);
    }
  });

  // App Home quick actions.
  const HOME_MODALS: Record<string, () => any> = {
    home_new_incident: () => incidentCreateModal(ctx),
    home_new_override: () => overrideModal(ctx),
    home_new_service: () => serviceCreateModal(ctx),
    home_new_schedule: () => scheduleCreateModal(),
    home_new_policy: () => policyCreateModal(ctx),
  };
  for (const [actionId, build] of Object.entries(HOME_MODALS)) {
    app.action(actionId, async ({ ack, body, client }) => {
      await ack();
      const b = body as any;
      const view = build();
      if (view && 'error' in view) {
        try {
          await (client as WebClient).chat.postMessage({ channel: b.user.id, text: `⚠️ ${view.error}` });
        } catch {
          /* ignore */
        }
        return;
      }
      await (client as WebClient).views.open({ trigger_id: b.trigger_id, view });
    });
  }

  app.action('home_refresh', async ({ ack, body, client }) => {
    await ack();
    const b = body as any;
    await publishHome(ctx, client as WebClient, b.user.id);
  });

  // Link buttons (dashboard) just need the ack.
  app.action('noop_link', async ({ ack }) => {
    await ack();
  });
}
