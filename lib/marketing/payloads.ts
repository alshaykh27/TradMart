import { createHash } from "node:crypto";
import {
  MARKETING_CURRENCY,
  normaliseNameForHash,
  normalisePhoneForHash,
  tiktokEventName,
  type StandardEvent,
} from "./config.ts";

/**
 * Payload builders for the server-side conversion APIs.
 *
 * Split out from server-events.ts so they stay unit-testable: lib/marketing/
 * config.ts documents that a testable module must not import `server-only`,
 * because that package cannot be resolved by `node --test`.
 *
 * Nothing here performs I/O. The access tokens are passed in by the caller
 * from settings; they are never hardcoded, logged, or accepted from the client.
 */

export type MetaUserData = {
  /** SHA-256 hex, lowercase. Never the raw phone. */
  ph?: string;
  /** SHA-256 hex, lowercase. Never the raw name. */
  fn?: string;
  ln?: string;
  client_ip_address?: string;
  client_user_agent?: string;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type MetaUserDataInput = {
  phone?: string | null;
  customerName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Builds Meta `user_data`. Meta's Conversions API requires `ph`/`fn` to be
 * SHA-256 hashed, so that is what we send — the raw phone and name stay inside
 * this process. `client_ip_address` / `client_user_agent` are included because
 * they are how Meta matches a server event to its browser counterpart.
 */
export function buildMetaUserData(input: MetaUserDataInput): MetaUserData {
  const data: MetaUserData = {};

  if (input.phone) {
    const phone = normalisePhoneForHash(input.phone);
    if (phone) data.ph = sha256Hex(phone);
  }

  if (input.customerName) {
    const { fn, ln } = normaliseNameForHash(input.customerName);
    if (fn) data.fn = sha256Hex(fn);
    if (ln) data.ln = sha256Hex(ln);
  }

  if (input.ip) data.client_ip_address = input.ip;
  if (input.userAgent) data.client_user_agent = input.userAgent;

  return data;
}

export type MetaCapiPayloadInput = {
  eventName: StandardEvent;
  /** Dedup key. Must equal the `eventID` the browser pixel fired. */
  eventId: string;
  eventTime: number;
  eventSourceUrl?: string | null;
  currency?: string | null;
  value?: number | null;
  numItems?: number | null;
  contentIds?: string[] | null;
  userData?: MetaUserData;
};

export function buildMetaCapiPayload(input: MetaCapiPayloadInput): Record<string, unknown> {
  const customData: Record<string, unknown> = {
    currency: input.currency ?? MARKETING_CURRENCY,
  };

  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    customData.value = roundMoney(input.value);
  }
  if (typeof input.numItems === "number" && Number.isFinite(input.numItems)) {
    customData.num_items = Math.trunc(input.numItems);
  }
  if (input.contentIds && input.contentIds.length > 0) {
    customData.content_ids = input.contentIds;
    customData.content_type = "product";
  }

  const event: Record<string, unknown> = {
    event_name: input.eventName,
    // Conversions API casing is `event_id`; the browser pixel uses `eventID`.
    // Swapping them silently disables deduplication, so tests pin both.
    event_id: input.eventId,
    event_time: input.eventTime,
    action_source: "website",
    user_data: input.userData ?? {},
    custom_data: customData,
  };

  if (input.eventSourceUrl) {
    event.event_source_url = input.eventSourceUrl;
  }

  return { data: [event] };
}

export type TikTokEventsPayloadInput = {
  eventName: StandardEvent;
  eventId: string;
  eventTime: number;
  pixelCode: string;
  accessToken: string;
  currency?: string | null;
  value?: number | null;
  numItems?: number | null;
  contentIds?: string[] | null;
  contentNames?: string[] | null;
};

/**
 * Builds a TikTok Events API payload. Deliberately carries NO user data: TikTok
 * accepts an event without it, and omitting it keeps personal data out of a
 * third party entirely.
 */
export function buildTikTokEventsPayload(input: TikTokEventsPayloadInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event_name: tiktokEventName(input.eventName),
    event_time: input.eventTime,
    // TikTok uses `event_id` on both the pixel and the Events API.
    event_id: input.eventId,
    pixel_code: input.pixelCode,
    access_token: input.accessToken,
  };

  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    payload.value = roundMoney(input.value);
    payload.currency = input.currency ?? MARKETING_CURRENCY;
  }
  if (typeof input.numItems === "number" && Number.isFinite(input.numItems)) {
    payload.num_items = Math.trunc(input.numItems);
  }
  if (input.contentIds && input.contentIds.length > 0) {
    payload.content_id = input.contentIds[0];
    payload.content_type = "product";
  }
  if (input.contentNames && input.contentNames.length > 0) {
    payload.content_name = input.contentNames[0];
  }

  return payload;
}
