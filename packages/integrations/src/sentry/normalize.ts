import { createHash } from "node:crypto";
import type { InboundEventType, InboundSignal, Severity } from "@opsly/core";

type SentryPayload = Record<string, unknown>;

export function normalizeSentryPayload(payload: SentryPayload, headers: Record<string, string | undefined> = {}): InboundSignal {
  const data = objectAt(payload, "data") ?? payload;
  const issue = objectAt(data, "issue") ?? objectAt(data, "event") ?? data;
  const project = objectAt(data, "project") ?? objectAt(issue, "project");
  const projectSlug = stringAt(project, "slug") ?? stringAt(project, "name") ?? stringAt(payload, "project");
  const issueId = stringAt(issue, "id") ?? stringAt(issue, "shortId") ?? stringAt(issue, "short_id");
  const shortId = stringAt(issue, "shortId") ?? stringAt(issue, "short_id") ?? issueId;
  const title = stringAt(issue, "title") ?? stringAt(issue, "metadata.type") ?? stringAt(issue, "culprit") ?? "Sentry issue";
  const culprit = stringAt(issue, "culprit") ?? stringAt(issue, "metadata.filename") ?? stringAt(issue, "metadata.function");
  const environment =
    stringAt(issue, "environment") ??
    stringAt(data, "environment") ??
    firstString(arrayAt(issue, "tags")?.find((tag) => Array.isArray(tag) && tag[0] === "environment") as unknown[]);
  const level = stringAt(issue, "level") ?? stringAt(issue, "metadata.value") ?? stringAt(payload, "level");
  const action = stringAt(payload, "action") ?? stringAt(headers, "sentry-hook-resource");
  const webUrl = stringAt(issue, "web_url") ?? stringAt(issue, "permalink") ?? stringAt(issue, "url");
  const dedupeKey = [
    "sentry",
    projectSlug ?? "unknown-project",
    environment ?? "unknown-env",
    shortId ?? issueId ?? hashPayload(issue)
  ].join(":");

  return {
    provider: "sentry",
    eventType: sentryEventType(action, issue),
    externalId: issueId ?? hashPayload(issue),
    dedupeKey,
    title,
    message: culprit ? `${title} — ${culprit}` : title,
    severity: sentrySeverity(level, title),
    environment,
    serviceHints: {
      serviceSlug: projectSlug === "rows-frontend-dev" ? "rows-frontend" : undefined,
      projectSlug
    },
    sourceUrl: webUrl,
    occurredAt: parseDate(stringAt(issue, "lastSeen") ?? stringAt(issue, "last_seen") ?? stringAt(payload, "timestamp")),
    rawSummary: {
      shortId,
      projectSlug,
      environment,
      culprit,
      level,
      action,
      path: culprit
    }
  };
}

function sentryEventType(action: string | undefined, issue: Record<string, unknown>): InboundEventType {
  const status = stringAt(issue, "status");
  if (action?.includes("resolved") || status === "resolved") {
    return "resolve";
  }
  if (action?.includes("reopened")) {
    return "reopen";
  }
  return "trigger";
}

function sentrySeverity(level: string | undefined, title: string): Severity {
  const normalized = level?.toLowerCase();
  if (normalized === "fatal" || normalized === "critical") {
    return "critical";
  }
  if (normalized === "error") {
    return "error";
  }
  if (normalized === "warning" || title.toLowerCase().includes("degraded")) {
    return "warning";
  }
  return "error";
}

function objectAt(value: unknown, path: string): Record<string, unknown> | undefined {
  const entry = at(value, path);
  return typeof entry === "object" && entry !== null && !Array.isArray(entry) ? (entry as Record<string, unknown>) : undefined;
}

function arrayAt(value: unknown, path: string): unknown[] | undefined {
  const entry = at(value, path);
  return Array.isArray(entry) ? entry : undefined;
}

function stringAt(value: unknown, path: string): string | undefined {
  const entry = at(value, path);
  return typeof entry === "string" && entry.length > 0 ? entry : undefined;
}

function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (typeof acc !== "object" || acc === null) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, value);
}

function firstString(value: unknown[] | undefined): string | undefined {
  const candidate = value?.[1];
  return typeof candidate === "string" ? candidate : undefined;
}

function parseDate(value: string | undefined): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
