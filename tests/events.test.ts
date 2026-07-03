import { describe, expect, it } from 'vitest';
import { testCtx, makeUsers, makeUserPolicy, makeService } from './helpers.js';
import { ingestEvent } from '../src/domain/events.js';
import { listIntegrations } from '../src/domain/services.js';
import { listIncidents, resolveIncident } from '../src/domain/incidents.js';

function setup() {
  const ctx = testCtx();
  const [a] = makeUsers(ctx, ['Alice']);
  const policy = makeUserPolicy(ctx, 'P', [{ users: [a!] }]);
  const service = makeService(ctx, 'API', policy.id);
  const key = listIntegrations(ctx.db, service.id)[0]!.routing_key;
  return { ctx, service, key, alice: a! };
}

describe('events API', () => {
  it('rejects unknown routing keys', () => {
    const { ctx } = setup();
    expect(() =>
      ingestEvent(ctx, { routing_key: 'rk_bogus', event_action: 'trigger', payload: { summary: 'x' } })
    ).toThrow(/Unknown routing_key/);
  });

  it('trigger creates an incident; severity maps to urgency', () => {
    const { ctx, key } = setup();
    const res = ingestEvent(ctx, {
      routing_key: key,
      event_action: 'trigger',
      payload: { summary: 'High CPU', source: 'prometheus', severity: 'warning' },
    });
    expect(res.status).toBe('success');
    expect(res.dedup_key).toBeTruthy();
    const incident = listIncidents(ctx.db)[0]!;
    expect(incident.title).toBe('High CPU');
    expect(incident.urgency).toBe('low'); // warning -> low
    expect(incident.source).toBe('prometheus');

    const critical = ingestEvent(ctx, {
      routing_key: key,
      event_action: 'trigger',
      payload: { summary: 'Down', severity: 'critical' },
    });
    expect(critical.incident_number).toBe(2);
    expect(listIncidents(ctx.db).find((i) => i.number === 2)?.urgency).toBe('high');
  });

  it('repeated triggers with the same dedup_key fold into one incident', () => {
    const { ctx, key } = setup();
    const first = ingestEvent(ctx, {
      routing_key: key,
      event_action: 'trigger',
      dedup_key: 'cpu-web-1',
      payload: { summary: 'High CPU' },
    });
    const second = ingestEvent(ctx, {
      routing_key: key,
      event_action: 'trigger',
      dedup_key: 'cpu-web-1',
      payload: { summary: 'High CPU (still)' },
    });
    expect(second.incident_id).toBe(first.incident_id);
    expect(second.message).toMatch(/deduplicated/i);
    expect(listIncidents(ctx.db)).toHaveLength(1);
    expect(listIncidents(ctx.db)[0]!.alert_count).toBe(2);
  });

  it('acknowledge and resolve work through the dedup_key', () => {
    const { ctx, key } = setup();
    ingestEvent(ctx, {
      routing_key: key,
      event_action: 'trigger',
      dedup_key: 'disk-full',
      payload: { summary: 'Disk full' },
    });
    const ackRes = ingestEvent(ctx, { routing_key: key, event_action: 'acknowledge', dedup_key: 'disk-full' });
    expect(ackRes.status).toBe('success');
    expect(listIncidents(ctx.db)[0]!.status).toBe('acknowledged');

    const resolveRes = ingestEvent(ctx, { routing_key: key, event_action: 'resolve', dedup_key: 'disk-full' });
    expect(resolveRes.status).toBe('success');
    expect(listIncidents(ctx.db)[0]!.status).toBe('resolved');

    // Resolving again is an accepted no-op (matches PagerDuty semantics).
    const again = ingestEvent(ctx, { routing_key: key, event_action: 'resolve', dedup_key: 'disk-full' });
    expect(again.message).toMatch(/nothing to do/i);
  });

  it('a new trigger after resolve opens a fresh incident', () => {
    const { ctx, key } = setup();
    const first = ingestEvent(ctx, {
      routing_key: key,
      event_action: 'trigger',
      dedup_key: 'flappy',
      payload: { summary: 'Flappy check' },
    });
    resolveIncident(ctx, first.incident_id!);
    const second = ingestEvent(ctx, {
      routing_key: key,
      event_action: 'trigger',
      dedup_key: 'flappy',
      payload: { summary: 'Flappy check' },
    });
    expect(second.incident_id).not.toBe(first.incident_id);
    expect(listIncidents(ctx.db)).toHaveLength(2);
  });

  it('requires a summary on trigger', () => {
    const { ctx, key } = setup();
    expect(() => ingestEvent(ctx, { routing_key: key, event_action: 'trigger', payload: {} })).toThrow(
      /summary is required/
    );
  });
});
