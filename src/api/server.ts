import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DateTime } from 'luxon';
import type { AppCtx } from '../context.js';
import { DomainError } from '../db/index.js';
import * as users from '../domain/users.js';
import * as policies from '../domain/escalation-policies.js';
import * as schedules from '../domain/schedules.js';
import * as services from '../domain/services.js';
import * as incidents from '../domain/incidents.js';
import { ingestEvent } from '../domain/events.js';
import { whoIsOnCall, upcomingShiftsForUser } from '../domain/oncall.js';

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

export function createApiServer(ctx: AppCtx): Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, slack: Boolean(ctx.config.slack) });
  });

  // The events endpoint authenticates via routing_key, not the API token, so
  // monitoring tools only ever need their integration key.
  app.post('/api/v1/events', (req, res, next) => {
    try {
      res.status(202).json(ingestEvent(ctx, req.body));
    } catch (err) {
      next(err);
    }
  });

  // Everything else under /api requires the bearer token when one is configured.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (!ctx.config.apiToken) return next();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string | undefined);
    if (token === ctx.config.apiToken) return next();
    res.status(401).json({ error: 'Missing or invalid API token' });
  });

  const api = express.Router();
  app.use('/api/v1', api);

  // ---- Users ----
  api.get('/users', (_req, res) => res.json({ users: users.listUsers(ctx.db) }));
  api.post('/users', (req, res) => res.status(201).json({ user: users.createUser(ctx.db, req.body) }));
  api.get('/users/:id', (req, res) => res.json({ user: users.getUser(ctx.db, req.params.id) }));
  api.patch('/users/:id', (req, res) => res.json({ user: users.updateUser(ctx.db, req.params.id, req.body) }));
  api.delete('/users/:id', (req, res) => {
    users.deleteUser(ctx.db, req.params.id);
    res.status(204).end();
  });
  api.get('/users/:id/shifts', (req, res) => {
    const days = parseIntParam(req.query.days, 14, 1, 62);
    res.json({ shifts: upcomingShiftsForUser(ctx.db, req.params.id, days) });
  });

  // ---- Escalation policies ----
  api.get('/escalation-policies', (_req, res) => res.json({ escalation_policies: policies.listPolicies(ctx.db) }));
  api.post('/escalation-policies', (req, res) =>
    res.status(201).json({ escalation_policy: policies.createPolicy(ctx.db, req.body) })
  );
  api.get('/escalation-policies/:id', (req, res) =>
    res.json({ escalation_policy: policies.getPolicy(ctx.db, req.params.id) })
  );
  api.patch('/escalation-policies/:id', (req, res) =>
    res.json({ escalation_policy: policies.updatePolicy(ctx.db, req.params.id, req.body) })
  );
  api.delete('/escalation-policies/:id', (req, res) => {
    policies.deletePolicy(ctx.db, req.params.id);
    res.status(204).end();
  });

  // ---- Schedules ----
  api.get('/schedules', (_req, res) => res.json({ schedules: schedules.listSchedules(ctx.db) }));
  api.post('/schedules', (req, res) => res.status(201).json({ schedule: schedules.createSchedule(ctx.db, req.body) }));
  api.get('/schedules/:id', (req, res) => {
    const schedule = schedules.getSchedule(ctx.db, req.params.id);
    const days = parseIntParam(req.query.days, 14, 1, 62);
    const from = DateTime.utc().startOf('hour');
    const shifts = schedules.renderShifts(ctx.db, schedule.id, from.toISO()!, from.plus({ days }).toISO()!);
    res.json({ schedule, shifts, overrides: schedules.listOverrides(ctx.db, schedule.id) });
  });
  api.patch('/schedules/:id', (req, res) =>
    res.json({ schedule: schedules.updateSchedule(ctx.db, req.params.id, req.body) })
  );
  api.delete('/schedules/:id', (req, res) => {
    schedules.deleteSchedule(ctx.db, req.params.id);
    res.status(204).end();
  });
  api.post('/schedules/:id/overrides', (req, res) =>
    res.status(201).json({ override: schedules.createOverride(ctx.db, { ...req.body, schedule_id: req.params.id }) })
  );
  api.get('/schedules/:id/overrides', (req, res) =>
    res.json({ overrides: schedules.listOverrides(ctx.db, req.params.id, req.query.all === 'true') })
  );
  api.delete('/overrides/:id', (req, res) => {
    schedules.deleteOverride(ctx.db, req.params.id);
    res.status(204).end();
  });

  // ---- Services & integrations ----
  api.get('/services', (_req, res) => {
    const list = services.listServices(ctx.db).map((s) => ({
      ...s,
      integrations: services.listIntegrations(ctx.db, s.id),
    }));
    res.json({ services: list });
  });
  api.post('/services', (req, res) => {
    const service = services.createService(ctx.db, req.body);
    res.status(201).json({ service: { ...service, integrations: services.listIntegrations(ctx.db, service.id) } });
  });
  api.get('/services/:id', (req, res) => {
    const service = services.getService(ctx.db, req.params.id);
    res.json({ service: { ...service, integrations: services.listIntegrations(ctx.db, service.id) } });
  });
  api.patch('/services/:id', (req, res) =>
    res.json({ service: services.updateService(ctx.db, req.params.id, req.body) })
  );
  api.delete('/services/:id', (req, res) => {
    services.deleteService(ctx.db, req.params.id);
    res.status(204).end();
  });
  api.post('/services/:id/integrations', (req, res) =>
    res.status(201).json({ integration: services.createIntegration(ctx.db, req.params.id, req.body?.name) })
  );
  api.delete('/integrations/:id', (req, res) => {
    services.deleteIntegration(ctx.db, req.params.id);
    res.status(204).end();
  });

  // ---- Incidents ----
  api.get('/incidents', (req, res) => {
    const filter: incidents.ListIncidentsFilter = {
      status: req.query.status as incidents.ListIncidentsFilter['status'],
      service_id: req.query.service_id as string | undefined,
      assigned_user_id: req.query.assigned_user_id as string | undefined,
      limit: req.query.limit ? parseIntParam(req.query.limit, 100, 1, 500) : undefined,
    };
    res.json({ incidents: incidents.listIncidents(ctx.db, filter) });
  });
  api.post('/incidents', (req, res) => res.status(201).json({ incident: incidents.triggerIncident(ctx, req.body) }));
  api.get('/incidents/stats', (_req, res) => res.json(incidents.incidentStats(ctx.db)));
  api.get('/incidents/:id', (req, res) => {
    const incident = lookupIncident(ctx, req.params.id);
    res.json({ incident, timeline: incidents.getTimeline(ctx.db, incident.id) });
  });
  api.post('/incidents/:id/acknowledge', (req, res) =>
    res.json({ incident: incidents.acknowledgeIncident(ctx, lookupIncident(ctx, req.params.id).id, req.body?.user_id) })
  );
  api.post('/incidents/:id/resolve', (req, res) =>
    res.json({ incident: incidents.resolveIncident(ctx, lookupIncident(ctx, req.params.id).id, req.body?.user_id) })
  );
  api.post('/incidents/:id/escalate', (req, res) =>
    res.json({
      incident: incidents.escalateIncident(ctx, lookupIncident(ctx, req.params.id).id, {
        actor_user_id: req.body?.user_id,
      }),
    })
  );
  api.post('/incidents/:id/reassign', (req, res) =>
    res.json({
      incident: incidents.reassignIncident(ctx, lookupIncident(ctx, req.params.id).id, req.body?.user_id, req.body?.actor_user_id),
    })
  );
  api.post('/incidents/:id/notes', (req, res) =>
    res.json({ incident: incidents.addNote(ctx, lookupIncident(ctx, req.params.id).id, req.body?.content, req.body?.user_id) })
  );

  // ---- On-call ----
  api.get('/oncalls', (req, res) => {
    const at = typeof req.query.at === 'string' ? req.query.at : undefined;
    const oncalls = whoIsOnCall(ctx.db, at).map((o) => ({
      schedule_id: o.schedule.id,
      schedule_name: o.schedule.name,
      timezone: o.schedule.timezone,
      user: o.user ? { id: o.user.id, name: o.user.name, email: o.user.email } : null,
      source: o.source,
      until: o.until,
    }));
    res.json({ oncalls });
  });

  // ---- Web dashboard ----
  app.use(express.static(WEB_DIR));

  // JSON errors for the API; 404 fallthrough for everything else.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/** Accept either an incident UUID or a plain incident number in URL params. */
function lookupIncident(ctx: AppCtx, idOrNumber: string) {
  if (/^\d+$/.test(idOrNumber)) {
    const byNumber = incidents.findIncidentByNumber(ctx.db, parseInt(idOrNumber, 10));
    if (byNumber) return byNumber;
  }
  return incidents.getIncident(ctx.db, idOrNumber);
}

function parseIntParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
