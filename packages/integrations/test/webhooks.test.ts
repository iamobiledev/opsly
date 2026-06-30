import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyNightwatchWebhook } from "../src/nightwatch/verify";
import { verifySentryWebhook } from "../src/sentry/verify";
import { verifySlackRequest } from "../src/slack/verify";

describe("webhook signatures", () => {
  it("verifies Sentry raw-body HMAC signatures", () => {
    const rawBody = JSON.stringify({ action: "created", data: { issue: { id: "1" } } });
    const secret = "sentry-secret";
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(
      verifySentryWebhook({
        headers: { "sentry-hook-signature": signature },
        rawBody,
        secret
      })
    ).toBe(true);

    expect(
      verifySentryWebhook({
        headers: { "sentry-hook-signature": signature },
        rawBody: JSON.stringify(JSON.parse(rawBody), null, 2),
        secret
      })
    ).toBe(false);
  });

  it("verifies Nightwatch signatures", () => {
    const rawBody = JSON.stringify({ event: "issue.opened", payload: { issue: { id: "521" } } });
    const secret = "nightwatch-secret";
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(
      verifyNightwatchWebhook({
        headers: { "nightwatch-signature": signature },
        rawBody,
        secret
      })
    ).toBe(true);
  });

  it("verifies Slack signatures and rejects stale requests", () => {
    const rawBody = "text=incidents";
    const signingSecret = "slack-secret";
    const timestamp = 1782828000;
    const base = `v0:${timestamp}:${rawBody}`;
    const signature = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

    expect(
      verifySlackRequest({
        headers: {
          "x-slack-request-timestamp": String(timestamp),
          "x-slack-signature": signature
        },
        rawBody,
        signingSecret,
        nowSeconds: timestamp
      })
    ).toBe(true);

    expect(
      verifySlackRequest({
        headers: {
          "x-slack-request-timestamp": String(timestamp),
          "x-slack-signature": signature
        },
        rawBody,
        signingSecret,
        nowSeconds: timestamp + 600
      })
    ).toBe(false);
  });
});
