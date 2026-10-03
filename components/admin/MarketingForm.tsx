"use client";
import { useState, type FormEvent } from "react";

/**
 * "إعدادات التسويق" — Meta + TikTok pixel configuration.
 *
 * SECURITY: this component is deliberately given NO access token, not even a
 * masked or truncated one. A value passed from a Server Component to a Client
 * Component is serialised into the RSC payload and is therefore readable in
 * devtools, so the page passes only `metaTokenSaved` / `tiktokTokenSaved`
 * booleans.
 *
 * Consequently the token inputs start empty and always render as
 * "•••••••• محفوظ" when a token exists. Saving with an empty field KEEPS the
 * stored token (the route only writes a token when the field is non-empty);
 * removing one is a deliberate action via the "حذف" toggle, which sends
 * clearMetaCapiToken / clearTiktokApiToken.
 *
 * Leaving a Pixel ID empty switches that platform off entirely — no script is
 * rendered and no server-side event is sent.
 */

type MarketingFormProps = {
  initialMetaPixelId: string;
  initialTiktokPixelId: string;
  metaTokenSaved: boolean;
  tiktokTokenSaved: boolean;
};

const FIELD_CLASS =
  "w-full bg-transparent text-navy outline-none placeholder:text-navy-soft/50";

function TokenField({
  id,
  label,
  hint,
  saved,
  value,
  clearing,
  onChange,
  onClearChange,
}: {
  id: string;
  label: string;
  hint: string;
  saved: boolean;
  value: string;
  clearing: boolean;
  onChange: (value: string) => void;
  onClearChange: (value: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-navy-soft">
        {label}
      </label>

      <div className="flex items-center gap-2 rounded-2xl border border-navy/15 px-4 py-2.5 focus-within:border-brand">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          dir="ltr"
          // "new-password" rather than "off": browsers routinely ignore
          // autoComplete="off" on password fields and will happily offer to
          // GENERATE one. A generated value looks exactly like a pasted token
          // (mixed case + digits + symbols, ~32 chars), so it can be saved by
          // accident and then silently sent to Meta on every order. "off" alone
          // did not prevent this. A `name` is also supplied so password managers
          // have a stable field to attach to instead of guessing.
          name={`${id}-value`}
          autoComplete="new-password"
          data-1p-ignore
          spellCheck={false}
          placeholder={saved ? "•••••••••• (محفوظ)" : "غير مُحفوظ"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD_CLASS} text-start`}
        />

        {saved ? (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            className="shrink-0 whitespace-nowrap text-xs font-bold text-navy-soft hover:text-navy"
          >
            {revealed ? "إخفاء" : "إظهار"}
          </button>
        ) : null}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-xs text-navy-soft">{hint}</p>
        {saved ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-rose-600">
            <input
              type="checkbox"
              checked={clearing}
              onChange={(event) => onClearChange(event.target.checked)}
              className="size-3.5 accent-rose-500"
            />
            حذف الرمز
          </label>
        ) : null}
      </div>
    </div>
  );
}

export default function MarketingForm({
  initialMetaPixelId,
  initialTiktokPixelId,
  metaTokenSaved,
  tiktokTokenSaved,
}: MarketingFormProps) {
  const [metaPixelId, setMetaPixelId] = useState(initialMetaPixelId);
  const [metaToken, setMetaToken] = useState("");
  const [clearMeta, setClearMeta] = useState(false);
  const [metaSaved, setMetaSaved] = useState(metaTokenSaved);

  const [tiktokPixelId, setTiktokPixelId] = useState(initialTiktokPixelId);
  const [tiktokToken, setTiktokToken] = useState("");
  const [clearTiktok, setClearTiktok] = useState(false);
  const [tiktokSaved, setTiktokSaved] = useState(tiktokTokenSaved);

  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaPixelId: metaPixelId.trim(),
          // Only send a token when one was actually typed: an empty string must
          // mean "keep", and the route relies on that to avoid wiping a token.
          ...(metaToken.trim() ? { metaCapiToken: metaToken.trim() } : {}),
          ...(clearMeta ? { clearMetaCapiToken: true } : {}),
          tiktokPixelId: tiktokPixelId.trim(),
          ...(tiktokToken.trim() ? { tiktokApiToken: tiktokToken.trim() } : {}),
          ...(clearTiktok ? { clearTiktokApiToken: true } : {}),
        }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        saved?: { metaPixelId: string | null; tiktokPixelId: string | null };
        tokens?: { metaCapiToken: boolean; tiktokApiToken: boolean };
      };

      if (!response.ok) {
        setMessage({ text: json?.error ?? "تعذّر الحفظ", ok: false });
        return;
      }

      if (json.saved) {
        setMetaPixelId(json.saved.metaPixelId ?? "");
        setTiktokPixelId(json.saved.tiktokPixelId ?? "");
      }
      if (json.tokens) {
        setMetaSaved(json.tokens.metaCapiToken);
        setTiktokSaved(json.tokens.tiktokApiToken);
      }

      // Drop the typed secrets from component state once they are stored, and
      // reset the clear-toggles so a second save cannot re-delete them.
      setMetaToken("");
      setTiktokToken("");
      setClearMeta(false);
      setClearTiktok(false);

      setMessage({ text: "تم حفظ إعدادات التسويق", ok: true });
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-4 rounded-2xl border border-navy/10 p-4">
        <legend className="px-2 text-sm font-extrabold text-navy">ميتا (فيسبوك)</legend>

        <div>
          <label
            htmlFor="meta-pixel-id"
            className="mb-1.5 block text-sm font-semibold text-navy-soft"
          >
            معرّف بكسل ميتا
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-navy/15 px-4 py-2.5 focus-within:border-brand">
            <input
              id="meta-pixel-id"
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="مثال: 123456789012345"
              value={metaPixelId}
              onChange={(event) => setMetaPixelId(event.target.value)}
              className={`${FIELD_CLASS} text-start`}
            />
          </div>
          <p className="mt-1.5 text-xs text-navy-soft">
            من Events Manager › الإعدادات › إعداد البكسل. اتركه فارغًا لتعطيل ميتا بالكامل.
          </p>
        </div>

        <TokenField
          id="meta-capi-token"
          label="رمز Conversions API (سري)"
          hint="من Events Manager › الإعدادات › إعدادات Conversions API. يُحفظ على الخادم فقط ولا يُرسل للمتصفح."
          saved={metaSaved}
          value={metaToken}
          clearing={clearMeta}
          onChange={setMetaToken}
          onClearChange={setClearMeta}
        />
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-navy/10 p-4">
        <legend className="px-2 text-sm font-extrabold text-navy">تيك توك</legend>

        <div>
          <label
            htmlFor="tiktok-pixel-id"
            className="mb-1.5 block text-sm font-semibold text-navy-soft"
          >
            معرّف بكسل تيك توك
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-navy/15 px-4 py-2.5 focus-within:border-brand">
            <input
              id="tiktok-pixel-id"
              type="text"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder="مثال: C9DQ0U05C8U8A8A8Q"
              value={tiktokPixelId}
              onChange={(event) => setTiktokPixelId(event.target.value)}
              className={`${FIELD_CLASS} text-start`}
            />
          </div>
          <p className="mt-1.5 text-xs text-navy-soft">
            من TikTok Events Manager › Web Pixel. اتركه فارغًا لتعطيل تيك توك بالكامل.
          </p>
        </div>

        <TokenField
          id="tiktok-api-token"
          label="رمز TikTok Events API (سري)"
          hint="من Events Manager › Data API. يُحفظ على الخادم فقط ولا يُرسل للمتصفح."
          saved={tiktokSaved}
          value={tiktokToken}
          clearing={clearTiktok}
          onChange={setTiktokToken}
          onClearChange={setClearTiktok}
        />
      </fieldset>

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
