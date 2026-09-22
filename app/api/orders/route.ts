import { NextResponse } from "next/server";
import { createOrder, OrderValidationError } from "@/lib/orders/create";
import { orderRequestSchema, isHoneypotFilled } from "@/lib/orders/schema";
import { checkRateLimit, getClientIp } from "@/lib/orders/rate-limit";

// Per-IP sliding window. In-memory by design (see lib/orders/rate-limit.ts).
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * POST /api/orders — place a cash-on-delivery order.
 *
 * The payload carries only customer details + { productId, qty } line items.
 * Prices are never accepted from the browser; lib/orders/create re-prices
 * everything from the DB.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`orders:${ip}`, RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts, please try again later" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = orderRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }

  // Honeypot: a bot that autofills every field gets a fake success so it never
  // learns the trick, while no order is created.
  if (isHoneypotFilled(parsed.data.website)) {
    return NextResponse.json({ ok: true, id: null, total: 0 }, { status: 201 });
  }

  try {
    const { orderId, total } = await createOrder({
      customerName: parsed.data.customerName,
      phone: parsed.data.phone,
      country: parsed.data.country,
      city: parsed.data.city,
      shippingGovernorate: parsed.data.shippingGovernorate,
      address: parsed.data.address,
      items: parsed.data.items,
    });
    return NextResponse.json({ ok: true, id: orderId, total }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ ok: false, error: "Order could not be placed" }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}