import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  UNSENT_ORDER_GRACE_MINUTES,
  unsentThresholdIso,
} from "../lib/admin/unsent.ts";

const NOW = new Date("2026-09-22T12:00:00.000Z");

describe("unsentThresholdIso", () => {
  it("defaults to the 30-minute grace period", () => {
    assert.equal(UNSENT_ORDER_GRACE_MINUTES, 30);
    assert.equal(
      unsentThresholdIso(NOW),
      "2026-09-22T11:30:00.000Z",
    );
  });

  it("accepts a custom grace period in minutes", () => {
    assert.equal(
      unsentThresholdIso(NOW, 10),
      "2026-09-22T11:50:00.000Z",
    );
    assert.equal(
      unsentThresholdIso(NOW, 0),
      "2026-09-22T12:00:00.000Z",
    );
  });
});