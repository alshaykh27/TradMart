import type { Tables, TablesInsert, TablesUpdate } from "./database";

export type Order = Tables<"orders">;
export type OrderInsert = TablesInsert<"orders">;
export type OrderUpdate = TablesUpdate<"orders">;

export type OrderItem = Tables<"order_items">;
export type OrderItemInsert = TablesInsert<"order_items">;

// Statuses live in lib/orders/status.ts (one vocabulary shared with the
// customer tracking page) — re-exported here for convenience.
export {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGES,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/orders/status";

export type OrderWithItems = Order & {
  order_items: OrderItem[];
};