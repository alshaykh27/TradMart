import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSafkaOrderPayload,
  resolveSafkaPropertyId,
} from "../lib/safka/order-payload.ts";

const CAIRO_PRICE_LIST_ID = "646640cae83c5603c3cb3c41";
const SOHAG_PRICE_LIST_ID = "64879004dc16090c1858e69e";

const baseInput = {
  clientName: "أحمد محمد",
  phone: "01012345678",
  address: "شارع النيل 12",
  city: "القاهرة",
  shippingGovernorate: CAIRO_PRICE_LIST_ID,
  total: 560, // product subtotal (display prices), excluding shipping
  note: "",
  lines: [
    {
      safkaProductId: "6a8f3489ff4bc0f14e9997ff",
      safkaPropertyId: "6a8f3489ff4bc0f14e999800",
      quantity: 2,
      commission: 145,
    },
  ],
};

describe("resolveSafkaPropertyId", () => {
  it("returns null for non-arrays and empty arrays", () => {
    assert.equal(resolveSafkaPropertyId(null), null);
    assert.equal(resolveSafkaPropertyId("x"), null);
    assert.equal(resolveSafkaPropertyId([]), null);
  });

  it("returns the first valid _id", () => {
    assert.equal(
      resolveSafkaPropertyId([{ _id: "abc" }, { _id: "def" }]),
      "abc",
    );
    assert.equal(resolveSafkaPropertyId([{ key: "no id" }, { _id: "def" }]), "def");
  });
});

describe("buildSafkaOrderPayload", () => {
  it("maps lines to the Safka contract (qty is a string)", () => {
    const { payload, warnings } = buildSafkaOrderPayload(baseInput);
    assert.deepEqual(payload.items, [
      { product: "6a8f3489ff4bc0f14e9997ff", property: "6a8f3489ff4bc0f14e999800", qty: "2" },
    ]);
    assert.deepEqual(warnings, []);
  });

  it("sends the address as-is (no city/country appended) and city in its own field", () => {
    const { payload } = buildSafkaOrderPayload(baseInput);
    assert.equal(payload.client_name, "أحمد محمد");
    assert.equal(payload.client_phone1, "01012345678");
    assert.equal(payload.client_phone2, "");
    assert.equal(payload.client_address, "شارع النيل 12");
    assert.equal(payload.city, "القاهرة");
    assert.equal(payload.note, "");
  });

  it("forwards the price-list _id as shipping_governorate verbatim", () => {
    const cairo = buildSafkaOrderPayload(baseInput);
    assert.equal(cairo.payload.shipping_governorate, CAIRO_PRICE_LIST_ID);
    const sohag = buildSafkaOrderPayload({ ...baseInput, shippingGovernorate: SOHAG_PRICE_LIST_ID });
    assert.equal(sohag.payload.shipping_governorate, SOHAG_PRICE_LIST_ID);
  });

  it("omits the optional page_id / page_name fields", () => {
    const { payload } = buildSafkaOrderPayload(baseInput);
    assert.equal("page_id" in payload, false);
    assert.equal("page_name" in payload, false);
  });

  it("reports total as the product subtotal and commission as the summed commission", () => {
    const { payload } = buildSafkaOrderPayload(baseInput);
    assert.equal(payload.total, 560);
    assert.equal(payload.commission, 290);
  });

  it("warns and sends an empty id when the order has no governorate", () => {
    const { payload, warnings } = buildSafkaOrderPayload({
      ...baseInput,
      shippingGovernorate: null,
    });
    assert.equal(payload.shipping_governorate, "");
    assert.match(warnings.join(" "), /shipping governorate/);
  });

  it("sums the per-unit commission across quantities", () => {
    const { payload } = buildSafkaOrderPayload({
      ...baseInput,
      lines: [
        { safkaProductId: "a", safkaPropertyId: "pa", quantity: 2, commission: 10 },
        { safkaProductId: "b", safkaPropertyId: "pb", quantity: 3, commission: 5.5 },
      ],
    });
    assert.equal(payload.commission, 36.5);
  });

  it("warns when a property id could not be resolved", () => {
    const { warnings } = buildSafkaOrderPayload({
      ...baseInput,
      lines: [{ ...baseInput.lines[0], safkaPropertyId: null }],
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /property id/);
  });

  it("skips lines with no Safka product id and warns", () => {
    const { payload, warnings } = buildSafkaOrderPayload({
      ...baseInput,
      lines: [{ ...baseInput.lines[0], safkaProductId: null }],
    });
    assert.equal(payload.items.length, 0);
    assert.match(warnings.join(" "), /no Safka product id/);
  });

  it("rounds money to 2 decimals", () => {
    const { payload } = buildSafkaOrderPayload({ ...baseInput, total: 560.129 });
    assert.equal(payload.total, 560.13);
  });
});