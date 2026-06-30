import { getHeader, verifyRawBodyHmacSha256 } from "../webhooks";

export function verifyNightwatchWebhook({
  headers,
  rawBody,
  secret
}: {
  headers: Headers | Record<string, string | string[] | undefined>;
  rawBody: string | Buffer;
  secret: string;
}): boolean {
  const signature = getHeader(headers, "nightwatch-signature");
  return verifyRawBodyHmacSha256({ secret, rawBody, signature });
}
