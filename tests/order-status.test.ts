import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGES,
  ORDER_TRACKING_STEPS,
  completedStepCount,
  isCancelled,
  isOrderStatus,
  trackingStepIndex,
} from "../lib/orders/status.ts";

describe("order status vocabulary", () => {
  it("cancelled is a status but NOT a tracking step", () => {
    assert.ok(ORDER_STATUSES.includes("cancelled"));
    assert.ok(!ORDER_TRACKING_STEPS.includes("cancelled" as never));
    assert.equal(ORDER_TRACKING_STEPS.length, 4);
  });

  it("the tracking steps are the linear happy path, in order", () => {
    assert.deepEqual([...ORDER_TRACKING_STEPS], [
      "pending",
      "confirmed",
      "shipped",
      "delivered",
    ]);
  });

  it("every status has an Arabic label and a badge class", () => {
    for (const status of ORDER_STATUSES) {
      assert.equal(typeof ORDER_STATUS_LABELS[status], "string", status);
      assert.ok(ORDER_STATUS_LABELS[status].length > 0, status);
      assert.match(ORDER_STATUS_BADGES[status], /^bg-/, status);
    }
  });

  it("isOrderStatus rejects values outside the vocabulary", () => {
    assert.ok(isOrderStatus("shipped"));
    assert.ok(!isOrderStatus("returned"));
    assert.ok(!isOrderStatus(""));
  });

  it("isCancelled is true only for cancelled", () => {
    assert.ok(isCancelled("cancelled"));
    assert.ok(!isCancelled("delivered"));
  });
});

describe("trackingStepIndex", () => {
  it("maps each happy-path status to its position", () => {
    assert.equal(trackingStepIndex("pending"), 0);
    assert.equal(trackingStepIndex("confirmed"), 1);
    assert.equal(trackingStepIndex("shipped"), 2);
    assert.equal(trackingStepIndex("delivered"), 3);
  });

  it("returns -1 for cancelled and for unknown values", () => {
    assert.equal(trackingStepIndex("cancelled"), -1);
    assert.equal(trackingStepIndex("nonsense"), -1);
  });
});

describe("completedStepCount", () => {
  it("is one-based so the current step is always shown as reached", () => {
    assert.equal(completedStepCount("pending"), 1);
    assert.equal(completedStepCount("confirmed"), 2);
    assert.equal(completedStepCount("shipped"), 3);
    assert.equal(completedStepCount("delivered"), ORDER_TRACKING_STEPS.length);
  });

  it("reports 0 for a cancelled order — never a partially filled track", () => {
    assert.equal(completedStepCount("cancelled"), 0);
  });

  it("reports 0 for an unknown status so the caller can fall back", () => {
    assert.equal(completedStepCount("nonsense"), 0);
  });
});