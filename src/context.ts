import type { DB } from './db/index.js';
import type { Config } from './config.js';
import type { NotifyEvent, Notifier } from './types.js';

export interface AppCtx {
  db: DB;
  config: Config;
  /** Swapped to the Slack notifier when Slack is configured. */
  notifier: Notifier;
}

export const consoleNotifier: Notifier = {
  async notify(event: NotifyEvent) {
    const who = event.assignees.map((u) => u.name).join(', ') || 'nobody';
    console.log(
      `[notify] ${event.kind} #${event.incident.number} "${event.incident.title}" ` +
        `(${event.service.name}) -> ${who}: ${event.summary}`
    );
  },
};

/** Dispatch a notification without blocking the caller; failures are logged, never thrown. */
export function dispatchNotify(ctx: AppCtx, event: NotifyEvent): void {
  void ctx.notifier.notify(event).catch((err) => {
    console.error(`[notify] failed for incident #${event.incident.number}:`, err);
  });
}
