import "server-only";
import type {
  SafkaCreateOrderRequest,
  SafkaCreateOrderResponse,
} from "@/types/safka";
import { getSafkaEnv } from "./env";
import { buildSafkaOrderPayload, type SafkaOrderInput } from "./order-payload";
import { isSafkaSendAllowed, type SafkaSendMode } from "./gate";

/**
 * Forwarding an order to the Safka Public API (POST /api/v1/public/orders).
 *
 * Two independent, deliberate switches (see lib/safka/gate.ts):
 *   - SAFKA_ORDERS_ENABLED  — master switch: nothing sends unless "true".
 *   - SAFKA_AUTO_FORWARD    — separately enables the checkout (automatic) path.
 *     The admin "إرسال إلى سافكا" button (mode "admin") sends as soon as the
 *     master switch is on; the checkout (mode "checkout") only sends when BOTH
 *     switches are on. This guarantees flipping the flag for the manual button
 *     never enables automatic sending.
 *
 * A failure here must never fail the local order — callers treat the local
 * order as the source of truth and only record safka_order_id on success.
 * When a send is not allowed, the exact payload that WOULD be sent is logged
 * (order data only, no secrets) so it can be reviewed before enabling.
 *
 * Every outcome carries the exact request (`payload`) plus, when a response was
 * received, Safka's raw HTTP status (`httpStatus`) and parsed body
 * (`response`) — including the returned order id/status — and a human-readable
 * `error` on failure so the admin UI can show it verbatim and let the merchant
 * retry.
 */

export function isSafkaOrdersEnabled(): boolean {
  return process.env.SAFKA_ORDERS_ENABLED === "true";
}

export function isSafkaAutoForwardEnabled(): boolean {
  return process.env.SAFKA_AUTO_FORWARD === "true";
}

export type SafkaOrderOutcome = {
  sent: boolean;
  dryRun: boolean;
  mode: SafkaSendMode;
  payload: SafkaCreateOrderRequest;
  warnings: string[];
  /** HTTP status of Safka's response, or null when the request never completed. */
  httpStatus: number | null;
  /** Safka's exact parsed JSON response (success or validation body). */
  response: SafkaCreateOrderResponse | null;
  /** Safka's order id (response.data._id), when returned. */
  safkaOrderId: string | null;
  /** Safka's order status (response.data.status), when returned. */
  safkaStatus: string | null;
  /** Human-readable failure detail; set when sent === false && !dryRun. */
  error?: string;
};

export async function sendSafkaOrder(
  input: SafkaOrderInput,
  opts: { mode?: SafkaSendMode } = {},
): Promise<SafkaOrderOutcome> {
  const mode = opts.mode ?? "admin";
  const { payload, warnings } = buildSafkaOrderPayload(input);

  const gate = {
    enabled: isSafkaOrdersEnabled(),
    autoForward: isSafkaAutoForwardEnabled(),
    mode,
  };

  if (!isSafkaSendAllowed(gate)) {
    console.info(
      `[safka] not sending (mode "${mode}", SAFKA_ORDERS_ENABLED=${gate.enabled}, ` +
        `SAFKA_AUTO_FORWARD=${gate.autoForward}). Payload that WOULD be sent:\n` +
        JSON.stringify(payload, null, 2),
    );
    if (warnings.length > 0) {
      console.warn("[safka] payload warnings:", warnings.join("; "));
    }
    return {
      sent: false,
      dryRun: true,
      mode,
      payload,
      warnings,
      httpStatus: null,
      response: null,
      safkaOrderId: null,
      safkaStatus: null,
    };
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

    const httpStatus = response.status ?? null;
    const result = (await response.json().catch(() => null)) as SafkaCreateOrderResponse | null;

    if (!result) {
      const detail = `HTTP ${httpStatus} (non-JSON response)`;
      console.error("[safka] order rejected:", detail);
      return {
        sent: false,
        dryRun: false,
        mode,
        payload,
        warnings,
        httpStatus,
        response: null,
        safkaOrderId: null,
        safkaStatus: null,
        error: detail,
      };
    }

    if (!response.ok || !result.success) {
      const detail =
        result.errors?.map((entry) => entry.msg).filter(Boolean).join("; ") ||
        `HTTP ${httpStatus}`;
      console.error("[safka] order rejected:", detail);
      return {
        sent: false,
        dryRun: false,
        mode,
        payload,
        warnings,
        httpStatus,
        response: result,
        safkaOrderId: null,
        safkaStatus: null,
        error: detail,
      };
    }

    return {
      sent: true,
      dryRun: false,
      mode,
      payload,
      warnings,
      httpStatus,
      response: result,
      safkaOrderId: result.data?._id ?? null,
      safkaStatus: result.data?.status ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[safka] order send failed:", message);
    return {
      sent: false,
      dryRun: false,
      mode,
      payload,
      warnings,
      httpStatus: null,
      response: null,
      safkaOrderId: null,
      safkaStatus: null,
      error: message,
    };
  }
}
