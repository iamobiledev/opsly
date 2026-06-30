import { decryptSecret } from "@opsly/core";
import { prisma } from "@opsly/db";
import { incidentBlocks, updateSlackIncidentMessage } from "@opsly/integrations";

export interface UpdateSlackMessageJob {
  incidentId: string;
}

export async function updateSlackMessageJob(job: UpdateSlackMessageJob) {
  const incident = await prisma.incident.findUniqueOrThrow({
    where: { id: job.incidentId },
    include: {
      service: true,
      slackMessages: true
    }
  });

  const token = process.env.SLACK_BOT_TOKEN ? decryptSecret("env:SLACK_BOT_TOKEN") : "";
  if (!token) {
    return;
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const blocks = incidentBlocks({
    id: incident.id,
    number: incident.number,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    serviceName: incident.service.name,
    sourceUrl: incident.sourceUrl,
    appUrl
  });

  for (const message of incident.slackMessages) {
    await updateSlackIncidentMessage({
      token,
      channel: message.channelId,
      ts: message.messageTs,
      text: `#${incident.number} ${incident.status}: ${incident.title}`,
      blocks
    });
  }
}
