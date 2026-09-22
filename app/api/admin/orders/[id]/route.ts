import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOrderStatus } from "@/lib/admin/orders";
import { handleDeleteOrder } from "@/lib/admin/delete-order";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const status = body?.status;
  if (typeof status !== "string" || !isOrderStatus(status)) {
    return NextResponse.json({ ok: false, error: "حالة غير صالحة" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .update({ status })
    .eq("id", id)
    .select("id, status, updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "الطلب غير موجود" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, order: data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const outcome = await handleDeleteOrder({
    isAdmin: await isAdmin(),
    client: createAdminClient(),
    orderId: id,
  });
  return NextResponse.json(outcome.body, { status: outcome.status });
}