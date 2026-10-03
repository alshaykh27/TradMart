/**
 * Admin order-cancellation logic, extracted from the route so the auth gate,
 * the terminal-state rule, the Safka hand-off warning and the error mapping are
 * unit-testable without a database.
 *
 * There is no confirmed Safka "cancel order" API, so cancellation is LOCAL
 * ONLY: the row is marked cancelled and, when the order had already been
 * forwarded, the merchant is told to cancel it inside Safka's own dashboard.
 * The local change is logged so the gap is auditable in the Vercel log.
 */

export interface CancelOrderError {
  code?: string;
  message: string;
}

export interface CancelOrderDbClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): PromiseLike<{
          error: CancelOrderError | null;
          data: unknown;
        }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): {
        select(columns: string): {
          maybeSingle(): PromiseLike<{
            error: CancelOrderError | null;
            data: unknown;
          }>;
        };
      };
    };
  };
}

/** Shown in the admin UI and returned by the API when the order is in Safka. */
export const SAFKA_CANCEL_WARNING =
  "هذا الطلب مُرسل إلى سافكا بالفعل. يجب إلغاؤه يدويًا من لوحة تحكم سافكا — لا يوجد إلغاء تلقائي من عندنا.";

export type CancelOrderOutcome =
  | { status: 401; body: { ok: false; error: string } }
  | { status: 404; body: { ok: false; error: string } }
  | { status: 502; body: { ok: false; error: string } }
  | {
      status: 200;
      body: {
        ok: true;
        order: { id: string; status: string; updated_at: string };
        /** True when the order had already been forwarded to Safka. */
        safkaManualActionRequired: boolean;
        warning?: string;
      };
    };

type OrderSnapshot = {
  id: string;
  status: string;
  safka_order_id: string | null;
  updated_at: string;
};

function asSnapshot(value: unknown): OrderSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    status: typeof row.status === "string" ? row.status : "cancelled",
    safka_order_id:
      typeof row.safka_order_id === "string" ? row.safka_order_id : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

export async function handleCancelOrder(input: {
  isAdmin: boolean;
  client: CancelOrderDbClient;
  orderId: string;
}): Promise<CancelOrderOutcome> {
  const { isAdmin, client, orderId } = input;

  if (!isAdmin) {
    return { status: 401, body: { ok: false, error: "غير مصرح" } };
  }

  const current = await client
    .from("orders")
    .select("id, status, safka_order_id, updated_at")
    .eq("id", orderId)
    .maybeSingle();

  if (current.error) {
    return { status: 502, body: { ok: false, error: "تعذّر تحميل الطلب" } };
  }

  const before = asSnapshot(current.data);
  if (!before) {
    return { status: 404, body: { ok: false, error: "الطلب غير موجود" } };
  }

  // Cancelling twice is a no-op rather than an error, so a double click or a
  // retried request can never fail or un-cancel anything.
  if (before.status === "cancelled") {
    return {
      status: 200,
      body: {
        ok: true,
        order: {
          id: before.id,
          status: before.status,
          updated_at: before.updated_at,
        },
        safkaManualActionRequired: Boolean(before.safka_order_id),
        ...(before.safka_order_id ? { warning: SAFKA_CANCEL_WARNING } : {}),
      },
    };
  }

  const updated = await client
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .select("id, status, updated_at")
    .maybeSingle();

  if (updated.error) {
    return { status: 502, body: { ok: false, error: "تعذّر إلغاء الطلب" } };
  }

  const after = asSnapshot(updated.data);
  if (!after) {
    return { status: 404, body: { ok: false, error: "الطلب غير موجود" } };
  }

  const safkaManualActionRequired = Boolean(before.safka_order_id);

  // Audit trail: cancellation is local only, so record which order stopped
  // being worked on and whether Safka still needs a manual cancellation.
  console.info(
    `[order-cancel] order=${after.id} previous_status=${before.status} ` +
      `safka_order_id=${before.safka_order_id ?? "none"} ` +
      `safka_manual_action_required=${safkaManualActionRequired}`,
  );

  return {
    status: 200,
    body: {
      ok: true,
      order: { id: after.id, status: after.status, updated_at: after.updated_at },
      safkaManualActionRequired,
      ...(safkaManualActionRequired ? { warning: SAFKA_CANCEL_WARNING } : {}),
    },
  };
}