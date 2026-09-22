import "server-only";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createSessionToken,
  getAdminPassword,
  verifySessionToken,
} from "./session";

/**
 * Server-only session glue (cookie access via next/headers). Every /admin page
 * and /api/admin route goes through these so nothing in the admin panel is
 * reachable without a valid signed session.
 */

const SECURE_COOKIE = process.env.NODE_ENV === "production";

export async function isAdmin(): Promise<boolean> {
  const secret = getAdminPassword();
  if (!secret) return false;
  const jar = await cookies();
  return verifySessionToken(jar.get(ADMIN_SESSION_COOKIE)?.value, secret);
}

export async function createAdminSession(): Promise<void> {
  const secret = getAdminPassword();
  if (!secret) throw new Error("ADMIN_PASSWORD is not configured");
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, createSessionToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_SESSION_COOKIE);
}