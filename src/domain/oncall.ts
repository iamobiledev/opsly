import { DateTime } from 'luxon';
import type { DB } from '../db/index.js';
import type { Schedule, User } from '../types.js';
import { listSchedules, onCallAt, layerHandoffAt, renderShifts } from './schedules.js';
import { findUser } from './users.js';

export interface OnCallNow {
  schedule: Schedule;
  user: User | null;
  source: 'override' | 'layer' | null;
  /** When the current shift ends / next person takes over (best effort). */
  until: string | null;
}

/** Snapshot of who is on call right now across every schedule. */
export function whoIsOnCall(db: DB, atIso?: string): OnCallNow[] {
  const at = atIso ?? DateTime.utc().toISO()!;
  return listSchedules(db).map((schedule) => {
    const res = onCallAt(db, schedule.id, at);
    let until: string | null = null;
    if (res) {
      // Find the end of the current rendered shift for an accurate handoff time.
      const horizon = DateTime.fromISO(at).plus({ days: 35 }).toISO()!;
      const shifts = renderShifts(db, schedule.id, at, horizon);
      const current = shifts.find((s) => s.start <= at && s.end > at) ?? shifts[0];
      if (current && current.user_id === res.user_id) until = current.end;
    }
    return {
      schedule,
      user: res ? findUser(db, res.user_id) : null,
      source: res?.source ?? null,
      until,
    };
  });
}

export interface UpcomingShift {
  schedule_id: string;
  schedule_name: string;
  start: string;
  end: string;
}

/** A user's shifts (as final on-call) in the next `days` days, across all schedules. */
export function upcomingShiftsForUser(db: DB, userId: string, days = 14): UpcomingShift[] {
  const from = DateTime.utc();
  const to = from.plus({ days });
  const out: UpcomingShift[] = [];
  for (const schedule of listSchedules(db)) {
    const shifts = renderShifts(db, schedule.id, from.toISO()!, to.toISO()!);
    for (const s of shifts) {
      if (s.user_id === userId) {
        out.push({ schedule_id: schedule.id, schedule_name: schedule.name, start: s.start, end: s.end });
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export { layerHandoffAt };
