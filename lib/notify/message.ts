/**
 * Pure, unit-testable parts of the Telegram new-order alert.
 *
 * Kept free of "server-only"/next imports; the actual `sendMessage` HTTP call
 * lives in lib/notify/telegram.ts. Nothing here reads secrets beyond the
 * configured/not-configured decision (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID),
 * and neither value is ever logged here.
 */

export function isTelegramConfigured(): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  return (
    typeof token === "string" &&
    token.length > 0 &&
    typeof chat === "string" &&
    chat.length > 0
  );
}

export type NewOrderAlert = {
  orderId: string;
  customerName: string;
  phone: string;
  governorate: string | null;
  city: string;
  total: number;
};

/** Escapes a value for Telegram HTML parse mode. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildNewOrderTelegramMessage(alert: NewOrderAlert): string {
  const adminUrl = `https://trad-mart.vercel.app/admin/orders/${alert.orderId}`;
  const shortId = alert.orderId.slice(0, 8);
  const money = Number(alert.total).toFixed(2);

  return [
    "🛒 طلب جديد — يجب إرساله إلى سافكا",
    `رقم الطلب: #${escapeHtml(shortId)}`,
    `العميل: ${escapeHtml(alert.customerName)}`,
    `الهاتف: <code>${escapeHtml(alert.phone)}</code>`,
    `المحافظة: ${escapeHtml(alert.governorate ?? "—")}`,
    `المدينة: ${escapeHtml(alert.city)}`,
    `الإجمالي: ${money} ج.م`,
    `افتح الطلب: <a href="${adminUrl}">إدارة الطلب</a>`,
  ].join("\n");
}