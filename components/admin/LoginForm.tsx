"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.ok) {
        router.replace("/admin");
        return;
      }
      setError(json?.error ?? "تعذّر تسجيل الدخول");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="admin-password" className="mb-1.5 block text-sm font-semibold text-navy-soft">
          كلمة المرور
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••••••"
          className="w-full rounded-2xl border border-navy/15 bg-white px-4 py-2.5 text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="w-full rounded-2xl bg-brand px-4 py-2.5 font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        {busy ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}