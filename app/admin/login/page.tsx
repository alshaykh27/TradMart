import type { Metadata } from "next";
import LoginForm from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: "دخول لوحة التحكم",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-xl font-extrabold text-navy">
          <span className="inline-block h-3 w-3 rounded-full bg-brand" />
          لوحة تحكم TradeMart
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <h1 className="mb-4 text-lg font-bold text-navy">تسجيل الدخول</h1>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}