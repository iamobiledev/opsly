import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { consoleNotifier, type AppCtx } from './context.js';
import { createApiServer } from './api/server.js';
import { startEscalationEngine } from './engine/escalation.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.dbPath);
  const ctx: AppCtx = { db, config, notifier: consoleNotifier };

  if (config.slack) {
    const { startSlack } = await import('./slack/app.js');
    await startSlack(ctx);
  } else {
    console.log('[slack] not configured (set SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET to enable)');
  }

  startEscalationEngine(ctx);

  const app = createApiServer(ctx);
  app.listen(config.port, () => {
    console.log(`[api] Opsly listening on ${config.baseUrl} (port ${config.port})`);
    console.log(`[api] dashboard: ${config.baseUrl} · health: ${config.baseUrl}/healthz`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
