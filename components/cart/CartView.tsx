"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/components/cart/CartProvider";
import { createClient } from "@/lib/supabase/client";
import { trackMarketingEvent } from "@/lib/marketing/browser";
import { allLinesFolded, shippingFoldApplied, storefrontPrice } from "@/lib/products/pricing";
import { withFoldFallback } from "@/lib/products/fold-columns";
import type { Dictionary } from "@/i18n";

type GovernorateOption = {
  governorate_id: string;
  name_ar: string;
  safka_shipping_fee: number;
};

/** One row of `safka_cities` — Safka's own numeric city ids, per governorate. */
type CityOption = {
  city_id: string;
  governorate_id: string;
  name_ar: string;
};

type LineProduct = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  stock: number | null;
  /** "Free shipping" fold columns, read with the base price for the rule. */
  shipping_included: boolean;
  shipping_fold: number | null;
};

type CheckoutForm = {
  customerName: string;
  phone: string;
  country: string;
  shippingGovernorate: string;
  /**
   * Safka price-list city id (not the name): the checkout only ever offers ids
   * from `safka_cities`, and empty means "no city", which the server omits from
   * the Safka payload rather than sending free text.
   */
  cityId: string;
  address: string;
  website: string;
};

const EMPTY_FORM: CheckoutForm = {
  customerName: "",
  phone: "",
  country: "Egypt",
  shippingGovernorate: "",
  cityId: "",
  address: "",
  website: "",
};

