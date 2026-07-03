import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { SCHEMA_SQL } from './schema.js';

export type DB = DatabaseSync;

export function createDb(path: string): DB {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  return db;
}

export function uuid(): string {
  return randomUUID();
}

export function routingKey(): string {
  return 'rk_' + randomBytes(16).toString('hex');
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Run fn inside a transaction; rolls back on throw. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Atomically increment and return a named counter (used for incident numbers). */
export function nextCounter(db: DB, name: string): number {
  db.prepare('INSERT INTO counters (name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING').run(name);
  const row = db
    .prepare('UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value')
    .get(name) as { value: number };
  return row.value;
}

/** Domain error with an HTTP-ish status for the API layer. */
export class DomainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(`${what} not found`, 404);
    this.name = 'NotFoundError';
  }
}
