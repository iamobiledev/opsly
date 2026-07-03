/**
 * Vercel entrypoint: the whole Express app (dashboard, REST API, events
 * endpoint) runs as a single serverless function, with every route rewritten
 * here by vercel.json.
 *
 * Differences from `npm start` (details in README "Deploy to Vercel"):
 * - No in-process escalation engine; Vercel Cron calls
 *   GET /api/v1/escalation-sweep instead (schedule in vercel.json).
 * - Slack is disabled: Socket Mode needs a long-lived connection.
 * - Without DB_PATH, SQLite lands in /tmp — per-instance and wiped on cold
 *   starts. Set SEED_ON_START=1 to keep the demo data available anyway.
 */
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { consoleNotifier, type AppCtx } from '../src/context.js';
import { createApiServer } from '../src/api/server.js';
import { seedDemoData } from '../src/seed-data.js';

const config = loadConfig();
if (config.slack) {
  console.warn('[slack] Socket Mode requires a long-lived process; Slack is disabled on this serverless deployment.');
  config.slack = null;
}

const db = createDb(config.dbPath);
const ctx: AppCtx = { db, config, notifier: consoleNotifier };
if (config.seedOnStart) seedDemoData(ctx);

export default createApiServer(ctx);
