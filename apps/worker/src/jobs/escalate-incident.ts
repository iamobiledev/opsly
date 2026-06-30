import { escalateIncident, nextEscalationStep } from "@opsly/core";
import { prisma } from "@opsly/db";
import { notificationQueue, escalationQueue, type EscalateIncidentJob } from "../queues";

export async function escalateIncidentJob(job: EscalateIncidentJob) {
  const incident = await prisma.incident.findUniqueOrThrow({
    where: { id: job.incidentId },
    include: {
      service: { include: { escalationPolicy: { include: { rules: true } } } },
      escalationState: true
    }
  });

  if (incident.status !== "triggered" || !incident.service.escalationPolicy) {
    return;
  }

  const policy = incident.service.escalationPolicy;
  const state = incident.escalationState ?? {
    currentLevel: incident.currentEscalationLevel,
    repeatCount: 0
  };
  const next = nextEscalationStep(
    {
      id: policy.id,
      repeatCount: policy.repeatCount,
      rules: policy.rules.map((rule) => ({
        level: rule.level,
        delayMinutes: rule.delayMinutes,
        targetType: rule.targetType as "user" | "team" | "schedule",
        targetId: rule.targetId
      }))
    },
    state
  );

  if (!next || next.exhausted) {
    return;
  }

  await escalateIncident(incident.id, { type: "system", displayName: "Opsly escalation engine" });
  await notificationQueue.add("send-notification", { incidentId: incident.id });
  await prisma.escalationState.upsert({
    where: { incidentId: incident.id },
    create: {
      incidentId: incident.id,
      policyId: policy.id,
      currentLevel: next.level,
      nextEscalationAt: next.notifyAt,
      repeatCount: 0
    },
    update: {
      currentLevel: next.level,
      nextEscalationAt: next.notifyAt
    }
  });
  await escalationQueue.add("escalate-incident", { incidentId: incident.id }, { delay: Math.max(0, next.notifyAt.getTime() - Date.now()) });
}
