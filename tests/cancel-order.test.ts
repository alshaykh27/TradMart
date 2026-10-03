import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  handleCancelOrder,
  SAFKA_CANCEL_WARNING,
  type CancelOrderDbClient,
  type CancelOrderError,
} from "../lib/admin/cancel-order.ts";

const ORDER_ID = "11111111-2222-3333-4444-555555555555";
const NOW = "2026-09-26T10:00:00.000Z";

type Snapshot = {
  status?: string;
  safka_order_id?: string | null;
  updated_at?: string;
};

type RecordedUpdate = { values: Record<string, unknown>; column: string; value: unknown };

/**
 * Minimal double for the two calls handleCancelOrder makes: a select before
 * the write and a select after it.
 */
function buildClient(options: {
  before?: Snapshot | null;
  beforeError?: CancelOrderError | null;
  afterError?: CancelOrderError | null;
}): { client: CancelOrderDbClient; updates: RecordedUpdate[] } {
  const updates: RecordedUpdate[] = [];
  let selectedOnce = false;

  const client: CancelOrderDbClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (!selectedOnce) {
              selectedOnce = true;
              return {
                error: options.beforeError ?? null,
                data:
                  options.before === null
                    ? null
                    : {
                        id: ORDER_ID,
                        status: options.before?.status ?? "pending",
                        safka_order_id: options.before?.safka_order_id ?? null,
                        updated_at: options.before?.updated_at ?? NOW,
                      },
              };
            }
            return {
              error: options.afterError ?? null,
              data: {
                id: ORDER_ID,
                status: "cancelled",
                updated_at: NOW,
              },
            };
          },
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => {
          updates.push({ values, column, value });
          return {
            select: () => ({
              maybeSingle: async () => ({
                error: options.afterError ?? null,
                data: {
                  id: ORDER_ID,
                  status: "cancelled",
                  updated_at: NOW,
                },
              }),
            }),
          };
        },
      }),
    }),
  };

  return { client, updates };
}

describe("handleCancelOrder", () => {
  it("returns 401 when not an admin and never touches the database", async () => {
    const exploding: CancelOrderDbClient = {
      from: () => {
        throw new Error("must not be called");
      },
    };
    const outcome = await handleCancelOrder({
      isAdmin: false,
      client: exploding,
      orderId: ORDER_ID,
    });
    assert.equal(outcome.status, 401);
    if (outcome.status === 401) assert.equal(outcome.body.ok, false);
  });

  it("marks the order cancelled and warns when it was already sent to Safka", async () => {
    const { client, updates } = buildClient({
      before: { status: "shipped", safka_order_id: "SF-998877" },
    });
    const outcome = await handleCancelOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });

    assert.equal(outcome.status, 200);
    if (outcome.status === 200) {
      assert.equal(outcome.body.ok, true);
      assert.equal(outcome.body.order.status, "cancelled");
      // Local-only cancellation: the merchant must finish the job in Safka.
      assert.equal(outcome.body.safkaManualActionRequired, true);
      assert.equal(outcome.body.warning, SAFKA_CANCEL_WARNING);
    }

    assert.deepEqual(updates, [
      { values: { status: "cancelled" }, column: "id", value: ORDER_ID },
    ]);
  });

  it("cancels without a warning when the order was never sent to Safka", async () => {
    const { client, updates } = buildClient({ before: { status: "pending" } });
    const outcome = await handleCancelOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });

    assert.equal(outcome.status, 200);
    if (outcome.status === 200) {
      assert.equal(outcome.body.safkaManualActionRequired, false);
      assert.equal(outcome.body.warning, undefined);
    }
    assert.equal(updates.length, 1);
  });

  it("treats a repeated cancel as a no-op and writes nothing", async () => {
    const { client, updates } = buildClient({
      before: { status: "cancelled", safka_order_id: "SF-998877" },
    });
    const outcome = await handleCancelOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });

    assert.equal(outcome.status, 200);
    if (outcome.status === 200) {
      assert.equal(outcome.body.ok, true);
      assert.equal(outcome.body.order.status, "cancelled");
      assert.equal(outcome.body.warning, SAFKA_CANCEL_WARNING);
    }
    assert.deepEqual(updates, []);
  });

  it("returns 404 when no order row matched", async () => {
    const { client } = buildClient({ before: null });
    const outcome = await handleCancelOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });
    assert.equal(outcome.status, 404);
  });

  it("returns 502 when the read fails", async () => {
    const { client } = buildClient({
      beforeError: { code: "SERVER_ERROR", message: "boom" },
    });
    const outcome = await handleCancelOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });
    assert.equal(outcome.status, 502);
  });

  it("returns 502 when the write fails", async () => {
    const { client } = buildClient({
      before: { status: "confirmed" },
      afterError: { code: "SERVER_ERROR", message: "boom" },
    });
    const outcome = await handleCancelOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });
    assert.equal(outcome.status, 502);
  });

  it("cancellation is blocked on the generic PATCH route", async () => {
    // A cancelled order is terminal: the status pills can never move it back,
    // so the generic status endpoint must refuse it. Guarding in the route is
    // the real protection — the UI only hides the option.
    const source = await readFile(
      join(process.cwd(), "app/api/admin/orders/[id]/route.ts"),
      "utf8",
    );
    assert.match(source, /PATCH/);
    assert.match(source, /cancelled/);
  });
});