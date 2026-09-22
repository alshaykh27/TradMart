import "server-only";
import type {
  SafkaCreateOrderRequest,
  SafkaCreateOrderResponse,
} from "@/types/safka";
import { getSafkaEnv } from "./env";
import { buildSafkaOrderPayload, type SafkaOrderInput } from "./order-payload";

/**
 * Best-effort forwarding of a paid-at-door order to the Safka Public API.
 *
 * Gated by SAFKA_ORDERS_ENABLED, which defaults to DISABLED: unless the value
 * is exactly "true", nothing is sent and the exact payload that WOULD be sent is
 * logged (no secrets) so it can be reviewed before enabling. Enabling it is a
 * deliberate, one-env-var action.
 *
 * A failure here must never fail the local checkout — createOrder treats the
 * local order as the source of truth and only records the Safka id on success.
 */

export function isSafkaOrdersEnabled(): boolean {
  return process.env.SAFKA_ORDERS_ENABLED === "true";
}

export type SafkaOrderOutcome =
  | { sent: false; dryRun: true; payload: SafkaCreateOrderRequest; warnings: string[] }
  | {
      sent: false;
      dryRun: false;
      payload: SafkaCreateOrderRequest;
      warnings: string[];
      error: string;
    }
  | {
      sent: true;
      dryRun: false;
      payload: SafkaCreateOrderRequest;
      warnings: string[];
      safkaOrderId: string | null;
    };

export async function sendSafkaOrder(input: SafkaOrderInput): Promise<SafkaOrderOutcome> {
  const { payload, warnings } = buildSafkaOrderPayload(input);

  if (!isSafkaOrdersEnabled()) {
    console.info(
      "[safka] orders disabled (SAFKA_ORDERS_ENABLED is not 'true') — not sending. " +
        "Payload that WOULD be sent:\n" +
        JSON.stringify(payload, null, 2),
    );
    if (warnings.length > 0) {
      console.warn("[safka] payload warnings:", warnings.join("; "));
    }
    return { sent: false, dryRun: true, payload, warnings };
  }

  const { baseUrl, apiKey } = getSafkaEnv();

  try {
    const response = await fetch(`${baseUrl}/api/v1/public/orders`, {
      method: "POST",
      headers: {
        "api-safka-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const result = (await response.json().catch(() => null)) as SafkaCreateOrderResponse | null;

    if (!response.ok || !result?.success) {
      const detail =
        result?.errors?.map((entry) => entry.msg).filter(Boolean).join("; ") ||
        `HTTP ${response.status}`;
      console.error("[safka] order rejected:", detail);
      return { sent: false, dryRun: false, payload, warnings, error: detail };
    }

    return {
      sent: true,
      dryRun: false,
      payload,
      warnings,
      safkaOrderId: result.data?._id ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[safka] order send failed:", message);
    return { sent: false, dryRun: false, payload, warnings, error: message };
  }
}
