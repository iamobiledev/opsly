import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { testCtx, type TestCtx } from './helpers.js';
import { createApiServer } from '../src/api/server.js';

let ctx: TestCtx;
let server: Server;
let base: string;

beforeAll(async () => {
  ctx = testCtx();
  ctx.config.apiToken = 'secret-token';
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

async function api(path: string, init: RequestInit = {}, token = 'secret-token'): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe('REST API end-to-end', () => {
  it('protects the API with the bearer token', async () => {
    const unauthed = await api('/api/v1/users', {}, '');
    expect(unauthed.status).toBe(401);
    const authed = await api('/api/v1/users');
    expect(authed.status).toBe(200);
  });

  it('drives the full setup + incident flow over HTTP', async () => {
    // 1. Create users.
    const alice = (await api('/api/v1/users', { method: 'POST', body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }) })).body.user;
    const bob = (await api('/api/v1/users', { method: 'POST', body: JSON.stringify({ name: 'Bob' }) })).body.user;

    // 2. Create a schedule with a daily rotation.
    const scheduleRes = await api('/api/v1/schedules', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Primary',
        timezone: 'UTC',
        layers: [{ rotation_type: 'daily', handoff_time: '00:00', anchor_date: '2020-01-01', user_ids: [alice.id, bob.id] }],
      }),
    });
    expect(scheduleRes.status).toBe(201);
    const schedule = scheduleRes.body.schedule;

    // 3. Escalation policy: schedule first, then both humans.
    const policyRes = await api('/api/v1/escalation-policies', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Standard',
        repeat_count: 0,
        levels: [
          { timeout_minutes: 10, targets: [{ target_type: 'schedule', target_id: schedule.id }] },
          { timeout_minutes: 10, targets: [{ target_type: 'user', target_id: alice.id }, { target_type: 'user', target_id: bob.id }] },
        ],
      }),
    });
    expect(policyRes.status).toBe(201);

    // 4. Service wired to the policy; grab its auto-created routing key.
    const serviceRes = await api('/api/v1/services', {
      method: 'POST',
      body: JSON.stringify({ name: 'Checkout', escalation_policy_id: policyRes.body.escalation_policy.id }),
    });
    expect(serviceRes.status).toBe(201);
    const routingKey = serviceRes.body.service.integrations[0].routing_key;
    expect(routingKey).toMatch(/^rk_/);

    // 5. Monitoring fires an event — no API token needed, just the routing key.
    const eventRes = await api(
      '/api/v1/events',
      {
        method: 'POST',
        body: JSON.stringify({
          routing_key: routingKey,
          event_action: 'trigger',
          dedup_key: 'checkout-500s',
          payload: { summary: 'Checkout error rate > 5%', severity: 'critical', source: 'prometheus' },
        }),
      },
      ''
    );
    expect(eventRes.status).toBe(202);
    expect(eventRes.body.incident_number).toBe(1);

    // 6. The incident exists, is assigned to the on-call, and can be worked via the API.
    const incidents = (await api('/api/v1/incidents?status=open')).body.incidents;
    expect(incidents).toHaveLength(1);
    expect(incidents[0].assignees.length).toBeGreaterThan(0);

    const ack = await api(`/api/v1/incidents/1/acknowledge`, { method: 'POST', body: JSON.stringify({ user_id: alice.id }) });
    expect(ack.status).toBe(200);
    expect(ack.body.incident.status).toBe('acknowledged');

    const note = await api(`/api/v1/incidents/1/notes`, { method: 'POST', body: JSON.stringify({ content: 'rolling back', user_id: alice.id }) });
    expect(note.status).toBe(200);

    const resolve = await api(`/api/v1/incidents/1/resolve`, { method: 'POST', body: JSON.stringify({ user_id: alice.id }) });
    expect(resolve.body.incident.status).toBe('resolved');

    const detail = await api('/api/v1/incidents/1');
    expect(detail.body.timeline.map((e: any) => e.type)).toContain('note');

    // 7. On-call endpoint shows the schedule.
    const oncalls = (await api('/api/v1/oncalls')).body.oncalls;
    expect(oncalls).toHaveLength(1);
    expect(oncalls[0].user).toBeTruthy();

    // 8. Schedule detail renders shifts.
    const schedDetail = await api(`/api/v1/schedules/${schedule.id}?days=7`);
    expect(schedDetail.body.shifts.length).toBeGreaterThan(0);
  });

  it('returns clean JSON errors', async () => {
    const bad = await api('/api/v1/services', { method: 'POST', body: JSON.stringify({}) });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/name is required/i);

    const missing = await api('/api/v1/incidents/999999');
    expect(missing.status).toBe(404);
  });
});
