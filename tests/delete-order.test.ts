import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  handleDeleteOrder,
  type DbClient,
  type DeleteOrderError,
} from "../lib/admin/delete-order.ts";

const ORDER_ID = "11111111-2222-3333-4444-555555555555";

type RecordedCall = { table: string; column: string; value: unknown };

function buildClient(result: {
  error: DeleteOrderError | null;
  data?: unknown;
}): { client: DbClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client: DbClient = {
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, value: unknown) => ({
          select: () => ({
            maybeSingle: async () => {
              calls.push({ table, column, value });
              return { error: result.error, data: result.data ?? { id: ORDER_ID } };
            },
          }),
        }),
      }),
    }),
  };
  return { client, calls };
}

describe("handleDeleteOrder", () => {
  it("returns 401 when not an admin and never touches the database", async () => {
    const exploding: DbClient = {
      from: () => {
        throw new Error("must not be called");
      },
    };
    const outcome = await handleDeleteOrder({
      isAdmin: false,
      client: exploding,
      orderId: ORDER_ID,
    });
    assert.equal(outcome.status, 401);
    if (outcome.status === 401) assert.equal(outcome.body.ok, false);
  });

  it("deletes the order by id — order_items go with it via ON DELETE CASCADE", async () => {
    const { client, calls } = buildClient({ error: null });
    const outcome = await handleDeleteOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });

    assert.equal(outcome.status, 200);
    if (outcome.status === 200) assert.equal(outcome.body.ok, true);

    assert.deepEqual(calls, [
      { table: "orders", column: "id", value: ORDER_ID },
    ]);
  });

  it("guards the cascade contract in the schema (order_items FK has on delete cascade)", async () => {
    const migration = await readFile(
      join(process.cwd(), "supabase/migrations/20260919000000_init.sql"),
      "utf8",
    );
    assert.match(
      migration,
      /order_id\s+uuid\s+not null\s+references\s+public\.orders\s*\(id\)\s+on\s+delete\s+cascade/i,
    );
  });

  it("returns 404 when no order row matched (PGRST116)", async () => {
    const { client } = buildClient({
      error: { code: "PGRST116", message: "no rows" },
    });
    const outcome = await handleDeleteOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });
    assert.equal(outcome.status, 404);
  });

  it("returns 502 when the database fails for another reason", async () => {
    const { client } = buildClient({
      error: { code: "SERVER_ERROR", message: "boom" },
    });
    const outcome = await handleDeleteOrder({
      isAdmin: true,
      client,
      orderId: ORDER_ID,
    });
    assert.equal(outcome.status, 502);
  });
});