import { DateTime, IANAZone } from 'luxon';
import { DB, uuid, nowIso, tx, DomainError, NotFoundError } from '../db/index.js';
import type {
  OnCallResult,
  RenderedShift,
  RotationType,
  Schedule,
  ScheduleLayer,
  ScheduleOverride,
} from '../types.js';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface LayerInput {
  name?: string;
  position?: number;
  rotation_type: RotationType;
  /** Required for rotation_type 'custom'; hours per shift. */
  shift_length_hours?: number | null;
  /** HH:mm local to the schedule timezone. Default 09:00. */
  handoff_time?: string;
  /** YYYY-MM-DD local date the rotation starts (user_ids[0] takes the first shift). */
  anchor_date: string;
  restriction_start?: string | null;
  restriction_end?: string | null;
  /** Rotation order. */
  user_ids: string[];
}

export interface CreateScheduleInput {
  name: string;
  description?: string | null;
  timezone?: string;
  layers: LayerInput[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function validateLayer(db: DB, layer: LayerInput): void {
  if (!layer.user_ids?.length) throw new DomainError('A schedule layer needs at least one user');
  for (const userId of layer.user_ids) {
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) {
      throw new DomainError(`Layer user ${userId} does not exist`);
    }
  }
  if (!['daily', 'weekly', 'custom'].includes(layer.rotation_type)) {
    throw new DomainError(`Invalid rotation type: ${layer.rotation_type}`);
  }
  if (layer.rotation_type === 'custom') {
    const len = layer.shift_length_hours;
    if (!len || !Number.isFinite(len) || len < 1 || len > 24 * 28) {
      throw new DomainError('Custom rotations need shift_length_hours between 1 and 672');
    }
  }
  if (layer.handoff_time && !HHMM.test(layer.handoff_time)) {
    throw new DomainError('handoff_time must be HH:mm (24h)');
  }
  if (!YMD.test(layer.anchor_date)) throw new DomainError('anchor_date must be YYYY-MM-DD');
  for (const r of [layer.restriction_start, layer.restriction_end]) {
    if (r && !HHMM.test(r)) throw new DomainError('Restriction times must be HH:mm (24h)');
  }
  if (Boolean(layer.restriction_start) !== Boolean(layer.restriction_end)) {
    throw new DomainError('Restrictions need both a start and an end time');
  }
}

function insertLayers(db: DB, scheduleId: string, layers: LayerInput[]): void {
  layers.forEach((layer, i) => {
    validateLayer(db, layer);
    const layerId = uuid();
    db.prepare(
      `INSERT INTO schedule_layers
         (id, schedule_id, name, position, rotation_type, shift_length_hours, handoff_time,
          anchor_date, restriction_start, restriction_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      layerId,
      scheduleId,
      layer.name?.trim() || `Layer ${i + 1}`,
      layer.position ?? i + 1,
      layer.rotation_type,
      layer.rotation_type === 'custom' ? layer.shift_length_hours ?? null : null,
      layer.handoff_time || '09:00',
      layer.anchor_date,
      layer.restriction_start || null,
      layer.restriction_end || null
    );
    layer.user_ids.forEach((userId, pos) => {
      db.prepare('INSERT INTO schedule_layer_users (layer_id, user_id, position) VALUES (?, ?, ?)').run(
        layerId,
        userId,
        pos
      );
    });
  });
}

export function createSchedule(db: DB, input: CreateScheduleInput): Schedule {
  const name = input.name?.trim();
  if (!name) throw new DomainError('Schedule name is required');
  const timezone = input.timezone || 'UTC';
  if (!IANAZone.isValidZone(timezone)) throw new DomainError(`Invalid timezone: ${timezone}`);
  if (!input.layers?.length) throw new DomainError('A schedule needs at least one layer');
  const id = uuid();
  tx(db, () => {
    db.prepare(
      'INSERT INTO schedules (id, name, description, timezone, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name, input.description?.trim() || null, timezone, nowIso());
    insertLayers(db, id, input.layers);
  });
  return getSchedule(db, id);
}

export function getSchedule(db: DB, id: string): Schedule {
  const schedule = findSchedule(db, id);
  if (!schedule) throw new NotFoundError('Schedule');
  return schedule;
}

export function findSchedule(db: DB, id: string): Schedule | null {
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as
    | Omit<Schedule, 'layers'>
    | undefined;
  if (!row) return null;
  return { ...row, layers: getLayers(db, id) };
}

export function findScheduleByName(db: DB, name: string): Schedule | null {
  const row = db.prepare('SELECT * FROM schedules WHERE name = ? COLLATE NOCASE').get(name) as
    | Omit<Schedule, 'layers'>
    | undefined;
  return row ? { ...row, layers: getLayers(db, row.id) } : null;
}

function getLayers(db: DB, scheduleId: string): ScheduleLayer[] {
  const layers = db
    .prepare('SELECT * FROM schedule_layers WHERE schedule_id = ? ORDER BY position')
    .all(scheduleId) as unknown as (Omit<ScheduleLayer, 'user_ids'> & { user_ids?: string[] })[];
  const usersStmt = db.prepare(
    'SELECT user_id FROM schedule_layer_users WHERE layer_id = ? ORDER BY position'
  );
  return layers.map((l) => ({
    ...l,
    user_ids: (usersStmt.all(l.id) as unknown as { user_id: string }[]).map((r) => r.user_id),
  }));
}

export function listSchedules(db: DB): Schedule[] {
  const rows = db
    .prepare('SELECT * FROM schedules ORDER BY name COLLATE NOCASE')
    .all() as unknown as Omit<Schedule, 'layers'>[];
  return rows.map((r) => ({ ...r, layers: getLayers(db, r.id) }));
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string | null;
  timezone?: string;
  layers?: LayerInput[];
}

export function updateSchedule(db: DB, id: string, patch: UpdateScheduleInput): Schedule {
  const existing = getSchedule(db, id);
  if (patch.timezone && !IANAZone.isValidZone(patch.timezone)) {
    throw new DomainError(`Invalid timezone: ${patch.timezone}`);
  }
  tx(db, () => {
    db.prepare('UPDATE schedules SET name = ?, description = ?, timezone = ? WHERE id = ?').run(
      patch.name?.trim() || existing.name,
      patch.description !== undefined ? patch.description?.trim() || null : existing.description,
      patch.timezone || existing.timezone,
      id
    );
    if (patch.layers) {
      if (!patch.layers.length) throw new DomainError('A schedule needs at least one layer');
      db.prepare('DELETE FROM schedule_layers WHERE schedule_id = ?').run(id);
      insertLayers(db, id, patch.layers);
    }
  });
  return getSchedule(db, id);
}

export function deleteSchedule(db: DB, id: string): void {
  getSchedule(db, id);
  const used = db
    .prepare("SELECT 1 FROM escalation_targets WHERE target_type = 'schedule' AND target_id = ?")
    .get(id);
  if (used) throw new DomainError('Schedule is used by an escalation policy; remove it there first');
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

export function createOverride(
  db: DB,
  input: { schedule_id: string; user_id: string; start_at: string; end_at: string }
): ScheduleOverride {
  getSchedule(db, input.schedule_id);
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(input.user_id)) {
    throw new DomainError('Override user does not exist');
  }
  const start = DateTime.fromISO(input.start_at);
  const end = DateTime.fromISO(input.end_at);
  if (!start.isValid || !end.isValid) throw new DomainError('Override start/end must be ISO datetimes');
  if (end <= start) throw new DomainError('Override end must be after start');
  const id = uuid();
  db.prepare(
    'INSERT INTO schedule_overrides (id, schedule_id, user_id, start_at, end_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, input.schedule_id, input.user_id, start.toUTC().toISO(), end.toUTC().toISO(), nowIso());
  return db.prepare('SELECT * FROM schedule_overrides WHERE id = ?').get(id) as unknown as ScheduleOverride;
}

export function listOverrides(db: DB, scheduleId: string, includePast = false): ScheduleOverride[] {
  if (includePast) {
    return db
      .prepare('SELECT * FROM schedule_overrides WHERE schedule_id = ? ORDER BY start_at')
      .all(scheduleId) as unknown as ScheduleOverride[];
  }
  return db
    .prepare('SELECT * FROM schedule_overrides WHERE schedule_id = ? AND end_at > ? ORDER BY start_at')
    .all(scheduleId, nowIso()) as unknown as ScheduleOverride[];
}

export function deleteOverride(db: DB, overrideId: string): void {
  const res = db.prepare('DELETE FROM schedule_overrides WHERE id = ?').run(overrideId);
  if (res.changes === 0) throw new NotFoundError('Override');
}

// ---------------------------------------------------------------------------
// Rotation math
// ---------------------------------------------------------------------------

function nominalShiftHours(layer: Pick<ScheduleLayer, 'rotation_type' | 'shift_length_hours'>): number {
  switch (layer.rotation_type) {
    case 'daily':
      return 24;
    case 'weekly':
      return 24 * 7;
    case 'custom':
      return layer.shift_length_hours ?? 24;
  }
}

/** The instant handoff number k happens (k=0 is the rotation anchor). Calendar-aware for daily/weekly. */
export function layerHandoffAt(layer: ScheduleLayer, zone: string, k: number): DateTime {
  const anchor = DateTime.fromISO(`${layer.anchor_date}T${layer.handoff_time}`, { zone });
  switch (layer.rotation_type) {
    case 'daily':
      return anchor.plus({ days: k });
    case 'weekly':
      return anchor.plus({ weeks: k });
    case 'custom':
      return anchor.plus({ hours: k * (layer.shift_length_hours ?? 24) });
  }
}

/** Index of the shift active at t (i.e. largest k with handoffAt(k) <= t), or null before the anchor. */
function shiftIndexAt(layer: ScheduleLayer, zone: string, t: DateTime): number | null {
  const anchor = layerHandoffAt(layer, zone, 0);
  if (t < anchor) return null;
  // Estimate from elapsed hours, then correct for DST wobble.
  let k = Math.floor(t.diff(anchor, 'hours').hours / nominalShiftHours(layer));
  if (k < 0) k = 0;
  while (layerHandoffAt(layer, zone, k + 1) <= t) k++;
  while (k > 0 && layerHandoffAt(layer, zone, k) > t) k--;
  return k;
}

function inRestriction(layer: ScheduleLayer, local: DateTime): boolean {
  if (!layer.restriction_start || !layer.restriction_end) return true;
  const minutes = local.hour * 60 + local.minute;
  const [sh = 0, sm = 0] = layer.restriction_start.split(':').map(Number);
  const [eh = 0, em = 0] = layer.restriction_end.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s === e) return true; // degenerate window = always on
  if (s < e) return minutes >= s && minutes < e;
  return minutes >= s || minutes < e; // overnight window, e.g. 22:00 -> 06:00
}

/** Who a single layer puts on call at instant t, or null (not started / outside restriction / empty). */
export function layerOnCallAt(layer: ScheduleLayer, zone: string, t: DateTime): string | null {
  if (!layer.user_ids.length) return null;
  const local = t.setZone(zone);
  if (!inRestriction(layer, local)) return null;
  const k = shiftIndexAt(layer, zone, local);
  if (k === null) return null;
  return layer.user_ids[k % layer.user_ids.length] ?? null;
}

/** Resolve who is on call for a schedule at an instant. Overrides win, then layers by position (desc). */
export function onCallAt(db: DB, scheduleId: string, atIso?: string): OnCallResult | null {
  const schedule = getSchedule(db, scheduleId);
  const t = atIso ? DateTime.fromISO(atIso, { setZone: true }) : DateTime.utc();
  if (!t.isValid) throw new DomainError('Invalid timestamp');
  const iso = t.toUTC().toISO()!;

  const override = db
    .prepare(
      `SELECT * FROM schedule_overrides
       WHERE schedule_id = ? AND start_at <= ? AND end_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(scheduleId, iso, iso) as ScheduleOverride | undefined;
  if (override) {
    return { user_id: override.user_id, source: 'override', layer_id: null, override_id: override.id };
  }

  const layers = [...schedule.layers].sort((a, b) => b.position - a.position);
  for (const layer of layers) {
    const userId = layerOnCallAt(layer, schedule.timezone, t);
    if (userId) return { user_id: userId, source: 'layer', layer_id: layer.id, override_id: null };
  }
  return null;
}

/** Current on-call user ids for a schedule (0 or 1 today, but typed as a list for future flexibility). */
export function onCallUserIds(db: DB, scheduleId: string, atIso?: string): string[] {
  const result = onCallAt(db, scheduleId, atIso);
  return result ? [result.user_id] : [];
}

/**
 * Render the effective shifts for a window [from, to) by evaluating on-call at every
 * boundary instant (handoffs, restriction edges, override edges) and merging runs.
 */
export function renderShifts(db: DB, scheduleId: string, fromIso: string, toIso: string): RenderedShift[] {
  const schedule = getSchedule(db, scheduleId);
  const from = DateTime.fromISO(fromIso).toUTC();
  const to = DateTime.fromISO(toIso).toUTC();
  if (!from.isValid || !to.isValid || to <= from) throw new DomainError('Invalid render window');
  if (to.diff(from, 'days').days > 62) throw new DomainError('Render window is limited to 62 days');

  const boundaries = new Set<number>([from.toMillis(), to.toMillis()]);

  for (const layer of schedule.layers) {
    // Handoff instants inside the window.
    const first = shiftIndexAt(layer, schedule.timezone, from);
    let k = first === null ? 0 : first;
    for (let guard = 0; guard < 5000; guard++) {
      const h = layerHandoffAt(layer, schedule.timezone, k);
      if (h > to) break;
      if (h >= from) boundaries.add(h.toMillis());
      k++;
    }
    // Restriction edges occur (up to) daily.
    if (layer.restriction_start && layer.restriction_end) {
      let day = from.setZone(schedule.timezone).startOf('day').minus({ days: 1 });
      const endDay = to.setZone(schedule.timezone).startOf('day').plus({ days: 1 });
      while (day <= endDay) {
        for (const hhmm of [layer.restriction_start, layer.restriction_end]) {
          const [h = 0, m = 0] = hhmm.split(':').map(Number);
          const edge = day.set({ hour: h, minute: m });
          if (edge >= from && edge <= to) boundaries.add(edge.toMillis());
        }
        day = day.plus({ days: 1 });
      }
    }
  }

  const overrides = db
    .prepare('SELECT * FROM schedule_overrides WHERE schedule_id = ? AND end_at > ? AND start_at < ?')
    .all(scheduleId, from.toISO(), to.toISO()) as unknown as ScheduleOverride[];
  for (const o of overrides) {
    for (const edge of [DateTime.fromISO(o.start_at), DateTime.fromISO(o.end_at)]) {
      if (edge >= from && edge <= to) boundaries.add(edge.toMillis());
    }
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const shifts: RenderedShift[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = DateTime.fromMillis(sorted[i]!, { zone: 'utc' });
    const segEnd = DateTime.fromMillis(sorted[i + 1]!, { zone: 'utc' });
    const res = onCallAt(db, scheduleId, segStart.toISO()!);
    if (!res) continue;
    const prev = shifts[shifts.length - 1];
    if (prev && prev.user_id === res.user_id && prev.source === res.source && prev.end === segStart.toISO()) {
      prev.end = segEnd.toISO()!;
    } else {
      shifts.push({ user_id: res.user_id, start: segStart.toISO()!, end: segEnd.toISO()!, source: res.source });
    }
  }
  return shifts;
}
