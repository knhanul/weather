import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

function secret(): Buffer {
  const raw =
    process.env.WEATHER_HUB_SECRET ||
    process.env.DATABASE_URL ||
    "weather-hub-preview-secret-not-for-production";
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", secret(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function checksum(value: string): string {
  return sha256Hex(value);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function hintOf(value: string): string {
  if (value.length <= 4) return "****";
  return `····${value.slice(-4)}`;
}

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const body = randomToken(24);
  const plaintext = `whub_${body}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    hash: sha256Hex(plaintext),
  };
}
