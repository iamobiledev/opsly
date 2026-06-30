import { Queue } from "bullmq";

let inboundQueue: Queue | undefined;
let slackUpdateQueue: Queue | undefined;

function getInboundQueue() {
  inboundQueue ??= new Queue("inbound-events", {
    connection: {
      url: process.env.REDIS_URL ?? "redis://localhost:6379"
    }
  });
  return inboundQueue;
}

function getSlackUpdateQueue() {
  slackUpdateQueue ??= new Queue("slack-updates", {
    connection: {
      url: process.env.REDIS_URL ?? "redis://localhost:6379"
    }
  });
  return slackUpdateQueue;
}

export async function enqueueInboundEvent(inboundEventId: string) {
  await getInboundQueue().add(
    "process-inbound-event",
    { inboundEventId },
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 500,
      removeOnFail: 1_000
    }
  );
}

export async function enqueueSlackUpdate(incidentId: string) {
  await getSlackUpdateQueue().add(
    "update-slack-message",
    { incidentId },
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 500,
      removeOnFail: 1_000
    }
  );
}
