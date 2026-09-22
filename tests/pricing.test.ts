import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { roundMoney, lineTotal, computeOrderTotals } from "../lib/orders/pricing.ts";

describe("roundMoney", () => {
  it("keeps clean decimals", () => {
    assert.equal(roundMoney(0.3), 0.3);
    assert.equal(roundMoney(10.5), 10.5);
  });

  it("rounds money to 2 decimals without float drift", () => {
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(10.125), 10.13);
    assert.equal(roundMoney(10.124), 10.12);
    assert.equal(roundMoney(99.999), 100);
  });
});

describe("lineTotal", () => {
  it("multiplies and rounds per line", () => {
    assert.equal(lineTotal(99.99, 3), 299.97);
    assert.equal(lineTotal(0.05, 1), 0.05);
  });
});

describe("computeOrderTotals", () => {
  it("sums subtotal and the governorate shipping fee", () => {
    assert.deepEqual(computeOrderTotals(500, 85), {
      subtotal: 500,
      shippingFee: 85,
      total: 585,
    });
  });

  it("adds the markup by passing the final fee", () => {
    assert.deepEqual(computeOrderTotals(150, 85 + 10), {
      subtotal: 150,
      shippingFee: 95,
      total: 245,
    });
  });

  it("never emits a negative subtotal or shipping fee", () => {
    const totals = computeOrderTotals(-10, -5);
    assert.equal(totals.subtotal, 0);
    assert.equal(totals.shippingFee, 0);
    assert.equal(totals.total, 0);
  });
});