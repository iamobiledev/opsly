import pkg from '@slack/bolt';
import type { App as AppType } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import type { AppCtx } from '../context.js';
import { SlackNotifier } from './notifier.js';
import { registerCommands } from './commands.js';
import { registerActions } from './actions.js';
import { registerModals } from './modals.js';
import { publishHome } from './home.js';
import { ensureUser } from './identity.js';

const { App } = pkg;

/**
 * Boot the Slack side of Opsly (Socket Mode) and swap the app notifier for the
 * Slack one so incident lifecycle events page people in Slack.
 */
export async function startSlack(ctx: AppCtx): Promise<AppType> {
  const slack = ctx.config.slack!;
  const app = new App({
    token: slack.botToken,
    appToken: slack.appToken,
    signingSecret: slack.signingSecret,
    socketMode: true,
  });

  registerCommands(app, ctx);
  registerActions(app, ctx);
  registerModals(app, ctx);

  // App Home: refresh on open, provisioning the user on first contact.
  app.event('app_home_opened', async ({ event, client }) => {
    if (event.tab !== 'home') return;
    await ensureUser(ctx, client as WebClient, event.user);
    await publishHome(ctx, client as WebClient, event.user);
  });

  app.error(async (err) => {
    console.error('[slack] unhandled error:', err);
  });

  await app.start();
  ctx.notifier = new SlackNotifier(ctx, app.client as WebClient);
  console.log('[slack] connected via Socket Mode');
  return app;
}
