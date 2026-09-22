import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Admin session crypto — pure, dependency-free, no "server-only" import so it
 * is unit-testable with the Node test runner.
 *
 * Sessions are stateless: a cookie holds `<expiresUnixSec>.<hmac-sha256(expires)>`
 * signed with ADMIN_PASSWORD. Verification is timing-safe and expiry-checked.
 * Rotating ADMIN_PASSWORD invalidates every live session (defense in depth).
 */

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Reads the server-side admin password. Returns null when not configured. */
export function getAdminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Timing-safe constant-time comparison of two strings (hashed first). */
export function safeEqualStrings(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Returns a signed cookie value valid for ADMIN_SESSION_TTL_MS. */
export function createSessionToken(secret: string, now: number = Date.now()): string {
  const expires = Math.floor(now / 1000) + Math.floor(ADMIN_SESSION_TTL_MS / 1000);
  return `${expires}.${hmacHex(String(expires), secret)}`;
}

/** Verifies a signed cookie value: format, signature, then expiry. */
export function verifySessionToken(
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const expires = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(expires) || signature.length !== 64) return false;

  const expirySec = Number(expires);
  if (!Number.isSafeInteger(expirySec) || expirySec * 1000 <= now) return false;

  return hexEqual(signature, hmacHex(expires, secret));
}