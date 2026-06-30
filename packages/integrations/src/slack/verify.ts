import { createHmac } from "node:crypto";
import { constantTimeEqual, getHeader } from "../webhooks";

export function verifySlackRequest({
  headers,
  rawBody,
  signingSecret,
  nowSeconds = Math.floor(Date.now() / 1000)
}: {
  headers: Headers | Record<string, string | string[] | undefined>;
  rawBody: string | Buffer;
  signingSecret: string;
  nowSeconds?: number;
}): boolean {
  const timestamp = getHeader(headers, "x-slack-request-timestamp");
  const signature = getHeader(headers, "x-slack-signature");

  if (!timestamp || !signature || !signingSecret) {
    return false;
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(nowSeconds - timestampNumber) > 60 * 5) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody.toString()}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
  return constantTimeEqual(expected, signature);
}
