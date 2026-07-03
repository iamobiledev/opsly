/**
 * Seed demo data so you can click around immediately:
 *   npm run seed
 * Safe to re-run; it skips anything that already exists.
 */
import { DateTime } from 'luxon';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { consoleNotifier, type AppCtx } from './context.js';
import { createUser, findUserByEmail } from './domain/users.js';
import { createSchedule, findScheduleByName } from './domain/schedules.js';
import { createPolicy, findPolicyByName } from './domain/escalation-policies.js';
import { createService, findServiceByName, listIntegrations } from './domain/services.js';
import { triggerIncident, listIncidents } from './domain/incidents.js';

const config = loadConfig();
const db = createDb(config.dbPath);
const ctx: AppCtx = { db, config, notifier: consoleNotifier };

function ensureUser(name: string, email: string) {
  return findUserByEmail(db, email) ?? createUser(db, { name, email });
}

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

const key = listIntegrations(db, service.id)[0]?.routing_key;
console.log(`
Seeded ✔
  Users:     Alice Chen, Bob Patel, Carol Diaz
  Schedule:  Platform primary (weekly, Mon 09:00 UTC handoff)
  Policy:    Platform standard (on-call ->5m-> Alice+Bob, repeats once)
  Service:   Checkout API
  Routing key: ${key}

Try it:
  curl -X POST http://localhost:${config.port}/api/v1/events \\
    -H 'Content-Type: application/json' \\
    -d '{"routing_key":"${key}","event_action":"trigger","payload":{"summary":"Test alert","severity":"critical"}}'
`);
