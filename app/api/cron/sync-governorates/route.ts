import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { syncGovernoratePricing } from "@/lib/safka/governorate-sync";
import { checkRateLimit, getClientIp } from "@/lib/orders/rate-limit";

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * This route triggers outbound Safka API calls and a multi-row upsert, so it is
 * expensive work for anyone who reaches it. Vercel fires it hourly; the ceiling
 * is far above that so the schedule is never throttled, while a hammering caller
 * is cut off.
 */
const CRON_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * Vercel Cron — hourly refresh of the governorate shipping price list.
 * Scheduled in vercel.json: 0 * * * *.
 *
 * When CRON_SECRET is set, Vercel sends it as a Bearer token; any other
 * caller is rejected. When it is unset (local development) verification is
 * skipped so the route can be exercised manually.
 */
function secretMatches(token: string | undefined, expected: string | undefined): boolean {
  if (!token || !expected) return false;
  const candidate = token.trim();
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

export async function GET(request: Request) {
  const rate = checkRateLimit(`cron-governorates:${getClientIp(request)}`, CRON_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  if (CRON_SECRET) {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!secretMatches(token, CRON_SECRET)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await syncGovernoratePricing();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // Log the real cause server-side; never echo an upstream message (it can
    // carry Supabase/Safka hostnames, SQL fragments or internal ids) to the
    // caller.
    console.error("[cron] governorate sync failed:", error);
    return NextResponse.json(
      { ok: false, error: "Governorate sync failed" },
      { status: 502 },
    );
  }
}