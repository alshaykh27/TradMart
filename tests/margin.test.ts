import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeMargin, LOW_MARKUP_MARGIN } from "../lib/admin/margin.ts";

describe("computeMargin", () => {
  it("computes profit, margin and healthy flag", () => {
    const preview = computeMargin(100, 60, 10);
    assert.equal(preview?.profit, 30);
    assert.equal(preview?.margin, 0.3);
    assert.equal(preview?.low, false);
  });

  it("flags a low margin under the threshold", () => {
    assert.equal(computeMargin(100, 80, 10)?.low, true); // margin 0.10
    assert.equal(computeMargin(100, 85, 1)?.low, true); // margin 0.14
  });

  it("flags a loss (profit <= 0)", () => {
    const preview = computeMargin(100, 90, 15);
    assert.equal(preview?.profit, -5);
    assert.equal(preview?.low, true);
  });

  it("treats a null commission as zero", () => {
    const preview = computeMargin(100, 60, null);
    assert.equal(preview?.profit, 40);
    assert.equal(preview?.low, false);
  });

  it("returns null when there is no usable price", () => {
    assert.equal(computeMargin(0, 50, 10), null);
    assert.equal(computeMargin(-1, 50, 10), null);
  });

  it("exports a sane threshold", () => {
    assert.equal(LOW_MARKUP_MARGIN, 0.15);
  });
});