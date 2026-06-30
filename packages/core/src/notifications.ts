import type { Severity } from "./types";

export interface NotificationTarget {
  userId?: string;
  channel: "slack" | "email" | "sms" | "phone";
  destination: string;
  delayMinutes: number;
}

export interface NotificationRuleInput {
  userId: string;
  channel: "slack" | "email" | "sms" | "phone";
  destination: string;
  delayMinutes: number;
  urgency: Severity;
  enabled: boolean;
}

const severityRank: Record<Severity, number> = {
  low: 0,
  warning: 1,
  error: 2,
  critical: 3
};

export function notificationTargetsForUrgency(
  rules: NotificationRuleInput[],
  urgency: Severity
): NotificationTarget[] {
  return rules
    .filter((rule) => rule.enabled && severityRank[urgency] >= severityRank[rule.urgency])
    .sort((a, b) => a.delayMinutes - b.delayMinutes)
    .map((rule) => ({
      userId: rule.userId,
      channel: rule.channel,
      destination: rule.destination,
      delayMinutes: rule.delayMinutes
    }));
}
