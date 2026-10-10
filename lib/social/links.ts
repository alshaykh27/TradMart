/**
 * Pure helpers for the storefront's social / contact links (Phase 13).
 *
 * Deliberately NOT `server-only` and deliberately free of `@/` aliases, so
 * `node --test` can load this file directly AND the admin form can reuse the
 * exact validation the API route applies (same convention as
 * lib/marketing/config.ts).
 *
 * Two rules that matter, both unit-tested:
 *   1. Only a value that passes validation is ever rendered — an invalid
 *      stored value degrades to "no link" instead of a broken anchor.
 *   2. The wa.me link is derived on read, never stored, so the owner may paste
 *      either the local `01094606102` or the international `+201094606102`
 *      and both resolve to the same chat.
 */

export type SocialLinks = {
  /** Absolute https URL of the Facebook page, or null when unset/invalid. */
  facebookUrl: string | null;
  /** WhatsApp number exactly as the owner typed it (for display), or null. */
  whatsappNumber: string | null;
};

const MAX_URL_LENGTH = 300;
/** Anything a person might type into a phone field: digits, +, spaces, dashes, parens. */
const PHONE_SHAPE = /^[0-9+()\-\s]{7,30}$/;
/** E.164 without the `+`: 8–15 digits, no leading zero. */
const E164 = /^[1-9]\d{7,14}$/;

/**
 * Normalises a submitted Facebook page URL. Returns null for anything blank,
 * oversized or not on a facebook.com / fb.com host, so a bad paste (or a
 * javascript: URI) can never end up in an href. A missing scheme is added, and
 * http is upgraded to https.
 */
export function cleanFacebookUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;

  // Owners routinely paste "facebook.com/..." without a scheme.
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  const onFacebook =
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.com" ||
    host.endsWith(".fb.com");
  if (!onFacebook) return null;

  url.protocol = "https:";
  return url.toString();
}

/**
 * Normalises a submitted WhatsApp number for storage. The value is kept in
 * whatever form the owner typed it (so the footer can display it as-is) — only
 * the shape is enforced. Blank input returns null, which clears the link.
 */
export function cleanWhatsAppNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !PHONE_SHAPE.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed;
}

/**
 * Builds the wa.me deep link for a stored number.
 *
 * wa.me only accepts the international form without a `+`, so an Egyptian
 * local number (`01094606102`) — and any `00` international prefix — is
 * converted to the `20` country code. Anything that does not resolve to a
 * plausible E.164 number yields null: no link rather than a broken one.
 */
export function whatsappChatLink(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Egyptian local form: 01x... -> 201x...
  if (/^0[1-9]\d{8,}$/.test(digits)) digits = `20${digits.slice(1)}`;
  if (!E164.test(digits)) return null;
  return `https://wa.me/${digits}`;
}

/**
 * Normalises an incoming settings row into the shape used everywhere else,
 * dropping anything that fails validation. An invalid stored value is treated
 * exactly like a missing one, so a bad row can never break a page render.
 */
export function normaliseSocialLinks(
  row:
    | {
        facebook_url?: string | null;
        whatsapp_number?: string | null;
      }
    | null
    | undefined,
): SocialLinks {
  return {
    facebookUrl: cleanFacebookUrl(row?.facebook_url),
    whatsappNumber: cleanWhatsAppNumber(row?.whatsapp_number),
  };
}

type QueryError = { code?: string; message?: string };

/**
 * True when a settings query failed only because the Phase 13 social columns
 * are not in the schema yet (Postgres 42703). A 42703 code alone is not
 * enough: this must not mask a genuinely missing other column.
 */
export function isMissingSocialColumns(error: QueryError | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code === "42703") return /facebook_url|whatsapp_number/.test(message);
  // Postgres phrasing and PostgREST's schema-cache phrasing.
  return (
    /column "?(facebook_url|whatsapp_number)"? does not exist/.test(message) ||
    /could not find the ['"]?(facebook_url|whatsapp_number)['"]? column/i.test(message)
  );
}
