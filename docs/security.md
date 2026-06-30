# Security

## Webhook verification

- Sentry uses `Sentry-Hook-Signature` / `X-Sentry-Hook-Signature`.
- Nightwatch uses `Nightwatch-Signature`.
- Slack uses `X-Slack-Signature` and `X-Slack-Request-Timestamp`.
- All HMAC checks are made against raw request bodies and compared in constant time.

## Secrets

- Production secrets are stored in environment variables.
- Opsly supports `env:NAME` secret references in seed data.
- Stored secrets can be encrypted with AES-256-GCM through `encryptSecret`.
- Session tokens are stored only as SHA-256 hashes.

## PII and redaction

Provider payloads are redacted before storage. The redactor removes:

- email addresses,
- phone numbers,
- authorization/cookie/token-like values,
- applicant/resume/SSN/DOB-like objects.

Slack cards and dashboard summaries intentionally display source metadata, not full raw payloads.

## RBAC

The schema supports organization roles:

- `owner`
- `admin`
- `responder`
- `viewer`

The first implementation enforces authentication for app pages and can extend route-level authorization by role as admin mutation surfaces expand.
