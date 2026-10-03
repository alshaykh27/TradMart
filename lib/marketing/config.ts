/**
 * Pure helpers for the marketing pixels (Meta + TikTok).
 *
 * Deliberately NOT `server-only` and deliberately free of `@/` aliases and
 * `node:crypto`, so `node --test` can load this file directly (same convention
 * as lib/orders/pricing.ts and lib/admin/session.ts) AND so client components
 * can import the validation helpers without pulling anything server-side in.
 *
 * Everything here is total: plain values in, plain values out. That is what
 * makes the two rules that matter testable rather than merely intended:
 *   1. A platform with no Pixel ID is skipped entirely (no script, no event).
 *   2. `buildPublicConfig` cannot return an access token, because it only ever
 *      copies the two ID fields.
 */

export const MARKETING_CURRENCY = "EGP";

export type MarketingSettings = {
  metaPixelId: string | null;
  metaCapiToken: string | null;
  tiktokPixelId: string | null;
  tiktokApiToken: string | null;
};

export type PublicMarketingConfig = {
  metaPixelId: string | null;
  tiktokPixelId: string | null;
};

export type MarketingPlatforms = {
  /** Render the Meta browser pixel and fire fbq events. */
  metaPixel: boolean;
  /** Send Meta Conversions API events from the server. */
  metaConversionsApi: boolean;
  /** Render the TikTok browser pixel and fire ttq events. */
  tiktokPixel: boolean;
  /** Send TikTok Events API events from the server. */
  tiktokEventsApi: boolean;
};

/** Standard events both platforms support. */
export type StandardEvent =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export type CommerceEventInput = {
  /**
   * Shared dedup key. Meta's *browser* pixel spells this `eventID` while its
   * Conversions API spells it `event_id`; getting that backwards silently
   * disables deduplication, so the mapping lives here and is unit-tested.
   */
  eventId?: string | null;
  value?: number | null;
  numItems?: number | null;
  contentIds?: string[] | null;
  contentNames?: string[] | null;
  currency?: string | null;
};

// --- validation ------------------------------------------------------------

const MAX_PIXEL_ID_LENGTH = 64;
const MAX_TOKEN_LENGTH = 512;

/** Meta Pixel IDs are purely numeric. */
const META_PIXEL_ID_PATTERN = /^[0-9]{6,20}$/;
/** TikTok Pixel IDs look like `C9DQ0U05C8U8A8A8Q`. */
const TIKTOK_PIXEL_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;

/**
 * Normalises a submitted Pixel ID. Returns null for anything blank or
 * implausible so a bad paste can never be interpolated into a script tag.
 */
export function cleanPixelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PIXEL_ID_LENGTH) return null;
  return trimmed;
}

export function isValidMetaPixelId(value: unknown): value is string {
  return typeof value === "string" && META_PIXEL_ID_PATTERN.test(value.trim());
}

export function isValidTikTokPixelId(value: unknown): value is string {
  return typeof value === "string" && TIKTOK_PIXEL_ID_PATTERN.test(value.trim());
}

/**
 * Access tokens are opaque strings. We only bound the length and reject
 * whitespace, because a token is pasted verbatim — we cannot second-guess its
 * shape without breaking the owner.
 */
export function isValidAccessToken(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TOKEN_LENGTH && !/\s/.test(trimmed);
}

/**
 * Normalises an incoming settings row into the shape used everywhere else,
 * dropping anything that fails validation. An invalid stored value is treated
 * exactly like a missing one, so a bad row can never break a page render.
 */
export function normaliseMarketingSettings(row: {
  meta_pixel_id?: string | null;
  meta_capi_token?: string | null;
  tiktok_pixel_id?: string | null;
  tiktok_api_token?: string | null;
} | null | undefined): MarketingSettings {
  return {
    metaPixelId: isValidMetaPixelId(row?.meta_pixel_id)
      ? row!.meta_pixel_id!.trim()
      : null,
    metaCapiToken: isValidAccessToken(row?.meta_capi_token)
      ? row!.meta_capi_token!.trim()
      : null,
    tiktokPixelId: isValidTikTokPixelId(row?.tiktok_pixel_id)
      ? row!.tiktok_pixel_id!.trim()
      : null,
    tiktokApiToken: isValidAccessToken(row?.tiktok_api_token)
      ? row!.tiktok_api_token!.trim()
      : null,
  };
}

