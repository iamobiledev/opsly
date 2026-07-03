import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { testCtx, makeUsers, makeUserPolicy, makeService } from './helpers.js';
import {
  triggerIncident,
  acknowledgeIncident,
  resolveIncident,
  escalateIncident,
  reassignIncident,
  addNote,
  getTimeline,
  sweepEscalations,
  listIncidents,
} from '../src/domain/incidents.js';
import { createPolicy } from '../src/domain/escalation-policies.js';
import { createSchedule } from '../src/domain/schedules.js';

describe('trigger', () => {
  it('assigns level-1 targets, starts the escalation timer, and notifies', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const policy = makeUserPolicy(ctx, 'P', [{ users: [a!], timeout: 15 }, { users: [b!] }]);
    const service = makeService(ctx, 'API', policy.id);

    const incident = triggerIncident(ctx, { service_id: service.id, title: 'DB is down' });
    expect(incident.status).toBe('triggered');
    expect(incident.number).toBe(1);
    expect(incident.escalation_level).toBe(1);
    expect(incident.assignees.map((u) => u.id)).toEqual([a!.id]);
    expect(incident.next_escalation_at).toBeTruthy();
    const eta = DateTime.fromISO(incident.next_escalation_at!).diff(DateTime.utc(), 'minutes').minutes;
    expect(eta).toBeGreaterThan(13);
    expect(eta).toBeLessThan(16);

    expect(ctx.notifications).toHaveLength(1);
    expect(ctx.notifications[0]!.kind).toBe('triggered');
    expect(getTimeline(ctx.db, incident.id).map((e) => e.type)).toEqual(['triggered', 'assigned']);
  });

  it('does not start an escalation timer for low urgency', () => {
    const ctx = testCtx();
    const [a] = makeUsers(ctx, ['Alice']);
    const policy = makeUserPolicy(ctx, 'P', [{ users: [a!] }]);
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'Minor', urgency: 'low' });
    expect(incident.next_escalation_at).toBeNull();
  });

  it('resolves schedule targets to whoever is on call now', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const schedule = createSchedule(ctx.db, {
      name: 'Primary',
      timezone: 'UTC',
      layers: [{ rotation_type: 'daily', handoff_time: '00:00', anchor_date: '2020-01-01', user_ids: [a!.id] }],
    });
    const policy = createPolicy(ctx.db, {
      name: 'SchedPolicy',
      levels: [
        { timeout_minutes: 10, targets: [{ target_type: 'schedule', target_id: schedule.id }] },
        { timeout_minutes: 10, targets: [{ target_type: 'user', target_id: b!.id }] },
      ],
    });
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'Broken' });
    expect(incident.assignees.map((u) => u.id)).toEqual([a!.id]);
  });

  it('skips empty levels (e.g. schedule with nobody on call yet)', () => {
    const ctx = testCtx();
    const [b] = makeUsers(ctx, ['Bob']);
    const emptySchedule = createSchedule(ctx.db, {
      name: 'NotStarted',
      timezone: 'UTC',
      layers: [{ rotation_type: 'daily', anchor_date: '2099-01-01', user_ids: [b!.id] }],
    });
    const policy = createPolicy(ctx.db, {
      name: 'P',
      levels: [
        { timeout_minutes: 5, targets: [{ target_type: 'schedule', target_id: emptySchedule.id }] },
        { timeout_minutes: 5, targets: [{ target_type: 'user', target_id: b!.id }] },
      ],
    });
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });
    expect(incident.escalation_level).toBe(2);
    expect(incident.assignees.map((u) => u.id)).toEqual([b!.id]);
  });

  it('deduplicates open incidents by dedup key', () => {
    const ctx = testCtx();
    const service = makeService(ctx, 'API');
    const first = triggerIncident(ctx, { service_id: service.id, title: 'X', dedup_key: 'k1' });
    const second = triggerIncident(ctx, { service_id: service.id, title: 'X again', dedup_key: 'k1' });
    expect(second.id).toBe(first.id);
    expect(second.alert_count).toBe(2);
    expect(listIncidents(ctx.db)).toHaveLength(1);
  });
});

describe('acknowledge / resolve', () => {
  it('walks the happy path and stops the timer', () => {
    const ctx = testCtx();
    const [a] = makeUsers(ctx, ['Alice']);
    const policy = makeUserPolicy(ctx, 'P', [{ users: [a!] }]);
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });

    const acked = acknowledgeIncident(ctx, incident.id, a!.id);
    expect(acked.status).toBe('acknowledged');
    expect(acked.acknowledged_by).toBe(a!.id);
    expect(acked.next_escalation_at).toBeNull();

    const resolved = resolveIncident(ctx, incident.id, a!.id);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_by).toBe(a!.id);

    expect(() => acknowledgeIncident(ctx, incident.id)).toThrow(/already resolved/);
    expect(() => resolveIncident(ctx, incident.id)).toThrow(/already resolved/);
  });

  it('rejects double acknowledgement', () => {
    const ctx = testCtx();
    const service = makeService(ctx, 'API');
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });
    acknowledgeIncident(ctx, incident.id);
    expect(() => acknowledgeIncident(ctx, incident.id)).toThrow(/already acknowledged/);
  });
});

