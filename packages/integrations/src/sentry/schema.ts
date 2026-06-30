import { z } from "zod";

export const sentryProjectSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    slug: z.string().optional(),
    name: z.string().optional()
  })
  .passthrough();

export const sentryIssueSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    shortId: z.string().optional(),
    short_id: z.string().optional(),
    title: z.string().optional(),
    culprit: z.string().optional(),
    level: z.string().optional(),
    status: z.string().optional(),
    environment: z.string().optional(),
    web_url: z.string().url().optional(),
    permalink: z.string().url().optional(),
    url: z.string().url().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.unknown()).optional(),
    firstSeen: z.string().optional(),
    lastSeen: z.string().optional(),
    first_seen: z.string().optional(),
    last_seen: z.string().optional()
  })
  .passthrough();

export const sentryWebhookSchema = z
  .object({
    action: z.string().optional(),
    installation: z.unknown().optional(),
    actor: z.unknown().optional(),
    data: z
      .object({
        issue: sentryIssueSchema.optional(),
        event: sentryIssueSchema.optional(),
        project: sentryProjectSchema.optional()
      })
      .passthrough()
      .optional(),
    project: z.union([z.string(), sentryProjectSchema]).optional(),
    timestamp: z.string().optional()
  })
  .passthrough();

export type SentryWebhookPayload = z.infer<typeof sentryWebhookSchema>;

export function parseSentryWebhook(payload: unknown): SentryWebhookPayload {
  return sentryWebhookSchema.parse(payload);
}
