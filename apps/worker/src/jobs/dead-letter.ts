import { prisma } from "@opsly/db";

export interface DeadLetterJob {
  queueName: string;
  jobId?: string;
  failedReason: string;
  data?: unknown;
}

export async function deadLetterJob(job: DeadLetterJob) {
  const organization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!organization) {
    return;
  }

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorType: "system",
      action: "worker.dead_letter",
      targetType: "queue_job",
      targetId: job.jobId,
      metadataJson: {
        queueName: job.queueName,
        failedReason: job.failedReason,
        data: job.data
      } as never
    }
  });
}
