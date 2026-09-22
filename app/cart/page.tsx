import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CartView from "@/components/cart/CartView";
import { defaultLocale, getDictionary } from "@/i18n";

export const metadata: Metadata = {
  title: "سلة التسوق",
  description: "راجع منتجاتك وأكمل طلبك — الدفع عند الاستلام.",
};

export default async function CartPage() {
  const dict = getDictionary(defaultLocale);

  return (
    <>
      <Header dict={dict} />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-navy">
              {dict.cart.title}
            </h1>
            <p className="mt-2 text-slate-600">{dict.cart.subtitle}</p>
          </header>

          <CartView dict={dict} />
        </section>
      </main>
      <Footer dict={dict} />
    </>
  );
}