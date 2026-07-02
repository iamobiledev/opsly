import { DB, uuid, nowIso, routingKey, tx, DomainError, NotFoundError } from '../db/index.js';
import type { Service, ServiceIntegration, Urgency } from '../types.js';

export interface CreateServiceInput {
  name: string;
  description?: string | null;
  escalation_policy_id?: string | null;
  slack_channel_id?: string | null;
  default_urgency?: Urgency;
}

export function createService(db: DB, input: CreateServiceInput): Service {
  const name = input.name?.trim();
  if (!name) throw new DomainError('Service name is required');
  if (input.escalation_policy_id) {
    if (!db.prepare('SELECT 1 FROM escalation_policies WHERE id = ?').get(input.escalation_policy_id)) {
      throw new DomainError('Escalation policy does not exist');
    }
  }
  const id = uuid();
  tx(db, () => {
    db.prepare(
      `INSERT INTO services (id, name, description, escalation_policy_id, slack_channel_id, default_urgency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      input.description?.trim() || null,
      input.escalation_policy_id || null,
      input.slack_channel_id || null,
      input.default_urgency === 'low' ? 'low' : 'high',
      nowIso()
    );
    // Every service gets a default integration so it can receive events immediately.
    db.prepare(
      'INSERT INTO service_integrations (id, service_id, name, routing_key, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(uuid(), id, 'Default (Events API)', routingKey(), nowIso());
  });
  return getService(db, id);
}

export function getService(db: DB, id: string): Service {
  const row = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service | undefined;
  if (!row) throw new NotFoundError('Service');
  return row;
}

export function findService(db: DB, id: string): Service | null {
  return (db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service | undefined) ?? null;
}

export function findServiceByName(db: DB, name: string): Service | null {
  return (
    (db.prepare('SELECT * FROM services WHERE name = ? COLLATE NOCASE').get(name) as Service | undefined) ??
    null
  );
}

export function listServices(db: DB): Service[] {
  return db.prepare('SELECT * FROM services ORDER BY name COLLATE NOCASE').all() as unknown as Service[];
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  escalation_policy_id?: string | null;
  slack_channel_id?: string | null;
  default_urgency?: Urgency;
}

export function updateService(db: DB, id: string, patch: UpdateServiceInput): Service {
  const existing = getService(db, id);
  if (patch.escalation_policy_id) {
    if (!db.prepare('SELECT 1 FROM escalation_policies WHERE id = ?').get(patch.escalation_policy_id)) {
      throw new DomainError('Escalation policy does not exist');
    }
  }
  db.prepare(
    `UPDATE services SET name = ?, description = ?, escalation_policy_id = ?, slack_channel_id = ?, default_urgency = ?
     WHERE id = ?`
  ).run(
    patch.name?.trim() || existing.name,
    patch.description !== undefined ? patch.description?.trim() || null : existing.description,
    patch.escalation_policy_id !== undefined ? patch.escalation_policy_id || null : existing.escalation_policy_id,
    patch.slack_channel_id !== undefined ? patch.slack_channel_id || null : existing.slack_channel_id,
    patch.default_urgency !== undefined ? (patch.default_urgency === 'low' ? 'low' : 'high') : existing.default_urgency,
    id
  );
  return getService(db, id);
}

export function deleteService(db: DB, id: string): void {
  getService(db, id);
  db.prepare('DELETE FROM services WHERE id = ?').run(id);
}

export function listIntegrations(db: DB, serviceId: string): ServiceIntegration[] {
  return db
    .prepare('SELECT * FROM service_integrations WHERE service_id = ? ORDER BY created_at')
    .all(serviceId) as unknown as ServiceIntegration[];
}

export function createIntegration(db: DB, serviceId: string, name: string): ServiceIntegration {
  getService(db, serviceId);
  const id = uuid();
  db.prepare(
    'INSERT INTO service_integrations (id, service_id, name, routing_key, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, serviceId, name?.trim() || 'Integration', routingKey(), nowIso());
  return db.prepare('SELECT * FROM service_integrations WHERE id = ?').get(id) as unknown as ServiceIntegration;
}

export function deleteIntegration(db: DB, integrationId: string): void {
  const res = db.prepare('DELETE FROM service_integrations WHERE id = ?').run(integrationId);
  if (res.changes === 0) throw new NotFoundError('Integration');
}

export function findServiceByRoutingKey(db: DB, key: string): Service | null {
  const row = db
    .prepare(
      `SELECT s.* FROM services s
       JOIN service_integrations i ON i.service_id = s.id
       WHERE i.routing_key = ?`
    )
    .get(key) as Service | undefined;
  return row ?? null;
}
