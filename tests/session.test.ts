import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SESSION_TTL_MS,
  createSessionToken,
  verifySessionToken,
  safeEqualStrings,
} from "../lib/admin/session.ts";

const SECRET = "correct horse battery staple 42!";

describe("createSessionToken / verifySessionToken", () => {
  it("returns a valid token for the right secret", () => {
    const token = createSessionToken(SECRET, Date.now());
    assert.equal(verifySessionToken(token, SECRET), true);
  });

  it("rejects a token with the wrong secret", () => {
    const token = createSessionToken(SECRET, Date.now());
    assert.equal(verifySessionToken(token, "another-secret"), false);
  });

  it("rejects tampered tokens", () => {
    const token = createSessionToken(SECRET, Date.now());
    const flippedExpires = token.replace(/^\d+/, "9999999999");
    assert.equal(verifySessionToken(flippedExpires, SECRET), false);

    const [exp, sig] = token.split(".");
    const flippedSig = `${exp}.${sig === "f".repeat(64) ? "e" : "f"}${sig.slice(1)}`;
    assert.equal(verifySessionToken(flippedSig, SECRET), false);
  });

  it("rejects expired tokens", () => {
    const now = 1_000_000_000_000;
    const token = createSessionToken(SECRET, now);
    assert.equal(
      verifySessionToken(token, SECRET, now + ADMIN_SESSION_TTL_MS + 1000),
      false,
    );
  });

  it("accepts a token that has not expired yet", () => {
    const now = 1_000_000_000_000;
    const token = createSessionToken(SECRET, now);
    assert.equal(
      verifySessionToken(token, SECRET, now + ADMIN_SESSION_TTL_MS - 1000),
      true,
    );
  });

  it("rejects empty, malformed and non-numeric payloads", () => {
    assert.equal(verifySessionToken(null, SECRET), false);
    assert.equal(verifySessionToken("", SECRET), false);
    assert.equal(verifySessionToken("not-a-token", SECRET), false);
    assert.equal(verifySessionToken("abc.def", SECRET), false);
    assert.equal(verifySessionToken(`${"1".repeat(32)}.${"ab"}`, SECRET), false);
  });
});

describe("safeEqualStrings", () => {
  it("compares equal and differing strings", () => {
    assert.equal(safeEqualStrings("same", "same"), true);
    assert.equal(safeEqualStrings("same", "SAME"), false);
    assert.equal(safeEqualStrings("", ""), true);
    assert.equal(safeEqualStrings("longer", "s"), false);
  });
});