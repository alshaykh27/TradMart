import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orderRequestSchema, isHoneypotFilled, cleanText } from "../lib/orders/schema.ts";

const uuid = "3f1c2b5a-9d6e-4a10-9b7f-3a2c1d0e8f66";
const cairoPriceListId = "646640cae83c5603c3cb3c41";

const validPayload = {
  customerName: "أحمد محمد",
  phone: "01012345678",
  country: "Egypt",
  city: "القاهرة",
  shippingGovernorate: cairoPriceListId,
  address: "المنطقة الأولى، شارع النيل 12",
  items: [{ productId: uuid, qty: 2 }],
};

describe("cleanText", () => {
  it("strips control characters and collapses whitespace", () => {
    assert.equal(cleanText("  a\u0000  b\u0001\u001F c  "), "a b c");
  });
});

describe("orderRequestSchema", () => {
  it("accepts a valid checkout payload", () => {
    const parsed = orderRequestSchema.safeParse(validPayload);
    assert.equal(parsed.success, true);
  });

  it("strips any client-supplied price (server re-prices from the DB)", () => {
    const parsed = orderRequestSchema.safeParse({
      ...validPayload,
      price: 0.01,
      total: 0.01,
      items: [{ productId: uuid, qty: 2, price: 0.01 }],
    });
    assert.ok(parsed.success);
    if (parsed.success) {
      assert.equal("price" in parsed.data, false);
      assert.equal("total" in parsed.data, false);
      assert.equal("price" in parsed.data.items[0], false);
    }
  });

  it("cleans whitespace from fields", () => {
    const parsed = orderRequestSchema.safeParse({
      ...validPayload,
      customerName: "  أحمد   محمد  ",
      address: "شارع   الاختبار",
    });
    assert.ok(parsed.success);
    if (parsed.success) {
      assert.equal(parsed.data.customerName, "أحمد محمد");
      assert.equal(parsed.data.address, "شارع الاختبار");
    }
  });

  it("rejects a missing name", () => {
    const parsed = orderRequestSchema.safeParse({ ...validPayload, customerName: "  " });
    assert.equal(parsed.success, false);
  });

  it("rejects an invalid phone number", () => {
    const parsed = orderRequestSchema.safeParse({ ...validPayload, phone: "abc" });
    assert.equal(parsed.success, false);
  });

  it("rejects an empty item list", () => {
    const parsed = orderRequestSchema.safeParse({ ...validPayload, items: [] });
    assert.equal(parsed.success, false);
  });

  it("rejects a missing governorate id (real membership is checked server-side)", () => {
    assert.equal(
      orderRequestSchema.safeParse({ ...validPayload, shippingGovernorate: "" }).success,
      false,
    );
    assert.equal(
      orderRequestSchema.safeParse({ ...validPayload, shippingGovernorate: "   " }).success,
      false,
    );
    assert.equal(
      orderRequestSchema.safeParse({ ...validPayload, shippingGovernorate: cairoPriceListId })
        .success,
      true,
    );
  });

  it("rejects a malformed product id", () => {
    const parsed = orderRequestSchema.safeParse({
      ...validPayload,
      items: [{ productId: "not-a-uuid", qty: 1 }],
    });
    assert.equal(parsed.success, false);
  });

  it("coerces and bounds quantities", () => {
    const ok = orderRequestSchema.safeParse({
      ...validPayload,
      items: [{ productId: uuid, qty: "7" }],
    });
    assert.ok(ok.success);
    if (ok.success) assert.equal(ok.data.items[0].qty, 7);

    const tooHigh = orderRequestSchema.safeParse({
      ...validPayload,
      items: [{ productId: uuid, qty: 100 }],
    });
    assert.equal(tooHigh.success, false);

    const zero = orderRequestSchema.safeParse({
      ...validPayload,
      items: [{ productId: uuid, qty: 0 }],
    });
    assert.equal(zero.success, false);
  });

  it("defaults the honeypot field when absent", () => {
    const parsed = orderRequestSchema.safeParse(validPayload);
    assert.ok(parsed.success);
    if (parsed.success) assert.equal(parsed.data.website, "");
  });
});

describe("isHoneypotFilled", () => {
  it("is false for empty or blank values", () => {
    assert.equal(isHoneypotFilled(undefined), false);
    assert.equal(isHoneypotFilled(""), false);
    assert.equal(isHoneypotFilled("   "), false);
  });

  it("is true when a bot fills the hidden field", () => {
    assert.equal(isHoneypotFilled("http://spam.example"), true);
  });
});