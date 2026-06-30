import { getHeader, verifyRawBodyHmacSha256 } from "../webhooks";

export function verifySentryWebhook({
  headers,
  rawBody,
  secret
}: {
  headers: Headers | Record<string, string | string[] | undefined>;
  rawBody: string | Buffer;
  secret: string;
}): boolean {
  const signature = getHeader(headers, "sentry-hook-signature") ?? getHeader(headers, "x-sentry-hook-signature");
  return verifyRawBodyHmacSha256({ secret, rawBody, signature });
}

export function sentryRequestId(headers: Headers | Record<string, string | string[] | undefined>): string | undefined {
  return getHeader(headers, "request-id") ?? getHeader(headers, "sentry-hook-request-id");
}
