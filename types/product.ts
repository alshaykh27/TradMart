import type { Tables, TablesInsert, TablesUpdate } from "./database";

export type Product = Tables<"products">;
export type ProductInsert = TablesInsert<"products">;
export type ProductUpdate = TablesUpdate<"products">;

export const PRODUCT_STATUSES = ["active", "inactive"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/**
 * Where a product row came from.
 *
 *   safka  — mirrored from the Safka API / product webhook. The sync may
 *            create, refresh or deactivate these rows.
 *   manual — typed in by hand from the admin panel. No Safka id, and every
 *            Safka write path filters these out so a sync can never touch,
 *            deactivate or overwrite them.
 */
export const PRODUCT_SOURCES = ["safka", "manual"] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];

export function isProductSource(value: string): value is ProductSource {
  return (PRODUCT_SOURCES as readonly string[]).includes(value);
}