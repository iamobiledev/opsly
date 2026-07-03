import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { testCtx, makeUsers } from './helpers.js';
import {
  createSchedule,
  createOverride,
  onCallAt,
  renderShifts,
} from '../src/domain/schedules.js';

describe('daily rotation', () => {
  it('hands off at the configured local time and cycles through users in order', () => {
    const ctx = testCtx();
    const [a, b, c] = makeUsers(ctx, ['Alice', 'Bob', 'Carol']);
    const schedule = createSchedule(ctx.db, {
      name: 'Primary',
      timezone: 'UTC',
      layers: [
        {
          rotation_type: 'daily',
          handoff_time: '09:00',
          anchor_date: '2026-06-01',
          user_ids: [a!.id, b!.id, c!.id],
        },
      ],
    });

    // Day 0 (Jun 1, 09:00 -> Jun 2, 09:00) = Alice
    expect(onCallAt(ctx.db, schedule.id, '2026-06-01T09:00:00Z')?.user_id).toBe(a!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-01T23:59:00Z')?.user_id).toBe(a!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-02T08:59:59Z')?.user_id).toBe(a!.id);
    // Day 1 = Bob
    expect(onCallAt(ctx.db, schedule.id, '2026-06-02T09:00:00Z')?.user_id).toBe(b!.id);
    // Day 2 = Carol, Day 3 wraps to Alice
    expect(onCallAt(ctx.db, schedule.id, '2026-06-03T12:00:00Z')?.user_id).toBe(c!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-04T12:00:00Z')?.user_id).toBe(a!.id);
  });

  it('returns nobody before the rotation anchor', () => {
    const ctx = testCtx();
    const [a] = makeUsers(ctx, ['Alice']);
    const schedule = createSchedule(ctx.db, {
      name: 'Future',
      timezone: 'UTC',
      layers: [
        { rotation_type: 'daily', handoff_time: '09:00', anchor_date: '2030-01-01', user_ids: [a!.id] },
      ],
    });
    expect(onCallAt(ctx.db, schedule.id, '2029-12-31T12:00:00Z')).toBeNull();
    expect(onCallAt(ctx.db, schedule.id, '2030-01-01T09:00:00Z')?.user_id).toBe(a!.id);
  });
});

describe('weekly rotation', () => {
  it('hands off once a week', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const schedule = createSchedule(ctx.db, {
      name: 'Weekly',
      timezone: 'UTC',
      layers: [
        // 2026-06-01 is a Monday
        { rotation_type: 'weekly', handoff_time: '10:00', anchor_date: '2026-06-01', user_ids: [a!.id, b!.id] },
      ],
    });
    expect(onCallAt(ctx.db, schedule.id, '2026-06-01T10:00:00Z')?.user_id).toBe(a!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-08T09:59:00Z')?.user_id).toBe(a!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-08T10:00:00Z')?.user_id).toBe(b!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-15T10:00:00Z')?.user_id).toBe(a!.id);
  });
});

describe('custom rotation', () => {
  it('supports 12-hour shifts', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const schedule = createSchedule(ctx.db, {
      name: 'FollowTheSun',
      timezone: 'UTC',
      layers: [
        {
          rotation_type: 'custom',
          shift_length_hours: 12,
          handoff_time: '08:00',
          anchor_date: '2026-06-01',
          user_ids: [a!.id, b!.id],
        },
      ],
    });
    expect(onCallAt(ctx.db, schedule.id, '2026-06-01T08:00:00Z')?.user_id).toBe(a!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-01T19:59:00Z')?.user_id).toBe(a!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-01T20:00:00Z')?.user_id).toBe(b!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-02T08:00:00Z')?.user_id).toBe(a!.id);
  });
});

