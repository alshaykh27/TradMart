import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  getClientIp,
  resetRateLimit,
} from "../lib/orders/rate-limit.ts";

const options = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimit());

  it("allows requests up to the limit within the window", () => {
    const t0 = 1_000_000;
    assert.equal(checkRateLimit("ip", options, t0).allowed, true);
    assert.equal(checkRateLimit("ip", options, t0 + 100).allowed, true);
    assert.equal(checkRateLimit("ip", options, t0 + 200).allowed, true);
  });

  it("rejects once the limit is reached and reports retry-after", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("ip", options, t0 + i);
    const blocked = checkRateLimit("ip", options, t0 + 1000);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds >= 1);
  });

  it("slides the window so old hits expire", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("ip", options, t0 + i * 10);
    // Just inside the window: still blocked.
    assert.equal(checkRateLimit("ip", options, t0 + 60_000 - 1).allowed, false);
    // First hit (t0) fell out of the window.
    assert.equal(checkRateLimit("ip", options, t0 + 60_000).allowed, true);
  });

  it("tracks separate keys independently", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("a", options, t0 + i);
    assert.equal(checkRateLimit("b", options, t0).allowed, true);
  });
});

describe("getClientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const request = new Request("http://localhost/api/orders", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    assert.equal(getClientIp(request), "1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const request = new Request("http://localhost/api/orders", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    assert.equal(getClientIp(request), "9.9.9.9");
  });

  it("returns unknown when no forwarding headers exist", () => {
    const request = new Request("http://localhost/api/orders");
    assert.equal(getClientIp(request), "unknown");
  });
});