"use client";
import { useState } from "react";

type SafkaResult = {
  ok: boolean;
  safkaOrderId: string | null;
  safkaStatus?: string | null;
  httpStatus?: number | null;
  error?: string;
  warnings?: string[];
  payload?: unknown;
  response?: unknown;
};

export default function SendToSafka({
  orderId,
  currentSafkaId,
}: {
  orderId: string;
  currentSafkaId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SafkaResult | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/safka`, {
        method: "POST",
      });
      const json = (await response.json().catch(() => ({}))) as SafkaResult;
      setResult(json);
    } catch {
      setResult({ ok: false, safkaOrderId: null, error: "تعذّر الاتصال بالخادم" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-navy">الإرسال إلى سافكا</h3>
          {currentSafkaId ? (
            <p className="mt-0.5 text-xs text-success">
              تم إرساله مسبقًا — رقم الأمر: <span dir="ltr">{currentSafkaId}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-navy-soft">
              يُرسل هذا الطلب فقط يدويًا عبر هذا الزر — لا يُرسل أي طلب تلقائيًا.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="rounded-2xl bg-brand px-4 py-2 font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "جارٍ الإرسال…" : "إرسال إلى سافكا"}
        </button>
      </div>

      {result ? (
        <div className="mt-3 space-y-3 text-sm">
          {result.ok ? (
            <div className="space-y-1 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
              <p>
                أُرسل بنجاح — رقم الأمر في سافكا:{" "}
                <span dir="ltr" className="font-mono">
                  {result.safkaOrderId}
                </span>
              </p>
              {result.safkaStatus ? (
                <p>
                  حالة الأمر في سافكا: <strong>{result.safkaStatus}</strong>
                </p>
              ) : null}
              {result.httpStatus ? (
                <p>
                  استجابة سافكا: <span dir="ltr">HTTP {result.httpStatus}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
              <p>{result.error ?? "فشل الإرسال"}</p>
              {result.httpStatus ? (
                <p>
                  ردّت سافكا بـ <span dir="ltr">HTTP {result.httpStatus}</span>.
                </p>
              ) : null}
              <p className="font-semibold">
                لم تُحفظ الحالة — الطلب ما يزال «قيد الانتظار» ولم يُرسل. أعد
                المحاولة من الزر أعلاه، أو صحّح البيانات ثم أعد الإرسال.
              </p>
            </div>
          )}

          {result.warnings && result.warnings.length > 0 ? (
            <ul className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
              {result.warnings.map((warning) => (
                <li key={warning}>⚠ {warning}</li>
              ))}
            </ul>
          ) : null}

          {result.payload ? (
            <details className="rounded-xl bg-slate-50 p-3">
              <summary className="cursor-pointer font-semibold text-navy-soft">
                الطلب المُرسل الحرفي (الحمولة)
              </summary>
              <pre
                dir="ltr"
                className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-navy p-3 text-left font-mono text-xs text-emerald-200"
              >
                {JSON.stringify(result.payload, null, 2)}
              </pre>
            </details>
          ) : null}

          {result.response ? (
            <details className="rounded-xl bg-slate-50 p-3">
              <summary className="cursor-pointer font-semibold text-navy-soft">
                ردّ سافكا الحرفي
              </summary>
              <pre
                dir="ltr"
                className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-navy p-3 text-left font-mono text-xs text-sky-200"
              >
                {JSON.stringify(result.response, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}