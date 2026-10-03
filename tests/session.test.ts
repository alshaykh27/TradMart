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

    // Corrupt a FIXED position with a guaranteed-different hex character, rather
    // than overwriting the first character. The previous version prefixed "f"
    // unconditionally, so whenever the signature already began with "f" the
    // rewrite was a no-op: the "tampered" token equalled the original, verify()
    // correctly returned true, and this assertion failed roughly 6% of runs.
    const lastChar = sig.slice(-1);
    const replacement = lastChar === "0" ? "1" : "0";
    const tamperedSig = `${exp}.${sig.slice(0, -1)}${replacement}`;

    // Guard the guard: if the rewrite ever stops changing the token, fail loudly
    // here rather than as a confusing verify() mismatch.
    assert.notEqual(tamperedSig, token, "tampering must actually alter the token");
    assert.equal(sig.length, 64, "signature must stay 64 hex chars");
    assert.match(tamperedSig, new RegExp(`^\\d+\\.[0-9a-f]{64}$`), "must stay well-formed hex");
    assert.equal(verifySessionToken(tamperedSig, SECRET), false);
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