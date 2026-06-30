import { Queue } from "bullmq";

export const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379"
};

export const inboundQueue = new Queue("inbound-events", { connection });
export const notificationQueue = new Queue("notifications", { connection });
export const escalationQueue = new Queue("escalations", { connection });

export interface ProcessInboundEventJob {
  inboundEventId: string;
}

export interface SendNotificationJob {
  incidentId: string;
}

export interface EscalateIncidentJob {
  incidentId: string;
}
