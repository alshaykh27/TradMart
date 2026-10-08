import { z } from "zod";

/**
 * Request validation for POST /api/orders.
 *
 * The browser is untrusted: every field is trimmed, control characters are
 * stripped, and lengths are bounded before the payload reaches the order
 * writer. Prices are deliberately NOT part of this schema — the server always
 * recomputes them from the database.
 */

export const MAX_ITEMS = 50;
export const MAX_QTY = 99;

/** Removes control characters and collapses whitespace, then trims. */
export function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanString(min: number, max: number, label: string) {
  return z
    .string()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(min, `${label} is required`)
        .max(max, `${label} is too long`),
    );
}

export const orderRequestSchema = z.object({
  customerName: cleanString(2, 200, "Customer name"),
  phone: z
    .string()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .regex(/^[+0-9][0-9()\s-]{5,20}$/, "A valid phone number is required"),
    ),
  country: cleanString(1, 80, "Country"),
  /**
   * Safka price-list `cities[].id` (a short numeric string) chosen at checkout.
   * OPTIONAL: an unknown id, a city from another governorate, or no id at all
   * simply omits `city` from the Safka payload. Existence and governorate match
   * are checked server-side (create) against `safka_cities`, never here — the
   * browser's claim is not evidence.
   *
   * The old free-text `city` field was dropped deliberately: Safka casts `city`
   * to a Number, so text became NaN and the whole order 400'd.
   */
  cityId: z.string().max(16, "City is too long").optional().default(""),
  // Safka price-list (pricing) document _id chosen at checkout. Validity is
  // checked against governorate_pricing server-side (create), not here.
  shippingGovernorate: cleanString(2, 120, "Governorate"),
  address: cleanString(3, 300, "Address"),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.coerce.number().int().min(1).max(MAX_QTY),
      }),
    )
    .min(1, "Cart is empty")
    .max(MAX_ITEMS, "Too many products in cart"),
  // Honeypot: real users never see or fill this hidden field.
  website: z.string().max(200).optional().default(""),
});

export type OrderRequest = z.infer<typeof orderRequestSchema>;

export function isHoneypotFilled(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}
