"use client";

import {
  metaBrowserParams,
  tiktokBrowserParams,
  tiktokEventName,
  type CommerceEventInput,
  type StandardEvent,
} from "./config.ts";

/**
 * Thin, safe wrappers over the two vendor browser globals.
 *
 * Both snippets are only injected when the corresponding Pixel ID is configured
 * (see components/marketing/PixelScripts), so `window.fbq` / `window.ttq`
 * being absent is the normal "this platform is off" case rather than an error.
 * Every call is therefore a no-op when the global is missing — which is what
 * satisfies "skip that platform entirely, no errors, no script loaded".
 */

type FbqFn = (command: string, ...args: unknown[]) => void;
type TtqFn = { track: (event: string, params?: unknown) => void };

type PixelGlobals = {
  fbq?: FbqFn;
  ttq?: TtqFn;
};

function getGlobals(): PixelGlobals | null {
  if (typeof window === "undefined") return null;
  return window as unknown as PixelGlobals;
}

/**
 * Fires one event on both platforms. Never throws and never rejects: a tracking
 * failure must not break a customer's shopping flow.
 */
export function trackMarketingEvent(
  event: StandardEvent,
  input: CommerceEventInput = {},
): void {
  const globals = getGlobals();
  if (!globals) return;

  try {
    if (typeof globals.fbq === "function") {
      globals.fbq("track", event, metaBrowserParams(event, input) ?? {});
    }
  } catch {
    // Analytics is best-effort; swallow.
  }

  try {
    if (globals.ttq && typeof globals.ttq.track === "function") {
      globals.ttq.track(tiktokEventName(event), tiktokBrowserParams(event, input) ?? {});
    }
  } catch {
    // Analytics is best-effort; swallow.
  }
}
