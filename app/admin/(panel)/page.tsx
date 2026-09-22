import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  UNSENT_ORDER_GRACE_MINUTES,
  unsentThresholdIso,
} from "@/lib/admin/unsent";

export const metadata: Metadata = {
  title: "لوحة التحكم",
  robots: { index: false, follow: false },
};

const CARD_LINK =
  "rounded-3xl bg-white p-6 shadow-soft transition hover:shadow-lift";

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [pending, published, todaysOrders, unsent] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    admin.from("orders").select("total").gte("created_at", today.toISOString()),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .is("safka_order_id", null)
      .neq("status", "cancelled")
      .lt("created_at", unsentThresholdIso()),
  ]);

  const pendingCount = pending.count ?? 0;
  const publishedCount = published.count ?? 0;
  const todayCount = todaysOrders.data?.length ?? 0;
  const unsentCount = unsent.count ?? 0;
  const todayRevenue =
    (todaysOrders.data ?? []).reduce((sum, order) => sum + Number(order.total), 0) || 0;

  const money = (value: number) =>
    value.toLocaleString("ar-EG", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">نظرة عامة</h1>
        <p className="mt-1 text-sm text-navy-soft">ملخص سريع لمتجرك اليوم.</p>
      </header>

      {unsentCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-rose-600 px-5 py-4 text-white shadow-lift">
          <div>
            <p className="text-xl font-extrabold">
              طلبات لم تُرسل إلى سافكا بعد: {money(unsentCount)}
            </p>
            <p className="mt-0.5 text-sm text-rose-100">
              قديمة بأكثر من {UNSENT_ORDER_GRACE_MINUTES} دقيقة بدون رقم أمر
              سافكا — افتحها وأرسلها يدويًا.
            </p>
          </div>
          <Link
            href="/admin/orders?unsent=1"
            className="shrink-0 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50"
          >
            عرض الطلبات
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/orders" className={CARD_LINK}>
          <p className="text-sm font-semibold text-navy-soft">طلبات قيد الانتظار</p>
          <p className="mt-2 text-3xl font-extrabold text-navy">{money(pendingCount)}</p>
          <p className="mt-1 text-xs text-brand">تصفّح الطلبات</p>
        </Link>

        <Link href="/admin/products" className={CARD_LINK}>
          <p className="text-sm font-semibold text-navy-soft">منتجات منشورة</p>
          <p className="mt-2 text-3xl font-extrabold text-navy">{money(publishedCount)}</p>
          <p className="mt-1 text-xs text-brand">إدارة المنتجات</p>
        </Link>

        <div className={CARD_LINK}>
          <p className="text-sm font-semibold text-navy-soft">طلبات اليوم</p>
          <p className="mt-2 text-3xl font-extrabold text-navy">{money(todayCount)}</p>
        </div>

        <div className={CARD_LINK}>
          <p className="text-sm font-semibold text-navy-soft">إيراد اليوم (ج.م)</p>
          <p className="mt-2 text-3xl font-extrabold text-brand">
            {money(todayRevenue)}
          </p>
        </div>
      </div>
    </div>
  );
}