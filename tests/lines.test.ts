import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildOrderLines, OrderValidationError } from "../lib/orders/lines.ts";

function product(overrides: Partial<Parameters<typeof buildOrderLines>[1][number]> = {}) {
  return {
    id: "p1",
    price: 120,
    stock: 5,
    is_published: true,
    status: "active",
    ...overrides,
  };
}

describe("buildOrderLines", () => {
  it("prices every line from the database product and sums the subtotal", () => {
    const requested = new Map<string, number>([
      ["p1", 2],
      ["p2", 3],
    ]);
    const products = [
      product({ id: "p1", price: 120 }),
      product({ id: "p2", price: 30.5 }),
    ];

    const { rows, subtotal } = buildOrderLines(requested, products);

    assert.deepEqual(rows, [
      { product_id: "p1", quantity: 2, price: 120 },
      { product_id: "p2", quantity: 3, price: 30.5 },
    ]);
    assert.equal(subtotal, 331.5);
  });

  it("uses the DB price, not any value from the request map", () => {
    // The requested map only ever carries { productId -> qty }.
    const { rows } = buildOrderLines(new Map([["p1", 1]]), [product({ price: 9.99 })]);
    assert.equal(rows[0].price, 9.99);
  });

  it("rejects a product that is not published", () => {
    assert.throws(
      () => buildOrderLines(new Map([["p1", 1]]), [product({ is_published: false })]),
      OrderValidationError,
    );
  });

  it("rejects a product that is not active", () => {
    assert.throws(
      () => buildOrderLines(new Map([["p1", 1]]), [product({ status: "inactive" })]),
      OrderValidationError,
    );
  });

  it("rejects an out-of-stock product", () => {
    assert.throws(
      () => buildOrderLines(new Map([["p1", 1]]), [product({ stock: 0 })]),
      OrderValidationError,
    );
  });

  it("rejects a product with unknown stock", () => {
    assert.throws(
      () => buildOrderLines(new Map([["p1", 1]]), [product({ stock: null })]),
      OrderValidationError,
    );
  });

  it("rejects a product id that is not in the database", () => {
    assert.throws(
      () => buildOrderLines(new Map([["missing", 1]]), [product()]),
      OrderValidationError,
    );
  });
});