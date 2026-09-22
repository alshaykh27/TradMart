import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGES,
  isOrderStatus,
} from "@/lib/admin/orders";
import OrderStatusControl from "@/components/admin/OrderStatusControl";
import SendToSafka from "@/components/admin/SendToSafka";
import DeleteOrderButton from "@/components/admin/DeleteOrderButton";

export const metadata: Metadata = {
  title: "تفاصيل الطلب",
  robots: { index: false, follow: false },
};

const money = (value: number) =>
  value.toLocaleString("ar-EG", { maximumFractionDigits: 2 });

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, customer_name, phone, country, city, governorate, shipping_governorate, address, subtotal, shipping_fee, total, status, safka_order_id, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !order) notFound();

  const { data: items } = await admin
    .from("order_items")
    .select("id, product_id, quantity, price")
    .eq("order_id", id)
    .order("id");

  const productIds = [
    ...new Set(
      (items ?? [])
        .map((item) => item.product_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: products } = productIds.length
    ? await admin.from("products").select("id, name").in("id", productIds)
    : { data: [] as { id: string; name: string }[] };

  const nameById = new Map((products ?? []).map((product) => [product.id, product.name]));

  const statusBanner =
    (isOrderStatus(order.status) && ORDER_STATUS_BADGES[order.status]) ||
    "bg-slate-100 text-slate-700";

  const canSendSafka = process.env.SAFKA_ORDERS_ENABLED === "true";

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString("ar-EG", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href="/admin/orders"
            className="text-sm text-brand hover:underline"
          >
            ← العودة للطلبات
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-navy">
            طلب {order.customer_name}
          </h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusBanner}`}>
          {isOrderStatus(order.status) ? ORDER_STATUS_LABELS[order.status] : order.status}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-soft">
          <h2 className="mb-3 font-bold text-navy">بيانات العميل</h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-navy-soft">الاسم</dt>
              <dd className="font-medium">{order.customer_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-navy-soft">الهاتف</dt>
              <dd dir="ltr" className="text-start font-mono text-xs">
                {order.phone}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-navy-soft">المحافظة</dt>
              <dd className="font-medium">{order.governorate ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-navy-soft">المدينة</dt>
              <dd className="font-medium">{order.city}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-navy-soft">العنوان</dt>
              <dd className="font-medium">{order.address}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-navy-soft">محافظة الإرسال لسافكا (Id)</dt>
              <dd dir="ltr" className="text-start font-mono text-xs text-navy-soft">
                {order.shipping_governorate ?? "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-soft">
          <h2 className="mb-3 font-bold text-navy">الإجماليات</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-navy-soft">إجمالي المنتجات</dt>
              <dd>{money(order.subtotal)} ج.م</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-soft">الشحن</dt>
              <dd>{money(order.shipping_fee)} ج.م</dd>
            </div>
            <div className="flex justify-between border-t border-navy/10 pt-2 text-base">
              <dt className="font-bold text-navy">الإجمالي</dt>
              <dd className="font-extrabold text-brand">{money(order.total)} ج.م</dd>
            </div>
            <div className="flex justify-between text-xs text-navy-soft">
              <dt>أُنشئ</dt>
              <dd>{formatDateTime(order.created_at)}</dd>
            </div>
            <div className="flex justify-between text-xs text-navy-soft">
              <dt>آخر تحديث</dt>
              <dd>{formatDateTime(order.updated_at)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-3xl bg-white p-5 shadow-soft">
        <h2 className="mb-3 font-bold text-navy">المنتجات ({items?.length ?? 0})</h2>
        <ul className="divide-y divide-navy/10">
          {(items ?? []).map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-navy">
                  {nameById.get(item.product_id ?? "") ?? "منتج غير متاح"}
                </p>
                <p className="text-xs text-navy-soft">
                  السعر: {money(item.price)} ج.م · الكمية: {item.quantity}
                </p>
              </div>
              <p className="font-bold text-navy">
                {money(item.price * item.quantity)} ج.م
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-soft">
          <h2 className="mb-3 font-bold text-navy">تحديث الحالة</h2>
          <OrderStatusControl orderId={order.id} initialStatus={order.status} />
        </section>

        {canSendSafka ? (
          <section className="space-y-3">
            <SendToSafka orderId={order.id} currentSafkaId={order.safka_order_id} />
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-navy/20 bg-white/60 p-5 text-sm text-navy-soft">
            إرسال سافكا غير مُفعَّل حاليًا (SAFKA_ORDERS_ENABLED غير مضبوط على
            true). لن يظهر زر الإرسال حتى يُفعَّل — ولا يُرسل أي طلب تلقائيًا.
          </section>
        )}
      </div>

      <section className="rounded-3xl border border-rose-200 bg-white p-5 shadow-soft">
        <h2 className="mb-3 font-bold text-rose-700">منطقة الخطر</h2>
        <DeleteOrderButton orderId={order.id} />
      </section>
    </div>
  );
}