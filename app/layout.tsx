import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { defaultLocale, direction } from "@/i18n/config";
import Providers from "@/components/Providers";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ff6b35",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={defaultLocale}
      dir={direction[defaultLocale]}
      className={`${cairo.variable} h-full antialiased`}
    >
      <body
        className="flex min-h-full flex-col bg-cream text-navy"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
