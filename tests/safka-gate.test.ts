import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSafkaSendAllowed, type SafkaSendMode } from "../lib/safka/gate.ts";

const cases: {
  name: string;
  enabled: boolean;
  autoForward: boolean;
  mode: SafkaSendMode;
  expected: boolean;
}[] = [
  {
    name: "admin send is allowed once the master switch is on",
    enabled: true,
    autoForward: false,
    mode: "admin",
    expected: true,
  },
  {
    name: "checkout does NOT auto-send with only the master switch on",
    enabled: true,
    autoForward: false,
    mode: "checkout",
    expected: false,
  },
  {
    name: "checkout auto-sends only when both switches are on",
    enabled: true,
    autoForward: true,
    mode: "checkout",
    expected: true,
  },
  {
    name: "nothing can send while the master switch is off",
    enabled: false,
    autoForward: true,
    mode: "admin",
    expected: false,
  },
  {
    name: "nothing can send while the master switch is off (checkout too)",
    enabled: false,
    autoForward: true,
    mode: "checkout",
    expected: false,
  },
];

describe("isSafkaSendAllowed", () => {
  for (const testCase of cases) {
    it(`allows? — ${testCase.name}`, () => {
      assert.equal(
        isSafkaSendAllowed({
          enabled: testCase.enabled,
          autoForward: testCase.autoForward,
          mode: testCase.mode,
        }),
        testCase.expected,
      );
    });
  }
});