import { Worker } from "bullmq";
import { escalateIncidentJob } from "./jobs/escalate-incident";
import { processInboundEventJob } from "./jobs/process-inbound-event";
import { sendNotificationJob } from "./jobs/send-notification";
import { connection } from "./queues";

async function main() {
  console.info("opsly-worker: started");

  const workers = [
    new Worker("inbound-events", async (job) => processInboundEventJob(job.data), { connection }),
    new Worker("notifications", async (job) => sendNotificationJob(job.data), { connection }),
    new Worker("escalations", async (job) => escalateIncidentJob(job.data), { connection })
  ];

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      console.error("opsly-worker: job failed", { queue: worker.name, jobId: job?.id, error });
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
