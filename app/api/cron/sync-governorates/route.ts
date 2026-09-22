import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { syncGovernoratePricing } from "@/lib/safka/governorate-sync";

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

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
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}