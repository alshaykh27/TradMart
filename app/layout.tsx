import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { defaultLocale, direction } from "@/i18n/config";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TradeMart | متجرك الإلكتروني",
    template: "%s | TradeMart",
  },
  description:
    "TradeMart — متجرك الإلكتروني للتسوّق أونلاين بأسعار تنافسية وتوصيل سريع.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={defaultLocale}
      dir={direction[defaultLocale]}
      className={`${cairo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
