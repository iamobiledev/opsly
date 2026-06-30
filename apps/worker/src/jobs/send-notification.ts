import { decryptSecret } from "@opsly/core";
import { prisma } from "@opsly/db";
import { incidentBlocks, postSlackIncidentMessage } from "@opsly/integrations";
import type { SendNotificationJob } from "../queues";

export async function sendNotificationJob(job: SendNotificationJob) {
  const incident = await prisma.incident.findUniqueOrThrow({
    where: { id: job.incidentId },
    include: {
      service: { include: { slackChannelBindings: true } }
    }
  });

  const token = process.env.SLACK_BOT_TOKEN ? decryptSecret("env:SLACK_BOT_TOKEN") : "";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  for (const binding of incident.service.slackChannelBindings) {
    const attempt = await prisma.notificationAttempt.create({
      data: {
        incidentId: incident.id,
        channel: "slack",
        destination: binding.channelId,
        status: token ? "pending" : "skipped",
        attempt: 1,
        error: token ? undefined : "SLACK_BOT_TOKEN is not configured"
      }
    });

    if (!token) {
      continue;
    }

    try {
      const response = await postSlackIncidentMessage({
        token,
        channel: binding.channelId,
        text: `#${incident.number} ${incident.title}`,
        blocks: incidentBlocks({
          id: incident.id,
          number: incident.number,
          title: incident.title,
          status: incident.status,
          severity: incident.severity,
          serviceName: incident.service.name,
          sourceUrl: incident.sourceUrl,
          appUrl
        })
      });

      await prisma.notificationAttempt.update({
        where: { id: attempt.id },
        data: { status: "sent", sentAt: new Date(), providerMessageId: response.ts }
      });

      if (response.ts) {
        await prisma.slackMessage.upsert({
          where: { channelId_messageTs: { channelId: binding.channelId, messageTs: response.ts } },
          create: {
            incidentId: incident.id,
            channelId: binding.channelId,
            messageTs: response.ts,
            kind: "incident"
          },
          update: { incidentId: incident.id }
        });
      }
    } catch (error) {
      await prisma.notificationAttempt.update({
        where: { id: attempt.id },
        data: { status: "failed", error: error instanceof Error ? error.message : "Unknown Slack error" }
      });
      throw error;
    }
  }
}