describe('escalation', () => {
  it('manual escalation moves to the next level and re-pages', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const policy = makeUserPolicy(ctx, 'P', [{ users: [a!] }, { users: [b!] }]);
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });
    acknowledgeIncident(ctx, incident.id, a!.id);

    const escalated = escalateIncident(ctx, incident.id, { actor_user_id: a!.id });
    expect(escalated.escalation_level).toBe(2);
    expect(escalated.status).toBe('triggered'); // escalation re-pages
    expect(escalated.assignees.map((u) => u.id)).toEqual([b!.id]);
  });

  it('wraps back to level 1 while repeats remain, then refuses', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const policy = makeUserPolicy(ctx, 'P', [{ users: [a!] }, { users: [b!] }], 1);
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });

    expect(escalateIncident(ctx, incident.id).escalation_level).toBe(2);
    const wrapped = escalateIncident(ctx, incident.id);
    expect(wrapped.escalation_level).toBe(1);
    expect(wrapped.escalation_repeats_done).toBe(1);
    expect(escalateIncident(ctx, incident.id).escalation_level).toBe(2);
    expect(() => escalateIncident(ctx, incident.id)).toThrow(/final escalation level/);
  });

  it('the sweep escalates overdue incidents and marks exhaustion at the end', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const policy = makeUserPolicy(ctx, 'P', [
      { users: [a!], timeout: 1 },
      { users: [b!], timeout: 1 },
    ]);
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });

    // Nothing due yet.
    expect(sweepEscalations(ctx, DateTime.utc().toISO()!)).toBe(0);

    // 2 minutes later: level 1 -> 2.
    const later = DateTime.utc().plus({ minutes: 2 }).toISO()!;
    expect(sweepEscalations(ctx, later)).toBe(1);
    let detail = listIncidents(ctx.db)[0]!;
    expect(detail.escalation_level).toBe(2);
    expect(detail.assignees.map((u) => u.id)).toEqual([b!.id]);
    expect(detail.next_escalation_at).toBeTruthy();

    // Later still: policy exhausted -> timer cleared, timeline records it.
    const muchLater = DateTime.utc().plus({ minutes: 10 }).toISO()!;
    sweepEscalations(ctx, muchLater);
    detail = listIncidents(ctx.db)[0]!;
    expect(detail.next_escalation_at).toBeNull();
    expect(getTimeline(ctx.db, incident.id).some((e) => e.type === 'escalation_exhausted')).toBe(true);
    // Still triggered — nobody ever acknowledged.
    expect(detail.status).toBe('triggered');
  });

  it('acknowledged incidents do not auto-escalate', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const policy = makeUserPolicy(ctx, 'P', [{ users: [a!], timeout: 1 }, { users: [b!] }]);
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });
    acknowledgeIncident(ctx, incident.id, a!.id);
    expect(sweepEscalations(ctx, DateTime.utc().plus({ hours: 1 }).toISO()!)).toBe(0);
  });
});

describe('reassign & notes', () => {
  it('reassignment hands the incident to one person and re-pages', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const policy = makeUserPolicy(ctx, 'P', [{ users: [a!] }]);
    const service = makeService(ctx, 'API', policy.id);
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });
    acknowledgeIncident(ctx, incident.id, a!.id);

    const reassigned = reassignIncident(ctx, incident.id, b!.id, a!.id);
    expect(reassigned.status).toBe('triggered');
    expect(reassigned.assignees.map((u) => u.id)).toEqual([b!.id]);
    expect(reassigned.next_escalation_at).toBeTruthy();
  });

  it('notes land on the timeline with their author', () => {
    const ctx = testCtx();
    const [a] = makeUsers(ctx, ['Alice']);
    const service = makeService(ctx, 'API');
    const incident = triggerIncident(ctx, { service_id: service.id, title: 'X' });
    addNote(ctx, incident.id, 'Looking into it', a!.id);
    const timeline = getTimeline(ctx.db, incident.id);
    const note = timeline.find((e) => e.type === 'note');
    expect(note?.message).toBe('Looking into it');
    expect(note?.actor_user_id).toBe(a!.id);
  });
});
