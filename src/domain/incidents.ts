import { DateTime } from 'luxon';
import { DB, uuid, nowIso, tx, nextCounter, DomainError, NotFoundError } from '../db/index.js';
import type { AppCtx } from '../context.js';
import { dispatchNotify } from '../context.js';
import type {
  EscalationPolicy,
  Incident,
  IncidentEvent,
  IncidentEventType,
  IncidentStatus,
  NotifyKind,
  Service,
  Urgency,
  User,
} from '../types.js';
import { findPolicy } from './escalation-policies.js';
import { getService } from './services.js';
import { onCallUserIds } from './schedules.js';
import { findUser } from './users.js';

export interface IncidentDetail extends Incident {
  service: Service;
  assignees: User[];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getIncident(db: DB, id: string): IncidentDetail {
  const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as Incident | undefined;
  if (!row) throw new NotFoundError('Incident');
  return hydrate(db, row);
}

export function findIncidentByNumber(db: DB, number: number): IncidentDetail | null {
  const row = db.prepare('SELECT * FROM incidents WHERE number = ?').get(number) as Incident | undefined;
  return row ? hydrate(db, row) : null;
}

function hydrate(db: DB, incident: Incident): IncidentDetail {
  const service = getService(db, incident.service_id);
  const assignees = db
    .prepare(
      `SELECT u.* FROM incident_assignments a JOIN users u ON u.id = a.user_id
       WHERE a.incident_id = ? ORDER BY u.name`
    )
    .all(incident.id) as unknown as User[];
  return { ...incident, service, assignees };
}

export interface ListIncidentsFilter {
  status?: IncidentStatus | 'open';
  service_id?: string;
  assigned_user_id?: string;
  limit?: number;
}

export function listIncidents(db: DB, filter: ListIncidentsFilter = {}): IncidentDetail[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filter.status === 'open') {
    clauses.push("i.status IN ('triggered', 'acknowledged')");
  } else if (filter.status) {
    clauses.push('i.status = ?');
    params.push(filter.status);
  }
  if (filter.service_id) {
    clauses.push('i.service_id = ?');
    params.push(filter.service_id);
  }
  if (filter.assigned_user_id) {
    clauses.push('EXISTS (SELECT 1 FROM incident_assignments a WHERE a.incident_id = i.id AND a.user_id = ?)');
    params.push(filter.assigned_user_id);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(500, Math.max(1, filter.limit ?? 100));
  const rows = db
    .prepare(`SELECT i.* FROM incidents i ${where} ORDER BY i.created_at DESC, i.number DESC LIMIT ${limit}`)
    .all(...params) as unknown as Incident[];
  return rows.map((r) => hydrate(db, r));
}

export function getTimeline(db: DB, incidentId: string): IncidentEvent[] {
  return db
    .prepare('SELECT * FROM incident_events WHERE incident_id = ? ORDER BY created_at, rowid')
    .all(incidentId) as unknown as IncidentEvent[];
}

export function incidentStats(db: DB): { triggered: number; acknowledged: number; resolved_today: number } {
  const count = (sql: string, ...params: string[]) =>
    (db.prepare(sql).get(...params) as { n: number }).n;
  const dayAgo = DateTime.utc().minus({ hours: 24 }).toISO();
  return {
    triggered: count("SELECT COUNT(*) n FROM incidents WHERE status = 'triggered'"),
    acknowledged: count("SELECT COUNT(*) n FROM incidents WHERE status = 'acknowledged'"),
    resolved_today: count("SELECT COUNT(*) n FROM incidents WHERE status = 'resolved' AND resolved_at > ?", dayAgo),
  };
}

// ---------------------------------------------------------------------------
// Timeline + assignment helpers
// ---------------------------------------------------------------------------

function addEvent(
  db: DB,
  incidentId: string,
  type: IncidentEventType,
  message: string | null,
  actorUserId: string | null = null
): void {
  db.prepare(
    'INSERT INTO incident_events (id, incident_id, type, actor_user_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuid(), incidentId, type, actorUserId, message, nowIso());
}

/** Resolve an escalation level's targets to concrete user ids (schedules -> current on-call). */
export function resolveLevelUserIds(db: DB, policy: EscalationPolicy, levelIndex: number): string[] {
  const level = policy.levels.find((l) => l.level_index === levelIndex);
  if (!level) return [];
  const ids = new Set<string>();
  for (const target of level.targets) {
    if (target.target_type === 'user') {
      ids.add(target.target_id);
    } else {
      for (const userId of onCallUserIds(db, target.target_id)) ids.add(userId);
    }
  }
  return [...ids];
}

/**
 * Starting at wantedLevel, find the first level that resolves to at least one user
 * (people can be missing when a schedule has nobody on call). Falls back to the
 * wanted level itself when every level is empty.
 */
function pickLevelWithUsers(
  db: DB,
  policy: EscalationPolicy,
  wantedLevel: number
): { level: number; userIds: string[] } {
  for (let level = wantedLevel; level <= policy.levels.length; level++) {
    const userIds = resolveLevelUserIds(db, policy, level);
    if (userIds.length) return { level, userIds };
  }
  return { level: wantedLevel, userIds: resolveLevelUserIds(db, policy, wantedLevel) };
}

function setAssignments(db: DB, incidentId: string, userIds: string[]): void {
  db.prepare('DELETE FROM incident_assignments WHERE incident_id = ?').run(incidentId);
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO incident_assignments (incident_id, user_id, assigned_at) VALUES (?, ?, ?)'
  );
  for (const userId of userIds) stmt.run(incidentId, userId, nowIso());
}

function levelTimeoutMinutes(policy: EscalationPolicy | null, levelIndex: number): number | null {
  const level = policy?.levels.find((l) => l.level_index === levelIndex);
  return level ? level.timeout_minutes : null;
}

/** Escalation only ticks for open, unacknowledged, high-urgency incidents with a policy. */
function computeNextEscalation(incident: Pick<Incident, 'status' | 'urgency'>, policy: EscalationPolicy | null, levelIndex: number): string | null {
  if (!policy || incident.status !== 'triggered' || incident.urgency !== 'high') return null;
  const timeout = levelTimeoutMinutes(policy, levelIndex);
  if (timeout === null) return null;
  return DateTime.utc().plus({ minutes: timeout }).toISO();
}

function notify(ctx: AppCtx, incidentId: string, kind: NotifyKind, summary: string, actorId?: string | null, note?: string): void {
  const detail = getIncident(ctx.db, incidentId);
  dispatchNotify(ctx, {
    kind,
    incident: detail,
    assignees: detail.assignees,
    service: detail.service,
    summary,
    actor: actorId ? findUser(ctx.db, actorId) : null,
    note,
  });
}

function actorName(db: DB, actorUserId: string | null | undefined): string {
  if (!actorUserId) return 'system';
  return findUser(db, actorUserId)?.name ?? 'someone';
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export interface TriggerInput {
  service_id: string;
  title: string;
  description?: string | null;
  urgency?: Urgency;
  source?: string | null;
  dedup_key?: string | null;
  actor_user_id?: string | null;
}

/**
 * Create (or dedup into) an incident. If an open incident with the same dedup key
 * exists on the service, the alert is folded into it instead of opening a new one.
 */
export function triggerIncident(ctx: AppCtx, input: TriggerInput): IncidentDetail {
  const { db } = ctx;
  const title = input.title?.trim();
  if (!title) throw new DomainError('Incident title is required');
  const service = getService(db, input.service_id);

  if (input.dedup_key) {
    const existing = db
      .prepare(
        `SELECT * FROM incidents WHERE service_id = ? AND dedup_key = ? AND status != 'resolved'`
      )
      .get(input.service_id, input.dedup_key) as Incident | undefined;
    if (existing) {
      db.prepare('UPDATE incidents SET alert_count = alert_count + 1 WHERE id = ?').run(existing.id);
      addEvent(db, existing.id, 'alert', `Repeat alert received: ${title}`);
      // Refresh Slack messages so the alert counter stays current. The notifier
      // never re-pages users it has already DMed, so this cannot double-page.
      notify(ctx, existing.id, 'triggered', 'Repeat alert folded into incident');
      return getIncident(db, existing.id);
    }
  }

  const urgency: Urgency = input.urgency === 'low' ? 'low' : input.urgency === 'high' ? 'high' : service.default_urgency;
  const policy = service.escalation_policy_id ? findPolicy(db, service.escalation_policy_id) : null;

  const id = uuid();
  const incident = tx(db, () => {
    const number = nextCounter(db, 'incident_number');
    let level = 1;
    let userIds: string[] = [];
    if (policy) {
      ({ level, userIds } = pickLevelWithUsers(db, policy, 1));
    }
    db.prepare(
      `INSERT INTO incidents
         (id, number, service_id, title, description, urgency, status, source, dedup_key, alert_count,
          escalation_policy_id, escalation_level, escalation_repeats_done, next_escalation_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'triggered', ?, ?, 1, ?, ?, 0, ?, ?)`
    ).run(
      id,
      number,
      input.service_id,
      title,
      input.description?.trim() || null,
      urgency,
      input.source?.trim() || null,
      input.dedup_key || null,
      policy?.id ?? null,
      level,
      computeNextEscalation({ status: 'triggered', urgency }, policy, level),
      nowIso()
    );
    addEvent(db, id, 'triggered', `Incident triggered${input.source ? ` via ${input.source}` : ''}`, input.actor_user_id ?? null);
    if (userIds.length) {
      setAssignments(db, id, userIds);
      addEvent(db, id, 'assigned', `Assigned to ${describeUsers(db, userIds)} (level ${level})`);
    }
    return getIncident(db, id);
  });

  notify(ctx, id, 'triggered', `Incident #${incident.number} triggered`, input.actor_user_id);
  return incident;
}

function describeUsers(db: DB, userIds: string[]): string {
  return userIds.map((uid) => findUser(db, uid)?.name ?? uid).join(', ');
}

export function acknowledgeIncident(ctx: AppCtx, id: string, actorUserId?: string | null): IncidentDetail {
  const { db } = ctx;
  const incident = getIncident(db, id);
  if (incident.status === 'resolved') throw new DomainError(`Incident #${incident.number} is already resolved`);
  if (incident.status === 'acknowledged') throw new DomainError(`Incident #${incident.number} is already acknowledged`);
  db.prepare(
    `UPDATE incidents SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ?, next_escalation_at = NULL
     WHERE id = ?`
  ).run(nowIso(), actorUserId ?? null, id);
  addEvent(db, id, 'acknowledged', `Acknowledged by ${actorName(db, actorUserId)}`, actorUserId ?? null);
  notify(ctx, id, 'acknowledged', `Acknowledged by ${actorName(db, actorUserId)}`, actorUserId);
  return getIncident(db, id);
}

export function resolveIncident(ctx: AppCtx, id: string, actorUserId?: string | null): IncidentDetail {
  const { db } = ctx;
  const incident = getIncident(db, id);
  if (incident.status === 'resolved') throw new DomainError(`Incident #${incident.number} is already resolved`);
  db.prepare(
    `UPDATE incidents SET status = 'resolved', resolved_at = ?, resolved_by = ?, next_escalation_at = NULL
     WHERE id = ?`
  ).run(nowIso(), actorUserId ?? null, id);
  addEvent(db, id, 'resolved', `Resolved by ${actorName(db, actorUserId)}`, actorUserId ?? null);
  notify(ctx, id, 'resolved', `Resolved by ${actorName(db, actorUserId)}`, actorUserId);
  return getIncident(db, id);
}

export interface EscalateOptions {
  actor_user_id?: string | null;
  /** True when triggered by the escalation engine rather than a person. */
  auto?: boolean;
}

/**
 * Move an incident to the next escalation level (wrapping while the policy still
 * has repeats left). Escalating re-pages: status returns to 'triggered'.
 */
export function escalateIncident(ctx: AppCtx, id: string, opts: EscalateOptions = {}): IncidentDetail {
  const { db } = ctx;
  const incident = getIncident(db, id);
  if (incident.status === 'resolved') throw new DomainError(`Incident #${incident.number} is already resolved`);
  const policy = incident.escalation_policy_id ? findPolicy(db, incident.escalation_policy_id) : null;
  if (!policy || !policy.levels.length) {
    throw new DomainError(`Incident #${incident.number} has no escalation policy to escalate through`);
  }

  let nextLevel = incident.escalation_level + 1;
  let repeatsDone = incident.escalation_repeats_done;
  if (nextLevel > policy.levels.length) {
    if (repeatsDone < policy.repeat_count) {
      repeatsDone += 1;
      nextLevel = 1;
    } else if (opts.auto) {
      db.prepare('UPDATE incidents SET next_escalation_at = NULL WHERE id = ?').run(id);
      addEvent(db, id, 'escalation_exhausted', 'Escalation policy exhausted with no acknowledgement');
      return getIncident(db, id);
    } else {
      throw new DomainError(`Incident #${incident.number} is already at the final escalation level`);
    }
  }

  const picked = pickLevelWithUsers(db, policy, nextLevel);
  tx(db, () => {
    db.prepare(
      `UPDATE incidents SET status = 'triggered', acknowledged_at = NULL, acknowledged_by = NULL,
         escalation_level = ?, escalation_repeats_done = ?, next_escalation_at = ?
       WHERE id = ?`
    ).run(
      picked.level,
      repeatsDone,
      computeNextEscalation({ status: 'triggered', urgency: incident.urgency }, policy, picked.level),
      id
    );
    setAssignments(db, id, picked.userIds);
    const how = opts.auto ? 'automatically (no acknowledgement in time)' : `by ${actorName(db, opts.actor_user_id)}`;
    addEvent(db, id, 'escalated', `Escalated to level ${picked.level} ${how}`, opts.actor_user_id ?? null);
    if (picked.userIds.length) {
      addEvent(db, id, 'assigned', `Assigned to ${describeUsers(db, picked.userIds)} (level ${picked.level})`);
    }
  });

  notify(ctx, id, 'escalated', `Escalated to level ${picked.level}`, opts.actor_user_id);
  return getIncident(db, id);
}

/** Hand the incident to a specific person. Re-pages them and restarts the current level's timer. */
export function reassignIncident(ctx: AppCtx, id: string, userId: string, actorUserId?: string | null): IncidentDetail {
  const { db } = ctx;
  const incident = getIncident(db, id);
  if (incident.status === 'resolved') throw new DomainError(`Incident #${incident.number} is already resolved`);
  const user = findUser(db, userId);
  if (!user) throw new DomainError('Assignee does not exist');
  const policy = incident.escalation_policy_id ? findPolicy(db, incident.escalation_policy_id) : null;
  tx(db, () => {
    db.prepare(
      `UPDATE incidents SET status = 'triggered', acknowledged_at = NULL, acknowledged_by = NULL, next_escalation_at = ?
       WHERE id = ?`
    ).run(
      computeNextEscalation({ status: 'triggered', urgency: incident.urgency }, policy, incident.escalation_level),
      id
    );
    setAssignments(db, id, [userId]);
    addEvent(db, id, 'assigned', `Reassigned to ${user.name} by ${actorName(db, actorUserId)}`, actorUserId ?? null);
  });
  notify(ctx, id, 'reassigned', `Reassigned to ${user.name}`, actorUserId);
  return getIncident(db, id);
}

export function addNote(ctx: AppCtx, id: string, content: string, actorUserId?: string | null): IncidentDetail {
  const { db } = ctx;
  const incident = getIncident(db, id);
  const text = content?.trim();
  if (!text) throw new DomainError('Note content is required');
  addEvent(db, id, 'note', text, actorUserId ?? null);
  notify(ctx, id, 'note', `Note added by ${actorName(db, actorUserId)}`, actorUserId, text);
  return getIncident(db, incident.id);
}

// ---------------------------------------------------------------------------
// Escalation engine hook
// ---------------------------------------------------------------------------

/** Find incidents whose escalation timer has expired and escalate each. Returns how many moved. */
export function sweepEscalations(ctx: AppCtx, nowIsoTs: string = nowIso()): number {
  const due = ctx.db
    .prepare(
      `SELECT id FROM incidents
       WHERE status = 'triggered' AND next_escalation_at IS NOT NULL AND next_escalation_at <= ?`
    )
    .all(nowIsoTs) as unknown as { id: string }[];
  let moved = 0;
  for (const row of due) {
    try {
      escalateIncident(ctx, row.id, { auto: true });
      moved++;
    } catch (err) {
      console.error(`[escalation] failed to escalate incident ${row.id}:`, err);
    }
  }
  return moved;
}
