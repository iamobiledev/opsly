import type { Actor, IncidentStatus, Severity } from "../types";

export interface IncidentSnapshot {
  id?: string;
  status: IncidentStatus;
  severity: Severity;
  urgency: Severity;
  currentEscalationLevel: number;
  assignedToUserId?: string | null;
  acknowledgedAt?: Date | null;
  acknowledgedById?: string | null;
  resolvedAt?: Date | null;
  resolvedById?: string | null;
}

export type IncidentCommand =
  | { type: "trigger"; severity: Severity; urgency?: Severity }
  | { type: "append_alert"; severity: Severity }
  | { type: "acknowledge" }
  | { type: "resolve" }
  | { type: "reopen"; severity?: Severity; urgency?: Severity }
  | { type: "escalate" }
  | { type: "assign"; userId: string; userName?: string };

export interface IncidentTransition {
  incident: IncidentSnapshot;
  timeline: {
    action: string;
    message: string;
    actor: Actor;
    metadata?: Record<string, unknown>;
  };
}

export function transitionIncident(
  current: IncidentSnapshot,
  command: IncidentCommand,
  actor: Actor,
  now = new Date()
): IncidentTransition {
  switch (command.type) {
    case "trigger":
      return {
        incident: {
          ...current,
          status: "triggered",
          severity: maxSeverity(current.severity, command.severity),
          urgency: command.urgency ?? maxSeverity(current.urgency, command.severity),
          resolvedAt: null,
          resolvedById: null
        },
        timeline: {
          action: "incident.triggered",
          message: "Incident triggered",
          actor,
          metadata: { severity: command.severity, urgency: command.urgency }
        }
      };

    case "append_alert":
      return {
        incident: {
          ...current,
          severity: maxSeverity(current.severity, command.severity),
          urgency: maxSeverity(current.urgency, command.severity)
        },
        timeline: {
          action: "incident.alert_appended",
          message: "Related alert appended to incident",
          actor,
          metadata: { severity: command.severity }
        }
      };

    case "acknowledge":
      if (current.status === "resolved") {
        throw new Error("Cannot acknowledge a resolved incident");
      }
      return {
        incident: {
          ...current,
          status: "acknowledged",
          acknowledgedAt: now,
          acknowledgedById: actor.id ?? null
        },
        timeline: {
          action: "incident.acknowledged",
          message: `${actor.displayName ?? "Responder"} acknowledged the incident`,
          actor
        }
      };

    case "resolve":
      return {
        incident: {
          ...current,
          status: "resolved",
          resolvedAt: now,
          resolvedById: actor.id ?? null
        },
        timeline: {
          action: "incident.resolved",
          message: `${actor.displayName ?? "Responder"} resolved the incident`,
          actor
        }
      };

    case "reopen":
      return {
        incident: {
          ...current,
          status: "triggered",
          severity: command.severity ? maxSeverity(current.severity, command.severity) : current.severity,
          urgency: command.urgency ?? current.urgency,
          resolvedAt: null,
          resolvedById: null
        },
        timeline: {
          action: "incident.reopened",
          message: "Incident reopened by provider event",
          actor,
          metadata: { severity: command.severity, urgency: command.urgency }
        }
      };

    case "escalate":
      if (current.status === "resolved") {
        throw new Error("Cannot escalate a resolved incident");
      }
      return {
        incident: {
          ...current,
          currentEscalationLevel: current.currentEscalationLevel + 1
        },
        timeline: {
          action: "incident.escalated",
          message: `Incident escalated to level ${current.currentEscalationLevel + 1}`,
          actor
        }
      };

    case "assign":
      if (current.status === "resolved") {
        throw new Error("Cannot assign a resolved incident");
      }
      return {
        incident: {
          ...current,
          assignedToUserId: command.userId
        },
        timeline: {
          action: "incident.assigned",
          message: `Incident assigned to ${command.userName ?? command.userId}`,
          actor,
          metadata: { assignedToUserId: command.userId }
        }
      };
  }
}

const severityRank: Record<Severity, number> = {
  low: 0,
  warning: 1,
  error: 2,
  critical: 3
};

export function maxSeverity(left: Severity, right: Severity): Severity {
  return severityRank[right] > severityRank[left] ? right : left;
}
