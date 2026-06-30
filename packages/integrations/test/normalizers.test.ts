import { describe, expect, it } from "vitest";
import { normalizeNightwatchPayload } from "../src/nightwatch/normalize";
import { normalizeSentryPayload } from "../src/sentry/normalize";
import { parseOpslyCommand } from "../src/slack/commands";

describe("provider normalizers", () => {
  it("normalizes ROWS frontend Sentry issues", () => {
    const signal = normalizeSentryPayload({
      action: "created",
      data: {
        project: { slug: "rows-frontend-dev" },
        issue: {
          id: "7582700974",
          shortId: "ROWS-FRONTEND-DEV-1K",
          title: "Objects are not valid as a React child",
          culprit: "/applications",
          level: "error",
          environment: "amethyst",
          web_url: "https://rows.sentry.io/issues/7582700974/"
        }
      }
    });

    expect(signal.provider).toBe("sentry");
    expect(signal.serviceHints.serviceSlug).toBe("rows-frontend");
    expect(signal.environment).toBe("amethyst");
    expect(signal.dedupeKey).toContain("ROWS-FRONTEND-DEV-1K");
  });

  it("normalizes ROWS backend Nightwatch slow routes", () => {
    const signal = normalizeNightwatchPayload({
      event: "issue.opened",
      timestamp: "2026-06-29T22:19:32.000000Z",
      payload: {
        application: {
          id: "9f2c42c9-d339-4b43-8eac-00e04871c794",
          name: "Rows Backend"
        },
        environment: "Test",
        issue: {
          id: "521",
          type: "slow_route",
          title: "Slow Route #521 detected in Rows Backend",
          message: "GET|HEAD /api/job-applications/{jobApplication}/hiring-stages/withholding-federal/candidate/form exceeded 4,000ms threshold",
          duration_ms: 4357,
          threshold_ms: 4000
        }
      }
    });

    expect(signal.provider).toBe("nightwatch");
    expect(signal.serviceHints.serviceSlug).toBe("rows-backend");
    expect(signal.severity).toBe("warning");
    expect(signal.rawSummary.route).toContain("/api/job-applications");
  });
});

describe("Slack command parser", () => {
  it("parses incident lifecycle commands", () => {
    expect(parseOpslyCommand("ack 123")).toEqual({ type: "ack", incidentRef: "123" });
    expect(parseOpslyCommand("resolve 123 deployed fix")).toEqual({
      type: "resolve",
      incidentRef: "123",
      note: "deployed fix"
    });
  });
});
