import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/orders/rate-limit";
import { getAdminPassword, safeEqualStrings } from "@/lib/admin/session";
import { createAdminSession } from "@/lib/admin/auth";

// Coarse protection: a few attempts per IP per minute. The real barrier is the
// strong password; this just slows scripted guessing.
const LOGIN_LIMIT = { limit: 5, windowMs: 60_000 };

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`admin-login:${ip}`, LOGIN_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "محاولات كثيرة — حاول بعد قليل" },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  const password = getAdminPassword();
  if (!password) {
    return NextResponse.json(
      { ok: false, error: "لوحة التحكم غير مُفعّلة (ADMIN_PASSWORD غير مضبوط)" },
      { status: 500 },
    );
  }

  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const submitted = typeof body?.password === "string" ? body.password : "";
  if (!safeEqualStrings(submitted, password)) {
    return NextResponse.json({ ok: false, error: "كلمة المرور غير صحيحة" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}