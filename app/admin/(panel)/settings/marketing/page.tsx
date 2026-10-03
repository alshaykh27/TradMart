import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SETTINGS_ID } from "@/lib/settings";
import { normaliseMarketingSettings } from "@/lib/marketing/config";
import MarketingForm from "@/components/admin/MarketingForm";

export const metadata: Metadata = {
  title: "إعدادات التسويق",
  robots: { index: false, follow: false },
};

/**
 * "إعدادات التسويق" — Meta + TikTok pixels.
 *
 * SECURITY: this Server Component reads the settings row with the service-role
 * client and then hands the form ONLY the two Pixel IDs plus a boolean per
 * token. The token values stop here on purpose: anything passed to a Client
 * Component is serialised into the RSC payload and is readable in devtools.
 */
export default async function AdminMarketingSettingsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select("meta_pixel_id, meta_capi_token, tiktok_pixel_id, tiktok_api_token")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  const settings = normaliseMarketingSettings(data);

  const metaPixelId = settings.metaPixelId ?? "";
  const tiktokPixelId = settings.tiktokPixelId ?? "";
  const metaTokenSaved = settings.metaCapiToken !== null;
  const tiktokTokenSaved = settings.tiktokApiToken !== null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">إعدادات التسويق</h1>
        <p className="mt-1 text-sm text-navy-soft">
          بكسل ميتا وبكسل تيك توك. اترك أي حقل فارغًا لتعطيل المنصة بالكامل. التغييرات تسري
          فورًا بدون إعادة نشر.
        </p>
      </header>

      <section className="max-w-2xl rounded-3xl bg-white p-5 shadow-soft">
        <MarketingForm
          initialMetaPixelId={metaPixelId}
          initialTiktokPixelId={tiktokPixelId}
          metaTokenSaved={metaTokenSaved}
          tiktokTokenSaved={tiktokTokenSaved}
        />
      </section>

      <section className="max-w-2xl rounded-3xl border border-navy/10 bg-white/60 p-5">
        <h2 className="text-sm font-extrabold text-navy">الأحداث المُرسَلة</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-navy-soft">
          <li>
            <span className="font-bold text-navy">PageView</span> — تلقائي مع كل صفحة.
          </li>
          <li>
            <span className="font-bold text-navy">ViewContent</span> — صفحة المنتج.
          </li>
          <li>
            <span className="font-bold text-navy">AddToCart</span> — عند الضغط على «أضف
            للسلة».
          </li>
          <li>
            <span className="font-bold text-navy">InitiateCheckout</span> — عند فتح صفحة
            السلة.
          </li>
          <li>
            <span className="font-bold text-navy">Purchase</span> — بعد إنشاء الطلب بنجاح
            (وتيك توك: CompletePayment).
          </li>
        </ul>
        <p className="mt-3 text-xs text-navy-soft">
          حدث الشراء يُرسل أيضًا من الخادم عبر Conversions API و TikTok Events API إن كان
          الرمز السري مضبوطًا، بنفس معرّف الحدث حتى لا يُحتسب الطلب مرتين. لا تُرسل بيانات
          شخصية خام إطلاقًا.
        </p>
      </section>
    </div>
  );
}
