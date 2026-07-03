import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { DateTime } from 'luxon';
import { testCtx, makeUsers, makeUserPolicy, makeService, type TestCtx } from './helpers.js';
import { createApiServer } from '../src/api/server.js';
import { loadConfig } from '../src/config.js';
import { seedDemoData } from '../src/seed-data.js';
import { listUsers } from '../src/domain/users.js';
import { triggerIncident, getIncident } from '../src/domain/incidents.js';

describe('serverless config defaults', () => {
  it('defaults the DB to /tmp on Vercel, where the deployment filesystem is read-only', () => {
    expect(loadConfig({} as NodeJS.ProcessEnv).dbPath).toBe('./data/opsly.db');
    expect(loadConfig({ VERCEL: '1' } as NodeJS.ProcessEnv).dbPath).toBe('/tmp/opsly.db');
    expect(loadConfig({ VERCEL: '1', DB_PATH: './custom.db' } as NodeJS.ProcessEnv).dbPath).toBe('./custom.db');
  });

  it('parses CRON_SECRET and SEED_ON_START', () => {
    const cfg = loadConfig({ CRON_SECRET: ' s3cret ', SEED_ON_START: 'true' } as NodeJS.ProcessEnv);
    expect(cfg.cronSecret).toBe('s3cret');
    expect(cfg.seedOnStart).toBe(true);
    const off = loadConfig({} as NodeJS.ProcessEnv);
    expect(off.cronSecret).toBeNull();
    expect(off.seedOnStart).toBe(false);
  });
});

describe('seedDemoData', () => {
  it('creates the demo dataset and is idempotent', () => {
    const ctx = testCtx();
    const first = seedDemoData(ctx);
    expect(first.routingKey).toMatch(/^rk_/);
    const userCount = listUsers(ctx.db).length;
    expect(userCount).toBeGreaterThanOrEqual(3);

    const second = seedDemoData(ctx);
    expect(second.routingKey).toBe(first.routingKey);
    expect(listUsers(ctx.db).length).toBe(userCount);
  });
});

describe('escalation-sweep endpoint', () => {
  let ctx: TestCtx;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    ctx = testCtx();
    const app = createApiServer(ctx);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(() => {
    server?.close();
  });

  async function sweep(token?: string, method: 'GET' | 'POST' = 'GET') {
    const res = await fetch(`${base}/api/v1/escalation-sweep`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  it('is open when neither CRON_SECRET nor API_TOKEN is configured', async () => {
    const res = await sweep();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ escalated: 0 });
  });

  it('requires a matching token once CRON_SECRET or API_TOKEN is set', async () => {
    ctx.config.cronSecret = 'cron-secret';
    ctx.config.apiToken = 'api-token';
    try {
      expect((await sweep()).status).toBe(401);
      expect((await sweep('wrong')).status).toBe(401);
      // Vercel Cron sends CRON_SECRET via GET; humans/scripts may use the API token.
      expect((await sweep('cron-secret')).status).toBe(200);
      expect((await sweep('api-token', 'POST')).status).toBe(200);
    } finally {
      ctx.config.cronSecret = null;
      ctx.config.apiToken = null;
    }
  });

  it('escalates overdue incidents when called', async () => {
    const [dana, eve] = makeUsers(ctx, ['Dana', 'Eve']);
    const policy = makeUserPolicy(ctx, 'Sweepable', [{ users: [dana!] }, { users: [eve!] }]);
    const service = makeService(ctx, 'Sweep service', policy.id);
    const incident = triggerIncident(ctx, {
      service_id: service.id,
      title: 'Nobody acked this',
      urgency: 'high',
    });
    expect(incident.escalation_level).toBe(1);

    // Backdate the deadline so the sweep sees the incident as overdue.
    ctx.db
      .prepare('UPDATE incidents SET next_escalation_at = ? WHERE id = ?')
      .run(DateTime.utc().minus({ minutes: 1 }).toISO()!, incident.id);

    const res = await sweep();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ escalated: 1 });
    expect(getIncident(ctx.db, incident.id).escalation_level).toBe(2);
  });
});
