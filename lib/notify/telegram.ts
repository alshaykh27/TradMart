import "server-only";
import {
  buildNewOrderTelegramMessage,
  isTelegramConfigured,
  type NewOrderAlert,
} from "./message";

export type { NewOrderAlert } from "./message";

/**
 * New-order alert via a Telegram bot (https://core.telegram.org/bots/api).
 *
 * The `sendMessage` HTTP call lives here (server-only, uses the bot token,
 * which must never be exposed to the browser or logged). Enabled only when
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are both non-empty; otherwise the
 * alert is skipped (non-fatally, with a log line) so the checkout never
 * depends on it. Best-effort: failures are reported, never thrown.
 */

export type TelegramAlertOutcome = { ok: boolean; detail?: string };

export async function sendNewOrderTelegramAlert(
  alert: NewOrderAlert,
): Promise<TelegramAlertOutcome> {
  if (!isTelegramConfigured()) {
    console.info(
      "[notify] Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) — skipping order alert",
    );
    return { ok: true, detail: "not-configured" };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN as string;
  const chatId = process.env.TELEGRAM_CHAT_ID as string;
  const text = buildNewOrderTelegramMessage(alert);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        cache: "no-store",
      },
    );

    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
    } | null;

    if (!response.ok || !body?.ok) {
      const detail = body?.description ?? `HTTP ${response.status}`;
      console.error("[notify] Telegram sendMessage failed:", detail);
      return { ok: false, detail };
    }

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[notify] Telegram request failed:", detail);
    return { ok: false, detail };
  }
}