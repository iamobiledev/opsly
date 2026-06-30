import { createHash } from "node:crypto";
import type { InboundEventType, InboundSignal, Severity } from "@opsly/core";

type NightwatchPayload = Record<string, unknown>;

export function normalizeNightwatchPayload(payload: NightwatchPayload): InboundSignal {
  const event = stringAt(payload, "event") ?? "issue.opened";
  const body = objectAt(payload, "payload") ?? payload;
  const issue = objectAt(body, "issue") ?? body;
  const application = objectAt(body, "application") ?? objectAt(issue, "application");
  const environment = stringAt(body, "environment") ?? stringAt(issue, "environment") ?? stringAt(application, "environment");
  const issueId = stringAt(issue, "id") ?? stringAt(issue, "number") ?? stringAt(issue, "key");
  const issueNumber = stringAt(issue, "number") ?? stringAt(issue, "id");
  const issueType = stringAt(issue, "type") ?? inferIssueType(issue);
  const title =
    stringAt(issue, "title") ??
    stringAt(issue, "exception_class") ??
    stringAt(issue, "name") ??
    `${issueType === "slow_route" ? "Slow Route" : "Exception"} ${issueNumber ?? ""}`.trim();
  const message =
    stringAt(issue, "message") ??
    stringAt(issue, "description") ??
    stringAt(issue, "route") ??
    stringAt(issue, "file") ??
    title;
  const appName = stringAt(application, "name") ?? stringAt(body, "application_name") ?? "Rows Backend";
  const appId =
    stringAt(application, "id") ??
    stringAt(body, "application_id") ??
    "9f2c42c9-d339-4b43-8eac-00e04871c794";
  const route = stringAt(issue, "route") ?? extractRoute(message);
  const sourceUrl = stringAt(issue, "url") ?? stringAt(issue, "web_url") ?? stringAt(body, "url");
  const durationMs = numberAt(issue, "duration_ms") ?? numberAt(issue, "duration");
  const thresholdMs = numberAt(issue, "threshold_ms") ?? numberAt(issue, "threshold");

  return {
    provider: "nightwatch",
    eventType: nightwatchEventType(event),
    externalId: issueId ?? hashPayload(issue),
    dedupeKey: ["nightwatch", appId, environment ?? "unknown-env", issueId ?? issueNumber ?? hashPayload(issue)].join(":"),
    title,
    message,
    severity: nightwatchSeverity(issueType, durationMs, thresholdMs, environment),
    environment,
    serviceHints: {
      serviceSlug: "rows-backend",
      applicationName: appName,
      applicationId: appId
    },
    sourceUrl,
    occurredAt: parseDate(stringAt(payload, "timestamp") ?? stringAt(issue, "last_seen") ?? stringAt(issue, "first_seen")),
    rawSummary: {
      issueId,
      issueNumber,
      issueType,
      applicationName: appName,
      applicationId: appId,
      environment,
      route,
      file: stringAt(issue, "file"),
      durationMs,
      thresholdMs
    }
  };
}

function nightwatchEventType(event: string): InboundEventType {
  if (event.endsWith(".resolved")) {
    return "resolve";
  }
  if (event.endsWith(".reopened")) {
    return "reopen";
  }
  return "trigger";
}

function nightwatchSeverity(
  issueType: string,
  durationMs: number | undefined,
  thresholdMs: number | undefined,
  environment: string | undefined
): Severity {
  if (environment === "Dev Server") {
    return "warning";
  }

  if (issueType === "slow_route") {
    if (!durationMs || !thresholdMs) {
      return "warning";
    }
    const ratio = durationMs / thresholdMs;
    if (ratio > 2 || durationMs > 10_000) {
      return "critical";
    }
    if (ratio > 1.25) {
      return "error";
    }
    return "warning";
  }

  return "error";
}

function inferIssueType(issue: Record<string, unknown>): string {
  const title = `${stringAt(issue, "title") ?? ""} ${stringAt(issue, "message") ?? ""}`.toLowerCase();
  return title.includes("slow route") || title.includes("exceeded") ? "slow_route" : "exception";
}

function extractRoute(message: string): string | undefined {
  const match = message.match(/(?:GET|POST|PUT|PATCH|DELETE|HEAD)(?:\|HEAD)?\s+([^\s]+)/);
  return match?.[1];
}

function objectAt(value: unknown, path: string): Record<string, unknown> | undefined {
  const entry = at(value, path);
  return typeof entry === "object" && entry !== null && !Array.isArray(entry) ? (entry as Record<string, unknown>) : undefined;
}

function stringAt(value: unknown, path: string): string | undefined {
  const entry = at(value, path);
  return typeof entry === "string" && entry.length > 0 ? entry : undefined;
}

function numberAt(value: unknown, path: string): number | undefined {
  const entry = at(value, path);
  return typeof entry === "number" ? entry : undefined;
}

function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (typeof acc !== "object" || acc === null) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, value);
}

function parseDate(value: string | undefined): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
