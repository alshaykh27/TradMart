import { NextResponse } from "next/server";
import { createOrder, OrderValidationError } from "@/lib/orders/create";
import { orderRequestSchema, isHoneypotFilled } from "@/lib/orders/schema";
import { checkRateLimit, getClientIp } from "@/lib/orders/rate-limit";
import { buildMetaUserData } from "@/lib/marketing/payloads";
import { sendServerMarketingEvent } from "@/lib/marketing/server-events";

// Per-IP sliding window. In-memory by design (see lib/orders/rate-limit.ts).
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * POST /api/orders — place a cash-on-delivery order.
 *
 * The payload carries only customer details + { productId, qty } line items.
 * Prices are never accepted from the browser; lib/orders/create re-prices
 * everything from the DB.
 *
 * On success this also fires the server half of the Purchase event (Meta
 * Conversions API + TikTok Events API) using the SAME eventId that is returned
 * to the browser, so the two halves deduplicate into a single conversion. The
 * send is best-effort and cannot fail an order that is already persisted.
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
  // learns the trick, while no order is created. No tracking event either —
  // there is no order to attribute.
  if (isHoneypotFilled(parsed.data.website)) {
    return NextResponse.json({ ok: true, id: null, total: 0 }, { status: 201 });
  }

  try {
    const order = await createOrder({
      customerName: parsed.data.customerName,
      phone: parsed.data.phone,
      country: parsed.data.country,
      cityId: parsed.data.cityId || null,
      shippingGovernorate: parsed.data.shippingGovernorate,
      address: parsed.data.address,
      items: parsed.data.items,
    });

    // Best-effort, and deliberately NOT awaited: the customer's order is
    // already persisted, so the response must not wait on two ad networks.
    void sendPurchaseEvent(
      {
        orderId: order.orderId,
        eventId: order.eventId,
        total: order.total,
        currency: order.currency,
        items: order.items,
        phone: parsed.data.phone,
        customerName: parsed.data.customerName,
      },
      request,
      ip,
    ).catch(() => {
      // sendServerMarketingEvent already logs; never surface this.
    });

    return NextResponse.json(
      { ok: true, id: order.orderId, total: order.total, eventId: order.eventId },
      { status: 201 },
    );
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

async function sendPurchaseEvent(
  order: {
    orderId: string;
    eventId: string;
    total: number;
    currency: "EGP";
    items: { productId: string; qty: number }[];
    phone: string;
    customerName: string;
  },
  request: Request,
  ip: string,
): Promise<void> {
  const numItems = order.items.reduce((sum, item) => sum + item.qty, 0);

  await sendServerMarketingEvent({
    eventName: "Purchase",
    eventId: order.eventId,
    eventSourceUrl: request.headers.get("referer") ?? null,
    currency: order.currency,
    value: order.total,
    numItems,
    contentIds: order.items.map((item) => item.productId),
    // Phone and name are SHA-256 hashed by buildMetaUserData; the raw values
    // are not sent. TikTok receives no user data at all.
    userData: buildMetaUserData({
      phone: order.phone,
      customerName: order.customerName,
      ip,
      userAgent: request.headers.get("user-agent"),
    }),
  });
}
