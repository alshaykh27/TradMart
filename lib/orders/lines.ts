import { lineTotal, roundMoney } from "./pricing.ts";

/**
 * Pure, dependency-free decision logic for turning a validated cart into
 * order lines. Kept apart from lib/orders/create.ts (which does the DB I/O and
 * imports "server-only") so it is unit-testable with the Node test runner.
 *
 * Prices always come from the database product row passed in here — the
 * browser never supplies a price.
 */

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export type OrderableProduct = {
  id: string;
  price: number;
  stock: number | null;
  is_published: boolean;
  status: string;
};

export type OrderLine = {
  product_id: string;
  quantity: number;
  price: number;
};

export type BuiltOrderLines = {
  rows: OrderLine[];
  subtotal: number;
};

export function buildOrderLines(
  requested: Map<string, number>,
  products: OrderableProduct[],
): BuiltOrderLines {
  const byId = new Map(products.map((product) => [product.id, product]));

  let subtotal = 0;
  const rows: OrderLine[] = [];

  for (const [productId, qty] of requested) {
    const product = byId.get(productId);
    if (!product || !product.is_published || product.status !== "active") {
      throw new OrderValidationError("An item in the cart is no longer available");
    }
    if ((product.stock ?? 0) <= 0) {
      throw new OrderValidationError("One of the products is out of stock");
    }

    const price = Number(product.price);
    subtotal += lineTotal(price, qty);
    rows.push({ product_id: productId, quantity: qty, price });
  }

  return { rows, subtotal: roundMoney(subtotal) };
}
