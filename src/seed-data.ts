/**
 * Idempotent demo dataset: three users, a weekly schedule, an escalation
 * policy, a service, and one low-urgency incident. Used by `npm run seed` and
 * by SEED_ON_START=1, which keeps ephemeral deployments (e.g. Vercel, where
 * SQLite lives in /tmp and is wiped on cold starts) populated at boot.
 */
import { DateTime } from 'luxon';
import type { AppCtx } from './context.js';
import { createUser, findUserByEmail } from './domain/users.js';
import { createSchedule, findScheduleByName } from './domain/schedules.js';
import { createPolicy, findPolicyByName } from './domain/escalation-policies.js';
import { createService, findServiceByName, listIntegrations } from './domain/services.js';
import { triggerIncident, listIncidents } from './domain/incidents.js';

export interface SeedSummary {
  /** Routing key of the demo service's events integration. */
  routingKey: string | null;
}

/** Create whatever demo data is missing; safe to call on every startup. */
export function seedDemoData(ctx: AppCtx): SeedSummary {
  const { db } = ctx;

  const ensureUser = (name: string, email: string) =>
    findUserByEmail(db, email) ?? createUser(db, { name, email });

  const alice = ensureUser('Alice Chen', 'alice@example.com');
  const bob = ensureUser('Bob Patel', 'bob@example.com');
  const carol = ensureUser('Carol Diaz', 'carol@example.com');

  const schedule =
    findScheduleByName(db, 'Platform primary') ??
    createSchedule(db, {
      name: 'Platform primary',
      description: 'Weekly rotation for the platform team',
      timezone: 'UTC',
      layers: [
        {
          rotation_type: 'weekly',
          handoff_time: '09:00',
          anchor_date: DateTime.utc().startOf('week').toISODate()!,
          user_ids: [alice.id, bob.id, carol.id],
        },
      ],
    });

  const policy =
    findPolicyByName(db, 'Platform standard') ??
    createPolicy(db, {
      name: 'Platform standard',
      repeat_count: 1,
      levels: [
        { timeout_minutes: 5, targets: [{ target_type: 'schedule', target_id: schedule.id }] },
        {
          timeout_minutes: 10,
          targets: [
            { target_type: 'user', target_id: alice.id },
            { target_type: 'user', target_id: bob.id },
          ],
        },
      ],
    });

  const service =
    findServiceByName(db, 'Checkout API') ??
    createService(db, {
      name: 'Checkout API',
      description: 'Payment and checkout flow',
      escalation_policy_id: policy.id,
    });

  if (!listIncidents(db, { service_id: service.id }).length) {
    triggerIncident(ctx, {
      service_id: service.id,
      title: 'Demo: checkout latency p99 above 2s',
      description: 'This is seeded demo data — resolve it from the dashboard or with /incident resolve 1 in Slack.',
      urgency: 'low',
      source: 'seed',
    });
  }

  return { routingKey: listIntegrations(db, service.id)[0]?.routing_key ?? null };
}
