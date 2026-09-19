import type { Tables, TablesInsert, TablesUpdate } from "./database";

export type Order = Tables<"orders">;
export type OrderInsert = TablesInsert<"orders">;
export type OrderUpdate = TablesUpdate<"orders">;

export type OrderItem = Tables<"order_items">;
export type OrderItemInsert = TablesInsert<"order_items">;

// Statuses listed here are placeholders. Phase 8 will align them with the
// statuses Safka actually sends via orderHook.
export const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderWithItems = Order & {
  order_items: OrderItem[];
};
