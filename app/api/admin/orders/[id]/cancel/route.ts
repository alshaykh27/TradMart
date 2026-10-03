import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleCancelOrder,
  type CancelOrderDbClient,
} from "@/lib/admin/cancel-order";

/**
 * POST /api/admin/orders/[id]/cancel — marks an order "ملغي".
 *
 * This is the ONLY way to reach the cancelled status: PATCH
 * /api/admin/orders/[id] rejects it so the confirm step and the Safka warning
 * in the UI can never be bypassed.
 *
 * Cancellation is local only — there is no confirmed Safka cancel-order API.
 * When the order was already forwarded, the response carries a warning telling
 * the merchant to cancel it in Safka's own dashboard.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  // The cast is the seam that keeps handleCancelOrder unit-testable: the handler
  // declares the two query shapes it uses, while supabase-js returns a far
  // wider generic builder chain that TypeScript cannot relate structurally
  // without instantiating the whole client type. handleDeleteOrder needs the
  // same treatment for the same reason.
  const outcome = await handleCancelOrder({
    isAdmin: await isAdmin(),
    client: createAdminClient() as unknown as CancelOrderDbClient,
    orderId: id,
  });

  return NextResponse.json(outcome.body, { status: outcome.status });
}