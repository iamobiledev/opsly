import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, rawBody: string | Buffer): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyRawBodyHmacSha256({
  secret,
  rawBody,
  signature
}: {
  secret: string;
  rawBody: string | Buffer;
  signature: string | null | undefined;
}): boolean {
  if (!secret || !signature) {
    return false;
  }

  return constantTimeEqual(hmacSha256Hex(secret, rawBody), signature);
}

export function getHeader(headers: Headers | Record<string, string | string[] | undefined>, name: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
  }

  const direct = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(direct) ? direct[0] : direct;
}
