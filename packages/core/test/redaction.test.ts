import { describe, expect, it } from "vitest";
import { redactPayload, redactText } from "../src/redaction";

describe("redaction", () => {
  it("redacts common PII from text", () => {
    expect(redactText("Contact jane@example.com or 212-555-0101")).toBe(
      "Contact [REDACTED_EMAIL] or [REDACTED_PHONE]"
    );
  });

  it("redacts Nightwatch-like applicant payloads and secrets", () => {
    const redacted = redactPayload({
      headers: {
        authorization: "Bearer super-secret-token",
        cookie: "session=secret"
      },
      context: {
        applicant: {
          fullName: "Jane Candidate",
          email: "jane@example.com",
          phoneNumber: "212-555-0101",
          resume: { file: { data: "base64-pdf-data" } }
        },
        route: "/api/job-applications/1"
      }
    });

    expect(redacted).toMatchObject({
      headers: {
        authorization: "[REDACTED_SECRET]",
        cookie: "[REDACTED_SECRET]"
      },
      context: {
        applicant: "[REDACTED_OBJECT]",
        route: "/api/job-applications/1"
      }
    });
  });
});
