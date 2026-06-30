import { createOrUpdateIncidentFromSignal, type RoutingRuleInput } from "@opsly/core";
import { prisma } from "@opsly/db";
import { normalizeNightwatchPayload, normalizeSentryPayload } from "@opsly/integrations";
import { escalationQueue, notificationQueue, type ProcessInboundEventJob } from "../queues";

export async function processInboundEventJob(job: ProcessInboundEventJob) {
  const inbound = await prisma.inboundEvent.findUniqueOrThrow({
    where: { id: job.inboundEventId },
    include: {
      integration: {
        include: {
          routingRules: true,
          service: true
        }
      }
    }
  });

  if (inbound.status === "processed") {
    return;
  }

  if (!inbound.integration) {
    await prisma.inboundEvent.update({
      where: { id: inbound.id },
      data: { status: "failed", error: "Inbound event has no integration" }
    });
    return;
  }

  const payload = (inbound.payloadRedactedJson ?? {}) as Record<string, unknown>;
  const signal =
    inbound.provider === "sentry"
      ? normalizeSentryPayload(payload)
      : inbound.provider === "nightwatch"
        ? normalizeNightwatchPayload(payload)
        : undefined;

  if (!signal) {
    await prisma.inboundEvent.update({
      where: { id: inbound.id },
      data: { status: "failed", error: `Unsupported provider ${inbound.provider}` }
    });
    return;
  }

  const routingRules: RoutingRuleInput[] = inbound.integration.routingRules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    order: rule.order,
    enabled: rule.enabled,
    conditions: (rule.conditionsJson ?? {}) as never,
    actions: (rule.actionsJson ?? {}) as never
  }));

  const result = await createOrUpdateIncidentFromSignal({
    organizationId: inbound.organizationId,
    integrationId: inbound.integrationId,
    inboundEventId: inbound.id,
    signal,
    routingRules
  });

  await prisma.inboundEvent.update({
    where: { id: inbound.id },
    data: { status: "processed", processedAt: new Date() }
  });

  if (result.incident) {
    await notificationQueue.add("send-notification", { incidentId: result.incident.id });
    if (result.incident.status === "triggered") {
      await escalationQueue.add("escalate-incident", { incidentId: result.incident.id }, { delay: 10 * 60_000 });
    }
  }
}
