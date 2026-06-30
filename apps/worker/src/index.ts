import { Worker } from "bullmq";
import { deadLetterJob } from "./jobs/dead-letter";
import { escalateIncidentJob } from "./jobs/escalate-incident";
import { processInboundEventJob } from "./jobs/process-inbound-event";
import { sendNotificationJob } from "./jobs/send-notification";
import { updateSlackMessageJob } from "./jobs/update-slack-message";
import { connection, deadLetterQueue } from "./queues";

async function main() {
  console.info("opsly-worker: started");

  const workers = [
    new Worker("inbound-events", async (job) => processInboundEventJob(job.data), { connection }),
    new Worker("notifications", async (job) => sendNotificationJob(job.data), { connection }),
    new Worker("escalations", async (job) => escalateIncidentJob(job.data), { connection }),
    new Worker("slack-updates", async (job) => updateSlackMessageJob(job.data), { connection }),
    new Worker("dead-letter", async (job) => deadLetterJob(job.data), { connection })
  ];

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      console.error("opsly-worker: job failed", { queue: worker.name, jobId: job?.id, error });
      if (worker.name !== "dead-letter") {
        void deadLetterQueue.add("record-dead-letter", {
          queueName: worker.name,
          jobId: job?.id,
          failedReason: error.message,
          data: job?.data
        });
      }
    });
  }

  const shutdown = async () => {
    console.info("opsly-worker: shutting down");
    await Promise.all(workers.map((worker) => worker.close()));
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("opsly-worker: fatal", error);
  process.exit(1);
});
