import { prisma } from "@opsly/db";
import { createAuditEntry } from "../audit";
import { routeSignal, type RoutingRuleInput } from "../routing";
import type { Actor, InboundSignal } from "../types";
import { transitionIncident, type IncidentSnapshot } from "./state-machine";

export interface CreateOrUpdateIncidentInput {
  organizationId: string;
  integrationId?: string | null;
  signal: InboundSignal;
  routingRules?: RoutingRuleInput[];
  inboundEventId?: string | null;
  actor?: Actor;
}

export async function createOrUpdateIncidentFromSignal(input: CreateOrUpdateIncidentInput) {
  const actor = input.actor ?? { type: "provider", id: input.signal.provider, displayName: input.signal.provider };
  const routing = routeSignal(input.signal, input.routingRules);

  if (routing.suppressed) {
    return { incident: null, suppressed: true };
  }

  const service = await prisma.service.findFirstOrThrow({
    where: {
      organizationId: input.organizationId,
      slug: routing.serviceSlug
    }
  });

  const existing = await prisma.incident.findFirst({
    where: {
      serviceId: service.id,
      dedupeKey: input.signal.dedupeKey,
      status: { not: "resolved" }
    },
    orderBy: { createdAt: "desc" }
  });

  if (input.signal.eventType === "resolve" && existing) {
    return {
      incident: await resolveIncident(existing.id, actor),
      suppressed: false
    };
  }

  if (existing) {
    const snapshot = toSnapshot(existing);
    const transition = transitionIncident(snapshot, { type: "append_alert", severity: input.signal.severity }, actor);
    const incident = await prisma.incident.update({
      where: { id: existing.id },
      data: {
        severity: transition.incident.severity,
        urgency: transition.incident.urgency,
        alerts: {
          create: alertData(input, existing.id)
        },
        timeline: {
          create: timelineData(transition)
        }
      },
      include: { alerts: true, timeline: true, service: true }
    });
    return { incident, suppressed: false };
  }

  const number = await nextIncidentNumber(input.organizationId);
  const transition = transitionIncident(
    {
      status: "triggered",
      severity: input.signal.severity,
      urgency: routing.urgency,
      currentEscalationLevel: 0
    },
    { type: input.signal.eventType === "reopen" ? "reopen" : "trigger", severity: input.signal.severity, urgency: routing.urgency },
    actor
  );

  const incident = await prisma.incident.create({
    data: {
      organizationId: input.organizationId,
      serviceId: service.id,
      number,
      title: input.signal.title,
      description: input.signal.message,
      status: transition.incident.status,
      severity: transition.incident.severity,
      urgency: transition.incident.urgency,
      sourceProvider: input.signal.provider,
      dedupeKey: input.signal.dedupeKey,
      sourceUrl: input.signal.sourceUrl,
      alerts: {
        create: alertData(input)
      },
      timeline: {
        create: timelineData(transition)
      }
    },
    include: { alerts: true, timeline: true, service: true }
  });

  await prisma.auditLog.create({
    data: createAuditEntry({
      organizationId: input.organizationId,
      actor,
      action: "incident.created",
      targetType: "incident",
      targetId: incident.id,
      metadata: { dedupeKey: input.signal.dedupeKey, provider: input.signal.provider }
    })
  });

  return { incident, suppressed: false };
}

export async function acknowledgeIncident(incidentId: string, actor: Actor) {
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
  const transition = transitionIncident(toSnapshot(incident), { type: "acknowledge" }, actor);
  return prisma.incident.update({
    where: { id: incidentId },
    data: {
      status: transition.incident.status,
      acknowledgedAt: transition.incident.acknowledgedAt,
      acknowledgedById: transition.incident.acknowledgedById,
      timeline: { create: timelineData(transition) }
    },
    include: { timeline: true, service: true }
  });
}

export async function resolveIncident(incidentId: string, actor: Actor) {
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
  const transition = transitionIncident(toSnapshot(incident), { type: "resolve" }, actor);
  return prisma.incident.update({
    where: { id: incidentId },
    data: {
      status: transition.incident.status,
      resolvedAt: transition.incident.resolvedAt,
      resolvedById: transition.incident.resolvedById,
      timeline: { create: timelineData(transition) }
    },
    include: { timeline: true, service: true }
  });
}

export async function escalateIncident(incidentId: string, actor: Actor) {
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
  const transition = transitionIncident(toSnapshot(incident), { type: "escalate" }, actor);
  return prisma.incident.update({
    where: { id: incidentId },
    data: {
      currentEscalationLevel: transition.incident.currentEscalationLevel,
      timeline: { create: timelineData(transition) }
    },
    include: { timeline: true, service: true }
  });
}

export async function assignIncident(incidentId: string, assigneeUserId: string, actor: Actor) {
  const [incident, assignee] = await Promise.all([
    prisma.incident.findUniqueOrThrow({ where: { id: incidentId } }),
    prisma.user.findUniqueOrThrow({ where: { id: assigneeUserId } })
  ]);
  const transition = transitionIncident(
    toSnapshot(incident),
    { type: "assign", userId: assignee.id, userName: assignee.name },
    actor
  );
  return prisma.incident.update({
    where: { id: incidentId },
    data: {
      assignedToUserId: transition.incident.assignedToUserId,
      timeline: { create: timelineData(transition) }
    },
    include: { timeline: true, service: true }
  });
}

export async function addIncidentNote(incidentId: string, authorId: string, body: string) {
  return prisma.incidentNote.create({
    data: { incidentId, authorId, body }
  });
}

async function nextIncidentNumber(organizationId: string): Promise<number> {
  const latest = await prisma.incident.findFirst({
    where: { organizationId },
    orderBy: { number: "desc" },
    select: { number: true }
  });
  return (latest?.number ?? 0) + 1;
}

function alertData(input: CreateOrUpdateIncidentInput, _incidentId?: string) {
  return {
    inboundEventId: input.inboundEventId ?? undefined,
    title: input.signal.title,
    message: input.signal.message,
    severity: input.signal.severity,
    provider: input.signal.provider,
    providerIssueId: input.signal.externalId,
    sourceUrl: input.signal.sourceUrl,
    dedupeKey: input.signal.dedupeKey
  };
}

function timelineData(transition: ReturnType<typeof transitionIncident>) {
  return {
    actorType: transition.timeline.actor.type,
    actorUserId: transition.timeline.actor.type === "user" ? transition.timeline.actor.id : undefined,
    action: transition.timeline.action,
    message: transition.timeline.message,
    metadataJson: transition.timeline.metadata as never
  };
}

function toSnapshot(incident: {
  id: string;
  status: "triggered" | "acknowledged" | "resolved";
  severity: "low" | "warning" | "error" | "critical";
  urgency: "low" | "warning" | "error" | "critical";
  currentEscalationLevel: number;
  assignedToUserId: string | null;
  acknowledgedAt: Date | null;
  acknowledgedById: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
}): IncidentSnapshot {
  return {
    id: incident.id,
    status: incident.status,
    severity: incident.severity,
    urgency: incident.urgency,
    currentEscalationLevel: incident.currentEscalationLevel,
    assignedToUserId: incident.assignedToUserId,
    acknowledgedAt: incident.acknowledgedAt,
    acknowledgedById: incident.acknowledgedById,
    resolvedAt: incident.resolvedAt,
    resolvedById: incident.resolvedById
  };
}
