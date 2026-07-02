import { randomUUID } from 'node:crypto';
import { DomainError } from '../db/index.js';
import type { AppCtx } from '../context.js';
import type { Urgency } from '../types.js';
import { findServiceByRoutingKey } from './services.js';
import { acknowledgeIncident, resolveIncident, triggerIncident } from './incidents.js';

/**
 * PagerDuty Events API v2-compatible ingestion.
 * https://developer.pagerduty.com/docs/events-api-v2-overview
 */
export interface EventPayload {
  routing_key: string;
  event_action: 'trigger' | 'acknowledge' | 'resolve';
  dedup_key?: string;
  payload?: {
    summary?: string;
    source?: string;
    severity?: 'critical' | 'error' | 'warning' | 'info';
    custom_details?: unknown;
  };
}

export interface EventResult {
  status: 'success';
  message: string;
  dedup_key: string | null;
  incident_id: string | null;
  incident_number: number | null;
}

function severityToUrgency(severity?: string): Urgency {
  return severity === 'warning' || severity === 'info' ? 'low' : 'high';
}

export function ingestEvent(ctx: AppCtx, event: EventPayload): EventResult {
  if (!event || typeof event !== 'object') throw new DomainError('Invalid event body');
  if (!event.routing_key) throw new DomainError('routing_key is required');
  const service = findServiceByRoutingKey(ctx.db, event.routing_key);
  if (!service) throw new DomainError('Unknown routing_key', 403);

  const action = event.event_action;
  if (action === 'trigger') {
    const summary = event.payload?.summary?.trim();
    if (!summary) throw new DomainError('payload.summary is required for trigger events');
    const dedupKey = event.dedup_key?.trim() || randomUUID();
    const details =
      event.payload?.custom_details !== undefined
        ? safeStringify(event.payload.custom_details)
        : null;
    const incident = triggerIncident(ctx, {
      service_id: service.id,
      title: summary.slice(0, 500),
      description: details,
      urgency: severityToUrgency(event.payload?.severity),
      source: event.payload?.source?.trim() || 'events-api',
      dedup_key: dedupKey,
    });
    return {
      status: 'success',
      message: incident.alert_count > 1 ? 'Event deduplicated into existing incident' : 'Incident triggered',
      dedup_key: dedupKey,
      incident_id: incident.id,
      incident_number: incident.number,
    };
  }

  if (action === 'acknowledge' || action === 'resolve') {
    const dedupKey = event.dedup_key?.trim();
    if (!dedupKey) throw new DomainError(`dedup_key is required for ${action} events`);
    const open = ctx.db
      .prepare(`SELECT id, status FROM incidents WHERE service_id = ? AND dedup_key = ? AND status != 'resolved'`)
      .get(service.id, dedupKey) as { id: string; status: string } | undefined;
    if (!open) {
      // PagerDuty treats these as accepted no-ops when nothing matches.
      return { status: 'success', message: 'No open incident for dedup_key; nothing to do', dedup_key: dedupKey, incident_id: null, incident_number: null };
    }
    const incident =
      action === 'acknowledge'
        ? open.status === 'acknowledged'
          ? null
          : acknowledgeIncident(ctx, open.id)
        : resolveIncident(ctx, open.id);
    return {
      status: 'success',
      message: incident ? `Incident ${action}d` : 'Incident already acknowledged',
      dedup_key: dedupKey,
      incident_id: open.id,
      incident_number: incident?.number ?? null,
    };
  }

  throw new DomainError(`Unknown event_action: ${String(action)}`);
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
