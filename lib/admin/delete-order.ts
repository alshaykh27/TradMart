/**
 * Admin order-deletion handler, extracted from the route so the auth gate,
 * cascade contract and error mapping are unit-testable without a database.
 *
 * Cascade note: order_items.order_id references public.orders(id) ON DELETE
 * CASCADE (init migration), so deleting the order row also removes its items —
 * no manual two-step delete is needed. A PostgREST PGRST116 (no matching row)
 * maps to 404; any other database error maps to 502.
 */

export interface DeleteOrderError {
  code?: string;
  message: string;
}

export interface DbClient {
  from(table: string): {
    delete(): {
      eq(column: string, value: unknown): {
        select(columns: string): {
          maybeSingle(): PromiseLike<{
            error: DeleteOrderError | null;
            data: unknown;
          }>;
        };
      };
    };
  };
}

export type DeleteOrderOutcome =
  | { status: 401; body: { ok: false; error: string } }
  | { status: 404; body: { ok: false; error: string } }
  | { status: 502; body: { ok: false; error: string } }
  | { status: 200; body: { ok: true } };

export async function handleDeleteOrder(input: {
  isAdmin: boolean;
  client: DbClient;
  orderId: string;
}): Promise<DeleteOrderOutcome> {
  const { isAdmin, client, orderId } = input;

  if (!isAdmin) {
    return { status: 401, body: { ok: false, error: "غير مصرح" } };
  }

  const { error } = await client
    .from("orders")
    .delete()
    .eq("id", orderId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      return { status: 404, body: { ok: false, error: "الطلب غير موجود" } };
    }
    return { status: 502, body: { ok: false, error: "تعذّر حذف الطلب" } };
  }

  return { status: 200, body: { ok: true } };
}