import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SETTINGS_ID } from "@/lib/settings";

/** PATCH /api/admin/settings — edit shipping_markup (EGP added to Safka fee). */
export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  let body: { shippingMarkup?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const value = body?.shippingMarkup;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return NextResponse.json({ ok: false, error: "القيمة غير صالحة" }, { status: 422 });
  }
  if (value < 0 || value > 1000) {
    return NextResponse.json({ ok: false, error: "الزيادة خارج النطاق" }, { status: 422 });
  }

  const shippingMarkup = Math.round(value * 100) / 100;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settings")
    .update({ shipping_markup: shippingMarkup })
    .eq("id", SETTINGS_ID)
    .select("shipping_markup")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "تعذّر الحفظ" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, shippingMarkup: Number(data.shipping_markup) });
}