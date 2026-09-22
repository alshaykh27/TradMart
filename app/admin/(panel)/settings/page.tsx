import type { Metadata } from "next";
import {
  createAdminClient,
} from "@/lib/supabase/admin";
import { SETTINGS_ID } from "@/lib/settings";
import SettingsForm from "@/components/admin/SettingsForm";

export const metadata: Metadata = {
  title: "الإعدادات",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select("shipping_markup")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  const markup = Number(data?.shipping_markup ?? 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">الإعدادات</h1>
        <p className="mt-1 text-sm text-navy-soft">
          الزيادة الثابتة المفروضة فوق سعر توصيل المحافظة من سافكا.
        </p>
      </header>

      <section className="max-w-2xl rounded-3xl bg-white p-5 shadow-soft">
        <SettingsForm initialMarkup={markup} />
      </section>
    </div>
  );
}