import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const raw = process.env.SECRET_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef";
  const asHex = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : undefined;
  const asBase64 = raw.length >= 43 ? Buffer.from(raw, "base64") : undefined;
  const key = asHex?.byteLength === 32 ? asHex : asBase64?.byteLength === 32 ? asBase64 : Buffer.from(raw).subarray(0, 32);

  if (key.byteLength === 32) {
    return key;
  }

  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(cipherText: string): string {
  if (cipherText.startsWith("env:")) {
    return process.env[cipherText.slice(4)] ?? "";
  }

  const [version, iv, tag, encrypted] = cipherText.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
