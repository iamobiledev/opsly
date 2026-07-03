/**
 * Seed demo data so you can click around immediately:
 *   npm run seed
 * Safe to re-run; it skips anything that already exists.
 */
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { consoleNotifier, type AppCtx } from './context.js';
import { seedDemoData } from './seed-data.js';

const config = loadConfig();
const db = createDb(config.dbPath);
const ctx: AppCtx = { db, config, notifier: consoleNotifier };

const { routingKey } = seedDemoData(ctx);

console.log(`
Seeded ✔
  Users:     Alice Chen, Bob Patel, Carol Diaz
  Schedule:  Platform primary (weekly, Mon 09:00 UTC handoff)
  Policy:    Platform standard (on-call ->5m-> Alice+Bob, repeats once)
  Service:   Checkout API
  Routing key: ${routingKey}

Try it:
  curl -X POST http://localhost:${config.port}/api/v1/events \\
    -H 'Content-Type: application/json' \\
    -d '{"routing_key":"${routingKey}","event_action":"trigger","payload":{"summary":"Test alert","severity":"critical"}}'
`);
