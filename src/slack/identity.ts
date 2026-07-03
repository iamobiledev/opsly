import type { WebClient } from '@slack/web-api';
import type { AppCtx } from '../context.js';
import type { User } from '../types.js';
import { findUserBySlackId, upsertUserFromSlack } from '../domain/users.js';

/**
 * Resolve the Opsly user for a Slack user, auto-provisioning from their Slack
 * profile on first contact so nobody has to "sign up".
 */
export async function ensureUser(ctx: AppCtx, client: WebClient, slackUserId: string): Promise<User> {
  const existing = findUserBySlackId(ctx.db, slackUserId);
  if (existing) return existing;

  let name = `Slack user ${slackUserId}`;
  let email: string | null = null;
  let timezone: string | null = null;
  try {
    const info = await client.users.info({ user: slackUserId });
    const u = info.user;
    name = u?.profile?.display_name || u?.real_name || u?.name || name;
    email = u?.profile?.email ?? null; // needs users:read.email; fine if absent
    timezone = u?.tz ?? null;
  } catch (err) {
    console.error('[slack] users.info failed; creating minimal user:', err instanceof Error ? err.message : err);
  }
  return upsertUserFromSlack(ctx.db, { slack_user_id: slackUserId, name, email, timezone });
}