/**
 * The only projection of settings that is allowed to reach the browser.
 * Type-wise and code-wise it carries the two IDs and nothing else, so a token
 * cannot leak by someone forgetting to strip a field.
 */
export function buildPublicConfig(settings: MarketingSettings): PublicMarketingConfig {
  return {
    metaPixelId: settings.metaPixelId,
    tiktokPixelId: settings.tiktokPixelId,
  };
}

/**
 * Requirement: "if a platform's Pixel ID/token is empty, skip that platform
 * entirely". A browser pixel needs only its ID; a server-side integration
 * needs the ID *and* the matching token.
 */
export function resolvePlatforms(settings: MarketingSettings): MarketingPlatforms {
  const metaPixel = settings.metaPixelId !== null;
  const tiktokPixel = settings.tiktokPixelId !== null;

  return {
    metaPixel,
    metaConversionsApi: metaPixel && settings.metaCapiToken !== null,
    tiktokPixel,
    tiktokEventsApi: tiktokPixel && settings.tiktokApiToken !== null,
  };
}

// --- browser event payloads ----------------------------------------------

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function cleanContentIds(ids: string[] | null | undefined): string[] | null {
  if (!ids || ids.length === 0) return null;
  const cleaned = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanContentNames(names: string[] | null | undefined): string[] | null {
  if (!names || names.length === 0) return null;
  const cleaned = names.filter((name): name is string => typeof name === "string" && name.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Meta browser-pixel parameters (`fbq("track", name, params)`).
 *
 * Note `eventID` — Meta's browser SDK uses that exact casing for the dedup key.
 */
export function metaBrowserParams(
  event: StandardEvent,
  input: CommerceEventInput = {},
): Record<string, unknown> | null {
  // PageView takes no parameters.
  if (event === "PageView") return null;

  const params: Record<string, unknown> = {};

  if (input.eventId) {
    params.eventID = input.eventId;
  }

  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    params.value = roundMoney(input.value);
    params.currency = input.currency ?? MARKETING_CURRENCY;
  }

  if (typeof input.numItems === "number" && Number.isFinite(input.numItems)) {
    params.num_items = Math.trunc(input.numItems);
  }

  const contentIds = cleanContentIds(input.contentIds);
  if (contentIds) {
    params.content_ids = contentIds;
    params.content_type = "product";
  }

  const contentNames = cleanContentNames(input.contentNames);
  if (contentNames) {
    params.content_names = contentNames;
  }

  return params;
}

/**
 * TikTok browser-pixel parameters (`ttq.track(name, params)`). TikTok uses
 * `event_id` for the dedup key on both the pixel and the Events API.
 */
export function tiktokBrowserParams(
  event: StandardEvent,
  input: CommerceEventInput = {},
): Record<string, unknown> | null {
  if (event === "PageView") return null;

  const params: Record<string, unknown> = {};

  if (input.eventId) {
    params.event_id = input.eventId;
  }

  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    params.value = roundMoney(input.value);
    params.currency = input.currency ?? MARKETING_CURRENCY;
  }

  if (typeof input.numItems === "number" && Number.isFinite(input.numItems)) {
    params.num_items = Math.trunc(input.numItems);
  }

  const contentIds = cleanContentIds(input.contentIds);
  if (contentIds) {
    params.content_id = contentIds[0];
    params.content_type = "product";
  }

  const contentNames = cleanContentNames(input.contentNames);
  if (contentNames && contentIds) {
    params.content_name = contentNames[0];
  }

  return params;
}

/** TikTok calls the completed-order event CompletePayment; Meta calls it Purchase. */
export function tiktokEventName(event: StandardEvent): StandardEvent | "CompletePayment" {
  return event === "Purchase" ? "CompletePayment" : event;
}

/**
 * Meta's normalised hashing rules for `user_data`. Phone: strip everything
 * that is not a digit and drop a leading `+`. Name: lowercase and collapse
 * whitespace, split into first / last.
 *
 * Only ever applied to values that are about to be SHA-256 hashed — the raw
 * strings never leave the process.
 */
export function normalisePhoneForHash(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  return trimmed.startsWith("+") && digits ? `+${digits}` : digits;
}

export function normaliseNameForHash(name: string): { fn: string; ln: string } {
  const parts = name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const [first, ...rest] = parts;
  return { fn: first ?? "", ln: rest.join(" ") };
}
