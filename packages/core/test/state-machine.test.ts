import { describe, expect, it } from "vitest";
import { transitionIncident } from "../src/incidents/state-machine";

describe("incident state machine", () => {
  it("acknowledges and resolves an incident with actor timeline entries", () => {
    const acknowledged = transitionIncident(
      {
        status: "triggered",
        severity: "error",
        urgency: "error",
        currentEscalationLevel: 0
      },
      { type: "acknowledge" },
      { type: "user", id: "user_1", displayName: "Allen" },
      new Date("2026-06-30T12:00:00.000Z")
    );

    expect(acknowledged.incident.status).toBe("acknowledged");
    expect(acknowledged.incident.acknowledgedById).toBe("user_1");
    expect(acknowledged.timeline.action).toBe("incident.acknowledged");

    const resolved = transitionIncident(
      acknowledged.incident,
      { type: "resolve" },
      { type: "user", id: "user_1", displayName: "Allen" },
      new Date("2026-06-30T12:05:00.000Z")
    );

    expect(resolved.incident.status).toBe("resolved");
    expect(resolved.incident.resolvedById).toBe("user_1");
  });

  it("escalates non-resolved incidents and rejects resolved escalations", () => {
    const escalated = transitionIncident(
      {
        status: "triggered",
        severity: "critical",
        urgency: "critical",
        currentEscalationLevel: 1
      },
      { type: "escalate" },
      { type: "system" }
    );

    expect(escalated.incident.currentEscalationLevel).toBe(2);

    expect(() =>
      transitionIncident(
        {
          status: "resolved",
          severity: "critical",
          urgency: "critical",
          currentEscalationLevel: 1
        },
        { type: "escalate" },
        { type: "system" }
      )
    ).toThrow("Cannot escalate");
  });
});
