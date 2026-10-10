"use client";
import { useState, type FormEvent } from "react";
import {
  cleanFacebookUrl,
  cleanWhatsAppNumber,
  whatsappChatLink,
} from "@/lib/social/links";

/**
 * "إعدادات التواصل" — the Facebook page link and WhatsApp number shown in the
 * storefront footer and the floating WhatsApp button (Phase 13).
 *
 * Both values are public (they become hrefs), so unlike the marketing tokens
 * there is nothing secret here: the fields are pre-filled from settings and an
 * empty field legitimately clears the link. The client validates with the SAME
 * helpers the API route uses, so what the preview shows is what gets stored.
 */

type SocialFormProps = {
  initialFacebookUrl: string;
  initialWhatsappNumber: string;
};

const FIELD_CLASS =
  "w-full bg-transparent text-navy outline-none placeholder:text-navy-soft/50";

export default function SocialForm({ initialFacebookUrl, initialWhatsappNumber }: SocialFormProps) {
  const [facebookUrl, setFacebookUrl] = useState(initialFacebookUrl);
  const [whatsappNumber, setWhatsappNumber] = useState(initialWhatsappNumber);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // Derived, not stored: the footer and the floating button build their wa.me
  // link with this exact function, so the preview can never disagree with them.
  const waPreview = whatsappChatLink(whatsappNumber.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();

    const url = facebookUrl.trim();
    const number = whatsappNumber.trim();
    if (url && cleanFacebookUrl(url) === null) {
      setMessage({ text: "رابط فيسبوك غير صالح — استخدم رابطًا من facebook.com", ok: false });
      return;
    }
    if (number && cleanWhatsAppNumber(number) === null) {
      setMessage({ text: "رقم واتساب غير صالح — أرقام فقط (مثال: 01094606102)", ok: false });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facebookUrl: url, whatsappNumber: number }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        social?: { facebookUrl: string | null; whatsappNumber: string | null };
      };

      if (!response.ok) {
        setMessage({ text: json?.error ?? "تعذّر الحفظ", ok: false });
        return;
      }

      // Swap in what was actually stored (a rejected value comes back null).
      if (json.social) {
        setFacebookUrl(json.social.facebookUrl ?? "");
        setWhatsappNumber(json.social.whatsappNumber ?? "");
      }
      setMessage({ text: "تم حفظ إعدادات التواصل", ok: true });
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-navy/10 p-4">
        <div>
          <label htmlFor="facebook-url" className="mb-1.5 block text-sm font-semibold text-navy-soft">
            رابط صفحة فيسبوك
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-navy/15 px-4 py-2.5 focus-within:border-brand">
            <input
              id="facebook-url"
              type="url"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.facebook.com/your-page"
              value={facebookUrl}
              onChange={(event) => setFacebookUrl(event.target.value)}
              className={`${FIELD_CLASS} text-start`}
            />
          </div>
          <p className="mt-1.5 text-xs text-navy-soft">
            تظهر أيقونة فيسبوك في تذييل المتجر عند إدخال رابط، وتُفتح في تبويب جديد. اتركه
            فارغًا لإخفاء الأيقونة.
          </p>
        </div>

        <div>
          <label
            htmlFor="whatsapp-number"
            className="mb-1.5 block text-sm font-semibold text-navy-soft"
          >
            رقم واتساب
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-navy/15 px-4 py-2.5 focus-within:border-brand">
            <input
              id="whatsapp-number"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              spellCheck={false}
              placeholder="01094606102"
              value={whatsappNumber}
              onChange={(event) => setWhatsappNumber(event.target.value)}
              className={`${FIELD_CLASS} text-start`}
            />
          </div>
          <p className="mt-1.5 text-xs text-navy-soft">
            يُعرض الرقم في تذييل المتجر، ويُفتح زر واتساب العائم على أي صفحة مباشرة بمحادثة
            جديدة. الرقم المحلي بصيغة ‎01x‎ يُحوَّل تلقائيًا إلى صيغة الدولية ‎+20‎.
          </p>
          {waPreview ? (
            <p className="mt-1.5 text-xs text-navy-soft">
              رابط المحادثة:{" "}
              <span dir="ltr" className="font-bold text-success">
                {waPreview}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-2xl bg-brand px-5 py-2.5 font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "جارٍ الحفظ…" : "حفظ"}
        </button>

        {message ? (
          <p
            role="status"
            className={
              message.ok
                ? "rounded-full bg-success/10 px-3 py-1 text-sm font-bold text-success"
                : "rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-600"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
