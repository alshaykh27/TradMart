import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SETTINGS_ID } from "@/lib/settings";
import { normaliseSocialLinks } from "@/lib/social/links";
import SocialForm from "@/components/admin/SocialForm";

export const metadata: Metadata = {
  title: "إعدادات التواصل",
  robots: { index: false, follow: false },
};

/**
 * "إعدادات التواصل" — Facebook page link + WhatsApp number (Phase 13).
 *
 * Both values are public (they become hrefs in the footer and the floating
 * button), so unlike the marketing tokens they are handed to the form as-is.
 * A row that cannot be read (migration not applied yet) normalises to empty
 * fields rather than failing the page.
 */
export default async function AdminSocialSettingsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settings")
    .select("facebook_url, whatsapp_number")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  const links = normaliseSocialLinks(error ? null : data);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">إعدادات التواصل</h1>
        <p className="mt-1 text-sm text-navy-soft">
          رابط فيسبوك ورقم واتساب المعروضان في تذييل المتجر، وزر واتساب العائم الذي يظهر في
          كل صفحة. التغييرات تسري فورًا بدون إعادة نشر.
        </p>
      </header>

      <section className="max-w-2xl rounded-3xl bg-white p-5 shadow-soft">
        <SocialForm
          initialFacebookUrl={links.facebookUrl ?? ""}
          initialWhatsappNumber={links.whatsappNumber ?? ""}
        />
      </section>
    </div>
  );
}
