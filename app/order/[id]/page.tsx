import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultLocale, getDictionary } from "@/i18n";

export const metadata: Metadata = {
  title: "تأكيد الطلب",
  description: "تم استلام طلبك بنجاح.",
};

function formatPrice(value: number): string {
  return value.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

export default async function OrderPage({ params }: PageProps<"/order/[id]">) {
  const { id } = await params;
  const dict = getDictionary(defaultLocale);
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, customer_name, phone, country, city, governorate, address, subtotal, shipping_fee, total, status, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    notFound();
  }

  const { data: items } = await admin
    .from("order_items")
    .select("product_id, quantity, price")
    .eq("order_id", id);

  const productIds = [
  ...new Set((items ?? []).map((item) => item.product_id).filter((value): value is string => Boolean(value))),
];
  const { data: products } = productIds.length
    ? await admin.from("products").select("id, name").in("id", productIds)
    : { data: [] };

  const nameById = new Map((products ?? []).map((product) => [product.id, product.name]));

  const shortId = order.id.slice(0, 8);

  return (
    <>
      <Header dict={dict} />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto flex size-16 place-items-center rounded-full bg-success/10 text-success">
            <svg className="mx-auto" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12.5l5 5L20 6.5" />
            </svg>
          </div>

          <div className="mt-5 text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
              {dict.order.successTitle}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 sm:text-base">
              {dict.order.successBody}
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-card border border-slate-200/80 bg-white shadow-soft">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {dict.order.orderNumber}
              </p>
              <p className="mt-1 text-lg font-extrabold text-navy" dir="ltr">
                #{shortId}
              </p>
            </div>

            <dl className="grid gap-x-8 gap-y-4 px-6 py-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {dict.checkout.name}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{order.customer_name}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {dict.checkout.phone}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800" dir="ltr">
                  {order.phone}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {dict.checkout.city}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">
                  {[order.city, order.governorate, order.country]
                    .filter((part): part is string => Boolean(part))
                    .join("، ")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {dict.checkout.address}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{order.address}</dd>
              </div>
            </dl>

            <ul className="border-t border-slate-100 px-6 py-4">
              {(items ?? []).map((item, index) => (
                <li
                  key={item.product_id ?? index}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="line-clamp-2 text-sm font-semibold text-slate-800">
                    {item.product_id ? nameById.get(item.product_id) ?? "—" : "—"}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-slate-500">
                    {formatPrice(Number(item.price))} {dict.products.currency} × {item.quantity}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-t border-slate-100 px-6 py-4">
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-sm font-bold text-slate-700">{dict.cart.subtotal}</span>
                <span className="text-sm font-bold text-slate-800">
                  {formatPrice(Number(order.subtotal))} {dict.products.currency}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-sm font-bold text-slate-700">{dict.cart.shipping}</span>
                <span className="text-sm font-bold text-slate-800">
                  {formatPrice(Number(order.shipping_fee))} {dict.products.currency}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-100 py-3">
                <span className="text-base font-extrabold text-navy">{dict.cart.total}</span>
                <span className="text-xl font-extrabold text-brand">
                  {formatPrice(Number(order.total))}
                  <span className="ms-1 text-sm font-medium text-slate-500">
                    {dict.products.currency}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm leading-6 text-slate-500">{dict.order.paymentNote}</p>
            <Link
              href="/products"
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-navy px-8 text-base font-bold text-white transition-colors hover:bg-brand"
            >
              {dict.order.continue}
            </Link>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}