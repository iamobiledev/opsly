import { z } from "zod";

export const nightwatchApplicationSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    environment: z.string().optional()
  })
  .passthrough();

export const nightwatchIssueSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    number: z.union([z.string(), z.number()]).optional(),
    key: z.string().optional(),
    type: z.string().optional(),
    title: z.string().optional(),
    name: z.string().optional(),
    message: z.string().optional(),
    description: z.string().optional(),
    exception_class: z.string().optional(),
    route: z.string().optional(),
    file: z.string().optional(),
    url: z.string().url().optional(),
    web_url: z.string().url().optional(),
    duration: z.number().optional(),
    duration_ms: z.number().optional(),
    threshold: z.number().optional(),
    threshold_ms: z.number().optional(),
    first_seen: z.string().optional(),
    last_seen: z.string().optional()
  })
  .passthrough();

export const nightwatchWebhookSchema = z
  .object({
    event: z.enum(["issue.opened", "issue.reopened", "issue.resolved"]).or(z.string()),
    timestamp: z.string().optional(),
    payload: z
      .object({
        issue: nightwatchIssueSchema.optional(),
        application: nightwatchApplicationSchema.optional(),
        application_id: z.string().optional(),
        application_name: z.string().optional(),
        environment: z.string().optional(),
        url: z.string().url().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export type NightwatchWebhookPayload = z.infer<typeof nightwatchWebhookSchema>;

export function parseNightwatchWebhook(payload: unknown): NightwatchWebhookPayload {
  return nightwatchWebhookSchema.parse(payload);
}
