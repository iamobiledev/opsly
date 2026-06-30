import { Queue } from "bullmq";

let inboundQueue: Queue | undefined;

function getInboundQueue() {
  inboundQueue ??= new Queue("inbound-events", {
    connection: {
      url: process.env.REDIS_URL ?? "redis://localhost:6379"
    }
  });
  return inboundQueue;
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