export default function CartView({ dict }: { dict: Dictionary }) {
  const { items, count, setQty, remove, reset } = useCart();
  const router = useRouter();

  const [products, setProducts] = useState<LineProduct[]>([]);
  const [loadedKey, setLoadedKey] = useState<string>("");
  const [governorates, setGovernorates] = useState<GovernorateOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ids = useMemo(() => items.map((item) => item.productId), [items]);
  const idsKey = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) return;

    const supabase = createClient();
    withFoldFallback(
      () =>
        supabase
          .from("products")
          .select("id, name, price, image_url, stock, shipping_included, shipping_fold")
          .eq("is_published", true)
          .in("id", ids),
      () =>
        supabase
          .from("products")
          .select("id, name, price, image_url, stock")
          .eq("is_published", true)
          .in("id", ids),
    ).then(({ data, error }) => {
      if (cancelled) return;
      setProducts(error ? [] : (data ?? []));
      setLoadedKey(idsKey);
    });

    return () => {
      cancelled = true;
    };
  }, [ids, idsKey]);

  // Governorate shipping fees come from the synced Safka price list
  // (governorate_pricing); the customer picks one of these values.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("governorate_pricing")
      .select("governorate_id, name_ar, safka_shipping_fee")
      .order("name_ar")
      .then(({ data, error }) => {
        if (cancelled) return;
        setGovernorates(error ? [] : (data ?? []));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Safka city ids live in `safka_cities`, written by the same sync that fills
  // governorate_pricing (Safka exposes no cities endpoint of its own). Fetched
  // once — 418 rows — and filtered by the chosen governorate in the form.
  // If this fails (table not migrated yet, RLS, network) the city select is
  // simply absent-optional: the order still submits and Safka omits `city`.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("safka_cities")
      .select("city_id, governorate_id, name_ar")
      .order("name_ar")
      .then(({ data, error }) => {
        if (cancelled) return;
        setCities(error ? [] : (data ?? []));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const lines = useMemo(
    () =>
      items
        .map((item) => {
          const product = productById.get(item.productId);
          if (!product) return null;
          const price = Number(product.price);
          // Display price: base + folded shipping. The ORDER the customer
          // places still prices from the base — the fold only changes what the
          // cart and leader display.
          const displayPrice = storefrontPrice(
            price,
            product.shipping_included,
            product.shipping_fold,
          );
          return {
            ...item,
            ...product,
            displayPrice,
            lineTotal: displayPrice * item.qty,
          };
        })
        .filter((line): line is NonNullable<typeof line> => line !== null),
    [items, productById],
  );

  // "Free shipping" is all-or-nothing per the merchant's rule: the cart shows
  // 0 shipping ONLY while every line is folded. A single non-folded item brings
  // the real per-governorate fee back.
  const shippingFree = allLinesFolded(lines.map((line) => line.shipping_included));

  const unavailable = useMemo(
    () =>
      items.map((item) => ({
        productId: item.productId,
        missing: loadedKey !== idsKey || !productById.has(item.productId),
        out: (productById.get(item.productId)?.stock ?? 0) <= 0,
      })),
    [items, loadedKey, idsKey, productById],
  );

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  const formattedSubtotal = subtotal.toLocaleString("ar-EG", {
    maximumFractionDigits: 2,
  });

  const selectedGovernorate = governorates.find(
    (governorate) => governorate.governorate_id === form.shippingGovernorate,
  );
  const shippingEstimate = selectedGovernorate?.safka_shipping_fee ?? 0;
  // Free shipping (all lines folded) is independent of the governorate: show it
  // right away instead of the "—" placeholder the pick still triggers today.
  const shippingCharge = shippingFree ? 0 : shippingEstimate;
  const formattedShipping = shippingCharge.toLocaleString("ar-EG", {
    maximumFractionDigits: 2,
  });
  const formattedTotal = (subtotal + shippingCharge).toLocaleString("ar-EG", {
    maximumFractionDigits: 2,
  });

  const setField = (name: keyof CheckoutForm, value: string) =>
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // Cities belong to exactly one governorate, so the previous choice is no
      // longer valid the moment the governorate changes. Clearing it keeps a
      // foreign city id from ever being submitted.
      if (name === "shippingGovernorate" && next.cityId !== "") {
        next.cityId = "";
      }
      return next;
    });

  // InitiateCheckout: fired once when the cart page is opened with items in it.
  // Mounted here rather than in app/cart/page.tsx because the line data is
  // fetched client-side, so only the client component knows the totals. It must
  // be rendered before the empty-cart early return below. A ref (not state) is
  // the guard: it records that the side effect ran without triggering the
  // cascading render that setState-in-effect would cause.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || items.length === 0 || lines.length === 0) return;
    checkoutTracked.current = true;
    trackMarketingEvent("InitiateCheckout", {
      contentIds: lines.map((line) => line.id),
      value: subtotal,
      numItems: count,
    });
  }, [items.length, lines, subtotal, count]);

  // "اطلب الآن" navigates here with #checkout. On mobile the line items sit
  // above the form, so once they finish loading (the form only exists after
  // that) pull it into view. On desktop the form is already beside the lines,
  // so leave the scroll alone.
  const checkoutJumped = useRef(false);
  useEffect(() => {
    if (checkoutJumped.current || items.length === 0 || lines.length === 0) return;
    if (typeof window === "undefined" || window.location.hash !== "#checkout") return;
    checkoutJumped.current = true;
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      document.getElementById("checkout")?.scrollIntoView({ block: "start" });
    }
  }, [items.length, lines.length]);

  function placeOrder() {
    startTransition(async () => {
      setError(null);

      if (!form.customerName.trim() || !form.phone.trim() || !form.phone.match(/^[+0-9][0-9()\s-]{5,19}$/)) {
        setError(dict.checkout.invalidDetails);
        return;
      }
      // `cityId` is deliberately NOT required: `city` is optional in Safka's
      // contract, and a missing or unusable id must let the order through with
      // the field omitted rather than block checkout.
      if (!form.country.trim() || !form.shippingGovernorate.trim() || !form.address.trim()) {
        setError(dict.checkout.invalidDetails);
        return;
      }

      const payload = {
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        shippingGovernorate: form.shippingGovernorate.trim(),
        cityId: form.cityId.trim(),
        address: form.address.trim(),
        website: form.website.trim(),
        items: items.map((item) => ({ productId: item.productId, qty: item.qty })),
      };

      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as {
          ok?: boolean;
          id?: string;
          total?: number;
          eventId?: string;
          error?: string;
        };

        if (!response.ok || !result.ok || !result.id) {
          setError(result.error ?? dict.checkout.genericError);
          return;
        }

        // Browser half of Purchase. eventId comes from the server, which used
        // the SAME value for the Conversions API / TikTok Events API send, so
        // the platform deduplicates the pair into one conversion. The server
        // total is authoritative; the cart's own total omits the shipping
        // markup the server adds.
        trackMarketingEvent("Purchase", {
          eventId: result.eventId ?? null,
          contentIds: items.map((item) => item.productId),
          value: typeof result.total === "number" ? result.total : subtotal,
          numItems: count,
        });

        reset();
        router.push(`/order/${result.id}`);
      } catch {
        setError(dict.checkout.genericError);
      }
    });
  }

  if (items.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto w-full max-w-md px-4 py-20 text-center sm:px-6"
      >
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 shadow-soft">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-brand-soft text-brand">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 7h12l1.5 13.5a1 1 0 0 1-1 1.1H5.5a1 1 0 0 1-1-1.1L6 7Z" />
              <path d="M9 10V6a3 3 0 0 1 6 0v4" />
            </svg>
          </div>
          <h2 className="mt-5 text-xl font-extrabold text-navy">{dict.cart.emptyTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{dict.cart.emptyHint}</p>
          <Link
            href="/products"
            className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-8 text-base font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5"
          >
            {dict.cart.browse}
          </Link>
        </div>
      </motion.section>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      {/* -------------------------------------------------- line items */}
      <section aria-label={dict.cart.title}>
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {items.map((item) => {
              const product = productById.get(item.productId);
              const isUnavailable = !product || (product.stock ?? 0) <= 0;
              const folded = product ? shippingFoldApplied(product.shipping_included, product.shipping_fold) : 0;
              const lineTotal = product
                ? storefrontPrice(
                    Number(product.price),
                    product.shipping_included,
                    product.shipping_fold,
                  ) * item.qty
                : 0;
              return (
                <motion.li
                  key={item.productId}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 24, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-soft"
                >
                  <Link
                    href={`/products/${item.productId}`}
                    className="relative block size-20 shrink-0 overflow-hidden rounded-xl bg-slate-100"
                  >
                    {product?.image_url ? (
                      <Image src={product.image_url} alt={product?.name ?? ""} fill sizes="80px" className="object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-xl font-bold text-emerald-600">
                        {dict.brand.slice(0, 1)}
                      </span>
                    )}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/products/${item.productId}`}
                        className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 transition-colors hover:text-brand"
                      >
                        {product?.name ?? dict.cart.loading}
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(item.productId)}
                        aria-label={dict.cart.remove}
                        className="grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                      {product && (
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => setQty(item.productId, item.qty - 1)}
                            disabled={item.qty <= 1}
                            aria-label={dict.cart.decrease}
                            className="grid size-8 place-items-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                              <path d="M5 12h14" />
                            </svg>
                          </button>
                          <span className="w-10 text-center text-sm font-extrabold text-navy">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => setQty(item.productId, item.qty + 1)}
                            aria-label={dict.cart.increase}
                            className="grid size-8 place-items-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-brand hover:text-brand"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                        </div>
                      )}

                      <p className="whitespace-nowrap text-sm font-extrabold text-brand">
                        {product ? (
                          <>
                            {lineTotal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                            <span className="ms-1 text-[11px] font-medium text-slate-500">
                              {dict.products.currency}
                            </span>
                            {folded > 0 ? (
                              <span className="ms-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                {dict.products.freeShipping}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="font-semibold text-slate-400">{dict.cart.loading}</span>
                        )}
                      </p>
                    </div>

                    {isUnavailable && (
                      <p className="mt-1 text-xs font-bold text-rose-600">
                        {!product ? dict.cart.unavailable : dict.products.notAvailable}
                      </p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-slate-700">{dict.cart.subtotal}</span>
            <span className="text-sm font-extrabold text-navy">
              {formattedSubtotal}
              <span className="ms-1 text-xs font-medium text-slate-500">{dict.products.currency}</span>
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-slate-700">{dict.cart.shipping}</span>
            {shippingFree ? (
              <span className="text-sm font-extrabold text-emerald-700">
                {dict.products.freeShipping}
              </span>
            ) : selectedGovernorate ? (
              <span className="text-sm font-extrabold text-navy">
                {formattedShipping}
                <span className="ms-1 text-xs font-medium text-slate-500">{dict.products.currency}</span>
              </span>
            ) : (
              <span className="font-semibold text-slate-400">—</span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
            <span className="text-sm font-bold text-slate-700">{dict.cart.total}</span>
            <span className="text-lg font-extrabold text-brand">
              {formattedTotal}
              <span className="ms-1 text-xs font-medium text-slate-500">{dict.products.currency}</span>
            </span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- checkout */}
      <CheckoutForm
        dict={dict}
        form={form}
        setField={setField}
        governorates={governorates}
        cities={cities}
        error={error}
        isPending={isPending}
        canSubmit={items.length > 0 && !unavailable.some((u) => u.missing || u.out)}
        submitLabel={`${dict.checkout.placeOrder} (${count})`}
        onSubmitted={placeOrder}
      />
    </div>
  );
}

function CheckoutForm({
  dict,
  form,
  setField,
  governorates,
  cities,
  error,
  isPending,
  canSubmit,
  submitLabel,
  onSubmitted,
}: {
  dict: Dictionary;
  form: CheckoutForm;
  setField: (name: keyof CheckoutForm, value: string) => void;
  governorates: GovernorateOption[];
  cities: CityOption[];
  error: string | null;
  isPending: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onSubmitted: () => void;
}) {
  type FieldOption = { value: string; label: string };

  type FieldDef = {
    name: keyof CheckoutForm;
    label: string;
    placeholder: string;
    type: "text" | "tel" | "select";
    autoComplete: string;
    /** select only: the choices to render. */
    options?: FieldOption[];
    /** select only; defaults to true. The city select is deliberately optional. */
    required?: boolean;
  };

  const governorateOptions: FieldOption[] = governorates.map((governorate) => ({
    value: governorate.governorate_id,
    label: governorate.name_ar,
  }));

  // Only cities belonging to the chosen governorate. Safka ties every city id
  // to one price list, and the server re-checks the pairing anyway; showing
  // another governorate's cities here would only invite a rejected order.
  const cityOptions: FieldOption[] = cities
    .filter((city) => city.governorate_id === form.shippingGovernorate)
    .map((city) => ({ value: city.city_id, label: city.name_ar }));

  const fields: FieldDef[] = [
    {
      name: "customerName",
      label: dict.checkout.name,
      placeholder: dict.checkout.namePlaceholder,
      type: "text",
      autoComplete: "name",
    },
    {
      name: "phone",
      label: dict.checkout.phone,
      placeholder: dict.checkout.phonePlaceholder,
      type: "tel",
      autoComplete: "tel",
    },
    {
      name: "country",
      label: dict.checkout.country,
      placeholder: dict.checkout.countryPlaceholder,
      type: "text",
      autoComplete: "country-name",
    },
    {
      name: "shippingGovernorate",
      label: dict.checkout.governorate,
      placeholder: dict.checkout.governoratePlaceholder,
      type: "select",
      autoComplete: "address-level1",
      options: governorateOptions,
    },
    {
      name: "cityId",
      label: dict.checkout.city,
      placeholder: dict.checkout.cityPlaceholder,
      type: "select",
      autoComplete: "address-level2",
      options: cityOptions,
      // Optional: leave it blank and the order goes out with no `city` at all.
      required: false,
    },
    {
      name: "address",
      label: dict.checkout.address,
      placeholder: dict.checkout.addressPlaceholder,
      type: "text",
      autoComplete: "street-address",
    },
  ];

  return (
    <motion.aside
      id="checkout"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="h-fit scroll-mt-24 rounded-card border border-slate-200/80 bg-white p-6 shadow-lift lg:sticky lg:top-28"
    >
      <h2 className="text-lg font-extrabold text-navy">{dict.checkout.title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">{dict.checkout.subtitle}</p>

      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitted();
        }}
      >
        {fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={field.name} className="text-sm font-bold text-slate-700">
              {field.label}
            </label>
            {field.type === "select" ? (
              <select
                id={field.name}
                name={field.name}
                autoComplete={field.autoComplete}
                required={field.required ?? true}
                value={form[field.name]}
                onChange={(event) => setField(field.name, event.target.value)}
                className="h-12 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
              >
                {/* For an optional select the placeholder stays selectable so
                    the customer can clear the city again. */}
                <option value="" disabled={field.required ?? true}>
                  {field.placeholder}
                </option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={field.name}
                name={field.name}
                type={field.type}
                inputMode={field.type === "tel" ? "tel" : undefined}
                autoComplete={field.autoComplete}
                required
                value={form[field.name]}
                onChange={(event) => setField(field.name, event.target.value)}
                className="h-12 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
            )}
          </div>
        ))}

        <div className="mt-1 flex items-start gap-2 rounded-2xl bg-brand-soft px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-brand" aria-hidden="true">
            <path d="M6.5 8.5a5.5 5.5 0 0 1 11 0c0 2.4 1 3.8 1.8 5 1 1.5.1 3-.8 3H4.5c-.9 0-1.8-1.5-.8-3 .8-1.2 1.8-2.6 1.8-5Z" />
          </svg>
          <p className="text-xs font-semibold leading-5 text-brand-dark">{dict.checkout.codNote}</p>
        </div>

        <div className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => setField("website", event.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {error}
          </p>
        )}

        <motion.button
          type="submit"
          disabled={!canSubmit || isPending}
          whileTap={{ scale: 0.97 }}
          className="inline-flex h-12 min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-7 text-base font-bold text-white shadow-glow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {isPending ? dict.checkout.placing : submitLabel}
        </motion.button>
      </form>
    </motion.aside>
  );
}