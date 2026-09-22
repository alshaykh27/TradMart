import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsentThresholdIso } from "@/lib/admin/unsent";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGES,
  isOrderStatus,
} from "@/lib/admin/orders";

export const metadata: Metadata = {
  title: "الطلبات",
  robots: { index: false, follow: false },
};

const PER_PAGE = 20;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const money = (value: number) =>
  value.toLocaleString("ar-EG", { maximumFractionDigits: 2 });

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    governorate?: string;
    page?: string;
    deleted?: string;
    unsent?: string;
  }>;
}) {
  const params = await searchParams;
  const status = isOrderStatus(params.status ?? "") ? params.status : "";
  const governorate =
    typeof params.governorate === "string" ? params.governorate.trim() : "";
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const unsent = params.unsent === "1";

  const admin = createAdminClient();

  let query = admin
    .from("orders")
    .select(
      "id, customer_name, phone, governorate, city, total, shipping_fee, status, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

  if (status) query = query.eq("status", status);
  if (governorate) query = query.eq("governorate", governorate);
  if (unsent) {
    query = query
      .is("safka_order_id", null)
      .neq("status", "cancelled")
      .lt("created_at", unsentThresholdIso());
  }

  const [{ data: orders, count, error }, { data: governorates }] = await Promise.all([
    query,
    admin.from("governorate_pricing").select("name_ar").order("name_ar"),
  ]);

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  const href = (extra: Record<string, string>) => {
    const queryString = new URLSearchParams();
    if (status) queryString.set("status", status);
    if (governorate) queryString.set("governorate", governorate);
    if (unsent) queryString.set("unsent", "1");
    for (const [key, value] of Object.entries(extra)) queryString.set(key, value);
    const raw = queryString.toString();
    return raw ? `/admin/orders?${raw}` : "/admin/orders";
  };

  const selectClass =
    "rounded-xl border border-navy/15 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-brand";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">الطلبات</h1>
        <p className="mt-1 text-sm text-navy-soft">الأحدث أولًا ({total} طلب).</p>
      </header>

      {params.deleted === "1" ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          تم حذف الطلب بنجاح.
        </p>
      ) : null}

      {unsent ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          عرض الطلبات غير المُرسلة إلى سافكا (بدون رقم أمر، وأقدم من 30 دقيقة،
          وغير مُلغاة).
        </p>
      ) : null}

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-3xl bg-white p-4 shadow-soft"
      >
        <label className="flex flex-col gap-1 text-xs font-semibold text-navy-soft">
          الحالة
          <select name="status" defaultValue={status} className={selectClass}>
            <option value="">الكل</option>
            {ORDER_STATUSES.map((option) => (
              <option key={option} value={option}>
                {ORDER_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-navy-soft">
          المحافظة
          <select name="governorate" defaultValue={governorate} className={selectClass}>
            <option value="">الكل</option>
            {(governorates ?? []).map((gov) => (
              <option key={gov.name_ar} value={gov.name_ar}>
                {gov.name_ar}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 self-end text-xs font-semibold text-navy-soft">
          <input
            type="checkbox"
            name="unsent"
            value="1"
            defaultChecked={unsent}
            className="h-4 w-4 rounded border-navy/20 accent-brand"
          />
          لم تُرسل إلى سافكا بعد
        </label>

        <button
          type="submit"
          className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-dark"
        >
          تصفية
        </button>
        {status || governorate || unsent ? (
          <Link
            href="/admin/orders"
            className="rounded-2xl border border-navy/15 px-4 py-2 text-sm text-navy-soft hover:bg-brand-soft"
          >
            مسح التصفية
          </Link>
        ) : null}
      </form>

      {error || !orders ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          تعذّر تحميل الطلبات.
        </p>
      ) : orders.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-navy-soft shadow-soft">
          لا توجد طلبات مطابقة.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const badge = ORDER_STATUS_BADGES[order.status as (typeof ORDER_STATUSES)[number]] ??
              "bg-slate-100 text-slate-700";
            return (
              <li
                key={order.id}
                className="rounded-3xl bg-white p-4 shadow-soft transition hover:shadow-lift"
              >
                <Link href={`/admin/orders/${order.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-navy">
                        {order.customer_name}
                      </p>
                      <p dir="ltr" className="mt-0.5 font-mono text-xs text-navy-soft">
                        {order.phone}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}
                    >
                      {isOrderStatus(order.status) ? ORDER_STATUS_LABELS[order.status] : order.status}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-navy-soft">المحافظة</dt>
                      <dd className="font-medium text-navy">
                        {order.governorate ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-navy-soft">المدينة</dt>
                      <dd className="truncate font-medium text-navy">
                        {order.city}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-navy-soft">الشحن</dt>
                      <dd className="font-medium text-navy">
                        {money(order.shipping_fee)} ج.م
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-navy-soft">الإجمالي</dt>
                      <dd className="font-bold text-brand">{money(order.total)} ج.م</dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-xs text-navy-soft">
                    {formatDate(order.created_at)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={href({ page: String(page - 1) })}
              className="rounded-2xl border border-navy/15 px-4 py-2 text-navy-soft hover:bg-brand-soft"
            >
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="text-navy-soft">
            صفحة {page} من {pages}
          </span>
          {page < pages ? (
            <Link
              href={href({ page: String(page + 1) })}
              className="rounded-2xl border border-navy/15 px-4 py-2 text-navy-soft hover:bg-brand-soft"
            >
              التالي
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}