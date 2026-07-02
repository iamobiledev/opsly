import { DB, uuid, nowIso, DomainError, NotFoundError } from '../db/index.js';
import type { Role, User } from '../types.js';

export interface CreateUserInput {
  name: string;
  email?: string | null;
  role?: Role;
  timezone?: string;
  slack_user_id?: string | null;
}

export function createUser(db: DB, input: CreateUserInput): User {
  const name = input.name?.trim();
  if (!name) throw new DomainError('User name is required');
  const id = uuid();
  db.prepare(
    `INSERT INTO users (id, name, email, role, timezone, slack_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    input.email?.trim() || null,
    input.role === 'admin' ? 'admin' : 'responder',
    input.timezone || 'UTC',
    input.slack_user_id || null,
    nowIso()
  );
  return getUser(db, id);
}

export function getUser(db: DB, id: string): User {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  if (!row) throw new NotFoundError('User');
  return row;
}

export function findUser(db: DB, id: string): User | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
}

export function findUserBySlackId(db: DB, slackUserId: string): User | null {
  return (
    (db.prepare('SELECT * FROM users WHERE slack_user_id = ?').get(slackUserId) as User | undefined) ??
    null
  );
}

export function findUserByEmail(db: DB, email: string): User | null {
  return (
    (db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as User | undefined) ??
    null
  );
}

export function listUsers(db: DB): User[] {
  return db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all() as unknown as User[];
}

export function updateUser(db: DB, id: string, patch: Partial<CreateUserInput>): User {
  const existing = getUser(db, id);
  const next = {
    name: patch.name?.trim() || existing.name,
    email: patch.email !== undefined ? patch.email?.trim() || null : existing.email,
    role: patch.role !== undefined ? (patch.role === 'admin' ? 'admin' : 'responder') : existing.role,
    timezone: patch.timezone || existing.timezone,
    slack_user_id:
      patch.slack_user_id !== undefined ? patch.slack_user_id || null : existing.slack_user_id,
  };
  db.prepare(
    'UPDATE users SET name = ?, email = ?, role = ?, timezone = ?, slack_user_id = ? WHERE id = ?'
  ).run(next.name, next.email, next.role, next.timezone, next.slack_user_id, id);
  return getUser(db, id);
}

export function deleteUser(db: DB, id: string): void {
  getUser(db, id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

/**
 * Find-or-create a user from a Slack identity. Matches by slack_user_id first,
 * then by email (linking the Slack ID onto the existing record).
 */
export function upsertUserFromSlack(
  db: DB,
  input: { slack_user_id: string; name: string; email?: string | null; timezone?: string | null }
): User {
  const bySlack = findUserBySlackId(db, input.slack_user_id);
  if (bySlack) return bySlack;
  if (input.email) {
    const byEmail = findUserByEmail(db, input.email);
    if (byEmail) {
      return updateUser(db, byEmail.id, { slack_user_id: input.slack_user_id });
    }
  }
  return createUser(db, {
    name: input.name,
    email: input.email ?? null,
    timezone: input.timezone ?? 'UTC',
    slack_user_id: input.slack_user_id,
  });
}
