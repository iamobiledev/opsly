const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
const TOKEN_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[_-]?key|signature|session)/i;
const PII_KEY_PATTERN = /(email|phone|resume|applicant|fullName|phoneNumber|request_body|data|ssn|dob)/i;

export function redactText(value: string): string {
  return value.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]").replace(PHONE_PATTERN, "[REDACTED_PHONE]");
}

export function redactPayload<T>(payload: T): T {
  return redactUnknown(payload) as T;
}

function redactUnknown(value: unknown, keyHint = "", depth = 0): unknown {
  if (depth > 12) {
    return "[REDACTED_MAX_DEPTH]";
  }

  if (typeof value === "string") {
    if (TOKEN_KEY_PATTERN.test(keyHint)) {
      return "[REDACTED_SECRET]";
    }
    if (PII_KEY_PATTERN.test(keyHint) && value.length > 24) {
      return "[REDACTED_PII]";
    }
    return redactText(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    if (PII_KEY_PATTERN.test(keyHint)) {
      return "[REDACTED_ARRAY]";
    }
    return value.map((entry) => redactUnknown(entry, keyHint, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        if (TOKEN_KEY_PATTERN.test(key)) {
          return [key, "[REDACTED_SECRET]"];
        }
        if (PII_KEY_PATTERN.test(key) && typeof entry === "object" && entry !== null) {
          return [key, "[REDACTED_OBJECT]"];
        }
        return [key, redactUnknown(entry, key, depth + 1)];
      })
    );
  }

  return "[REDACTED_UNSUPPORTED]";
}