describe('DST handling', () => {
  it('keeps the local handoff time across the US spring-forward transition', () => {
    const ctx = testCtx();
    const [a, b, c] = makeUsers(ctx, ['Alice', 'Bob', 'Carol']);
    const schedule = createSchedule(ctx.db, {
      name: 'NY',
      timezone: 'America/New_York',
      layers: [
        {
          rotation_type: 'daily',
          handoff_time: '09:00',
          // 2026-03-08 is the spring-forward date in the US
          anchor_date: '2026-03-06',
          user_ids: [a!.id, b!.id, c!.id],
        },
      ],
    });
    // Mar 6 = Alice, Mar 7 = Bob, Mar 8 = Carol, Mar 9 = Alice.
    // Before spring forward: 09:00 EST == 14:00 UTC.
    expect(onCallAt(ctx.db, schedule.id, '2026-03-07T14:00:00Z')?.user_id).toBe(b!.id);
    // Mar 8 09:00 EDT == 13:00 UTC — handoff still happens at 9am local.
    expect(onCallAt(ctx.db, schedule.id, '2026-03-08T12:59:00Z')?.user_id).toBe(b!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-03-08T13:00:00Z')?.user_id).toBe(c!.id);
    // Mar 9 09:00 EDT == 13:00 UTC.
    expect(onCallAt(ctx.db, schedule.id, '2026-03-09T12:59:00Z')?.user_id).toBe(c!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-03-09T13:00:00Z')?.user_id).toBe(a!.id);
  });
});

describe('restrictions', () => {
  it('only puts the layer on call inside a daytime window', () => {
    const ctx = testCtx();
    const [a, night] = makeUsers(ctx, ['Alice', 'NightOwl']);
    const schedule = createSchedule(ctx.db, {
      name: 'Restricted',
      timezone: 'UTC',
      layers: [
        // Base layer: nights covered by NightOwl (no restriction, lower position).
        {
          position: 1,
          rotation_type: 'daily',
          handoff_time: '00:00',
          anchor_date: '2026-06-01',
          user_ids: [night!.id],
        },
        // Business-hours layer on top.
        {
          position: 2,
          rotation_type: 'daily',
          handoff_time: '09:00',
          anchor_date: '2026-06-01',
          restriction_start: '09:00',
          restriction_end: '17:00',
          user_ids: [a!.id],
        },
      ],
    });
    expect(onCallAt(ctx.db, schedule.id, '2026-06-02T10:00:00Z')?.user_id).toBe(a!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-02T18:00:00Z')?.user_id).toBe(night!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-02T03:00:00Z')?.user_id).toBe(night!.id);
  });

  it('supports overnight restriction windows', () => {
    const ctx = testCtx();
    const [owl] = makeUsers(ctx, ['Owl']);
    const schedule = createSchedule(ctx.db, {
      name: 'Nights',
      timezone: 'UTC',
      layers: [
        {
          rotation_type: 'daily',
          handoff_time: '22:00',
          anchor_date: '2026-06-01',
          restriction_start: '22:00',
          restriction_end: '06:00',
          user_ids: [owl!.id],
        },
      ],
    });
    expect(onCallAt(ctx.db, schedule.id, '2026-06-02T23:00:00Z')?.user_id).toBe(owl!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-03T05:00:00Z')?.user_id).toBe(owl!.id);
    expect(onCallAt(ctx.db, schedule.id, '2026-06-03T12:00:00Z')).toBeNull();
  });
});

describe('overrides', () => {
  it('an override beats the rotation, and shifts render around it', () => {
    const ctx = testCtx();
    const [a, b, sub] = makeUsers(ctx, ['Alice', 'Bob', 'Substitute']);
    const schedule = createSchedule(ctx.db, {
      name: 'WithOverride',
      timezone: 'UTC',
      layers: [
        { rotation_type: 'daily', handoff_time: '09:00', anchor_date: '2026-06-01', user_ids: [a!.id, b!.id] },
      ],
    });
    createOverride(ctx.db, {
      schedule_id: schedule.id,
      user_id: sub!.id,
      start_at: '2026-06-01T12:00:00Z',
      end_at: '2026-06-01T18:00:00Z',
    });

    expect(onCallAt(ctx.db, schedule.id, '2026-06-01T11:00:00Z')?.user_id).toBe(a!.id);
    const during = onCallAt(ctx.db, schedule.id, '2026-06-01T13:00:00Z');
    expect(during?.user_id).toBe(sub!.id);
    expect(during?.source).toBe('override');
    expect(onCallAt(ctx.db, schedule.id, '2026-06-01T18:00:00Z')?.user_id).toBe(a!.id);

    const shifts = renderShifts(ctx.db, schedule.id, '2026-06-01T09:00:00Z', '2026-06-02T09:00:00Z');
    expect(shifts).toEqual([
      expect.objectContaining({ user_id: a!.id, start: '2026-06-01T09:00:00.000Z', end: '2026-06-01T12:00:00.000Z' }),
      expect.objectContaining({ user_id: sub!.id, source: 'override', end: '2026-06-01T18:00:00.000Z' }),
      expect.objectContaining({ user_id: a!.id, end: '2026-06-02T09:00:00.000Z' }),
    ]);
  });

  it('rejects overrides with end before start', () => {
    const ctx = testCtx();
    const [a] = makeUsers(ctx, ['Alice']);
    const schedule = createSchedule(ctx.db, {
      name: 'S',
      timezone: 'UTC',
      layers: [{ rotation_type: 'daily', anchor_date: '2026-06-01', user_ids: [a!.id] }],
    });
    expect(() =>
      createOverride(ctx.db, {
        schedule_id: schedule.id,
        user_id: a!.id,
        start_at: '2026-06-02T10:00:00Z',
        end_at: '2026-06-02T09:00:00Z',
      })
    ).toThrow(/end must be after start/);
  });
});

describe('renderShifts', () => {
  it('merges consecutive segments belonging to the same user', () => {
    const ctx = testCtx();
    const [a, b] = makeUsers(ctx, ['Alice', 'Bob']);
    const schedule = createSchedule(ctx.db, {
      name: 'Merge',
      timezone: 'UTC',
      layers: [
        { rotation_type: 'daily', handoff_time: '09:00', anchor_date: '2026-06-01', user_ids: [a!.id, b!.id] },
      ],
    });
    const shifts = renderShifts(ctx.db, schedule.id, '2026-06-01T09:00:00Z', '2026-06-05T09:00:00Z');
    expect(shifts.map((s) => s.user_id)).toEqual([a!.id, b!.id, a!.id, b!.id]);
    // Each daily shift spans exactly 24h with no gaps.
    expect(DateTime.fromISO(shifts[0]!.end).diff(DateTime.fromISO(shifts[0]!.start), 'hours').hours).toBe(24);
    expect(shifts[0]!.end).toBe(shifts[1]!.start);
  });
});
