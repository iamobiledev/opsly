import { createDb } from '../src/db/index.js';
import { loadConfig } from '../src/config.js';
import type { AppCtx } from '../src/context.js';
import type { NotifyEvent } from '../src/types.js';
import { createUser } from '../src/domain/users.js';
import { createService } from '../src/domain/services.js';
import { createPolicy } from '../src/domain/escalation-policies.js';
import type { User, Service, EscalationPolicy } from '../src/types.js';

export interface TestCtx extends AppCtx {
  /** Notifications captured synchronously, in order. */
  notifications: NotifyEvent[];
}

export function testCtx(): TestCtx {
  const notifications: NotifyEvent[] = [];
  const ctx: TestCtx = {
    db: createDb(':memory:'),
    config: loadConfig({ DB_PATH: ':memory:', PORT: '0' } as NodeJS.ProcessEnv),
    notifier: {
      // push synchronously so tests can assert immediately after the call
      notify(event: NotifyEvent) {
        notifications.push(event);
        return Promise.resolve();
      },
    },
    notifications,
  };
  return ctx;
}

export function makeUsers(ctx: AppCtx, names: string[]): User[] {
  return names.map((name) =>
    createUser(ctx.db, { name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com` })
  );
}

export function makeUserPolicy(
  ctx: AppCtx,
  name: string,
  levels: { users: User[]; timeout?: number }[],
  repeat = 0
): EscalationPolicy {
  return createPolicy(ctx.db, {
    name,
    repeat_count: repeat,
    levels: levels.map((l) => ({
      timeout_minutes: l.timeout ?? 30,
      targets: l.users.map((u) => ({ target_type: 'user' as const, target_id: u.id })),
    })),
  });
}

export function makeService(ctx: AppCtx, name: string, policyId?: string | null): Service {
  return createService(ctx.db, { name, escalation_policy_id: policyId ?? null });
}
