import { DB, uuid, nowIso, tx, DomainError, NotFoundError } from '../db/index.js';
import type { EscalationLevel, EscalationPolicy, EscalationTarget, TargetType } from '../types.js';

export interface LevelInput {
  timeout_minutes?: number;
  targets: { target_type: TargetType; target_id: string }[];
}

export interface CreatePolicyInput {
  name: string;
  description?: string | null;
  repeat_count?: number;
  levels: LevelInput[];
}

export function createPolicy(db: DB, input: CreatePolicyInput): EscalationPolicy {
  const name = input.name?.trim();
  if (!name) throw new DomainError('Policy name is required');
  if (!input.levels?.length) throw new DomainError('At least one escalation level is required');
  for (const level of input.levels) {
    if (!level.targets?.length) throw new DomainError('Each escalation level needs at least one target');
  }
  const id = uuid();
  tx(db, () => {
    db.prepare(
      'INSERT INTO escalation_policies (id, name, description, repeat_count, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name, input.description?.trim() || null, clampRepeat(input.repeat_count), nowIso());
    insertLevels(db, id, input.levels);
  });
  return getPolicy(db, id);
}

function clampRepeat(n: number | undefined): number {
  const v = Number.isFinite(n) ? Math.floor(n as number) : 0;
  return Math.min(9, Math.max(0, v));
}

function insertLevels(db: DB, policyId: string, levels: LevelInput[]): void {
  levels.forEach((level, i) => {
    const levelId = uuid();
    const timeout = Number.isFinite(level.timeout_minutes)
      ? Math.max(1, Math.floor(level.timeout_minutes as number))
      : 30;
    db.prepare(
      'INSERT INTO escalation_levels (id, policy_id, level_index, timeout_minutes) VALUES (?, ?, ?, ?)'
    ).run(levelId, policyId, i + 1, timeout);
    for (const t of level.targets) {
      if (t.target_type !== 'user' && t.target_type !== 'schedule') {
        throw new DomainError(`Invalid target type: ${t.target_type}`);
      }
      const exists =
        t.target_type === 'user'
          ? db.prepare('SELECT 1 FROM users WHERE id = ?').get(t.target_id)
          : db.prepare('SELECT 1 FROM schedules WHERE id = ?').get(t.target_id);
      if (!exists) throw new DomainError(`Escalation target ${t.target_type} ${t.target_id} does not exist`);
      db.prepare(
        'INSERT INTO escalation_targets (id, level_id, target_type, target_id) VALUES (?, ?, ?, ?)'
      ).run(uuid(), levelId, t.target_type, t.target_id);
    }
  });
}

export function getPolicy(db: DB, id: string): EscalationPolicy {
  const policy = findPolicy(db, id);
  if (!policy) throw new NotFoundError('Escalation policy');
  return policy;
}

export function findPolicy(db: DB, id: string): EscalationPolicy | null {
  const row = db.prepare('SELECT * FROM escalation_policies WHERE id = ?').get(id) as
    | Omit<EscalationPolicy, 'levels'>
    | undefined;
  if (!row) return null;
  return { ...row, levels: getLevels(db, id) };
}

export function findPolicyByName(db: DB, name: string): EscalationPolicy | null {
  const row = db
    .prepare('SELECT * FROM escalation_policies WHERE name = ? COLLATE NOCASE')
    .get(name) as Omit<EscalationPolicy, 'levels'> | undefined;
  return row ? { ...row, levels: getLevels(db, row.id) } : null;
}

function getLevels(db: DB, policyId: string): EscalationLevel[] {
  const levels = db
    .prepare('SELECT * FROM escalation_levels WHERE policy_id = ? ORDER BY level_index')
    .all(policyId) as unknown as (EscalationLevel & { targets?: EscalationTarget[] })[];
  const stmt = db.prepare('SELECT * FROM escalation_targets WHERE level_id = ?');
  return levels.map((l) => ({ ...l, targets: stmt.all(l.id) as unknown as EscalationTarget[] }));
}

export function listPolicies(db: DB): EscalationPolicy[] {
  const rows = db
    .prepare('SELECT * FROM escalation_policies ORDER BY name COLLATE NOCASE')
    .all() as unknown as Omit<EscalationPolicy, 'levels'>[];
  return rows.map((r) => ({ ...r, levels: getLevels(db, r.id) }));
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string | null;
  repeat_count?: number;
  levels?: LevelInput[];
}

export function updatePolicy(db: DB, id: string, patch: UpdatePolicyInput): EscalationPolicy {
  const existing = getPolicy(db, id);
  tx(db, () => {
    db.prepare('UPDATE escalation_policies SET name = ?, description = ?, repeat_count = ? WHERE id = ?').run(
      patch.name?.trim() || existing.name,
      patch.description !== undefined ? patch.description?.trim() || null : existing.description,
      patch.repeat_count !== undefined ? clampRepeat(patch.repeat_count) : existing.repeat_count,
      id
    );
    if (patch.levels) {
      if (!patch.levels.length) throw new DomainError('At least one escalation level is required');
      for (const level of patch.levels) {
        if (!level.targets?.length) throw new DomainError('Each escalation level needs at least one target');
      }
      db.prepare('DELETE FROM escalation_levels WHERE policy_id = ?').run(id);
      insertLevels(db, id, patch.levels);
    }
  });
  return getPolicy(db, id);
}

export function deletePolicy(db: DB, id: string): void {
  getPolicy(db, id);
  const inUse = db.prepare('SELECT name FROM services WHERE escalation_policy_id = ?').get(id) as
    | { name: string }
    | undefined;
  if (inUse) throw new DomainError(`Policy is used by service "${inUse.name}"; reassign it first`);
  db.prepare('DELETE FROM escalation_policies WHERE id = ?').run(id);
}
