export const INCIDENT_STATUSES = ["triggered", "acknowledged", "resolved"] as const;
export const SEVERITIES = ["low", "warning", "error", "critical"] as const;
export const PROVIDERS = ["sentry", "nightwatch", "slack", "manual", "api"] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Provider = (typeof PROVIDERS)[number];

export type InboundEventType =
  | "trigger"
  | "reopen"
  | "resolve"
  | "acknowledge"
  | "change"
  | "test";

export interface InboundSignal {
  provider: Provider;
  eventType: InboundEventType;
  externalId: string;
  dedupeKey: string;
  title: string;
  message: string;
  severity: Severity;
  environment?: string;
  serviceHints: {
    serviceSlug?: string;
    projectSlug?: string;
    applicationName?: string;
    applicationId?: string;
    teamSlug?: string;
  };
  sourceUrl?: string;
  occurredAt: Date;
  rawSummary: Record<string, unknown>;
}

export interface Actor {
  type: "system" | "user" | "slack" | "provider" | "api";
  id?: string;
  displayName?: string;
}
