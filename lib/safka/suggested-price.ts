/**
 * Reading Safka's suggested selling price out of a product's free-text `note`.
 *
 * Safka exposes NO structured commission or suggested-price field. The public
 * API returns 17 keys and none of them is a suggested price; the only place the
 * number appears is the `note` string, where a human wrote a sentence like
 *
 *     سعر البيع المقترح 700 عمولتك 210      ("suggested selling price 700, your commission 210")
 *
 * That text is written by a person and is therefore inconsistent: across the
 * live catalog the same sentence appears with ~12 spellings, sometimes with a
 * "جنيه" suffix, sometimes with "هتكون عمولتك" in front of the commission, and
 * sometimes with typos ("سع", "مقترح", "عملوتك", "عموتتك", "عمولك", and one
 * note that writes عمولتك with a doubled lam).
 *
 * Two rules keep this honest:
 *
 *  1. NEVER GUESS. A note that encodes two quantity tiers ("للقطعه 250
 *     والقطعتين 400") has no single answer, so it parses to null rather than
 *     picking one. The admin button is then absent, which is the only honest
 *     outcome -- there is nothing to apply.
 *  2. NEVER TRUST THE NOTE'S OWN COMMISSION. The note is static text while
 *     `sale_price` is live, so a supplier who reprices after writing the note
 *     leaves the two disagreeing (measured: 39 of 421 parseable notes, by up
 *     to 100 EGP). The note's *price* is what the merchant wants to hit, so the
 *     commission is derived from it against the live cost by
 *     deriveSuggestedCommission() instead of read out of the sentence.
 *
 * Pure and dependency-free so it can be unit tested and imported anywhere.
 */

export interface SafkaSuggestedPrice {
  /** The suggested SELLING price, as written in the note. */
  suggestedPrice: number;
  /**
   * The commission the note itself claims. Reported so the admin UI can show
   * that it differs from the derived value; never used to set a price.
   */
  statedCommission: number;
}

/** Arabic-Indic digits, so a note typed with them still parses. */
const EASTERN = "٠١٢٣٤٥٦٧٨٩";

/**
 * Wording that announces a SECOND tier, e.g. "للقطعه 250 والقطعتين 400"
 * ("250 for one, 400 for two"). Such a note has no single answer, so it parses
 * to null rather than picking one. The admin button is then absent, which is
 * the only honest outcome -- there is nothing to apply.
 *
 * Deliberately NOT matched: "للقطعه" / "للقطعة" / "القطعة" on their own. Those
 * mean "for the piece" and introduce the single tier, not a second one; ten
 * live notes are phrased that way and reconcile exactly. Matching them would
 * withhold a perfectly good suggested price from a quarter of them.
 */
const TIERED = /(قطعتين|وعرض|عرض)/;

/**
 * One suggested price followed by one commission, in any of the observed
 * spellings. The commission keyword is required, which is what rejects notes
 * that are just a bare list of numbers ("سعر البيع المقترح 300 120").
 */
const SUGGESTED = new RegExp(
  "(?:سع|سعر)\\s*(?:ال)?بيع\\s*(?:مقترح|المقترح)?\\s*(?:لـ?ل?\\S{0,8}?\\s*)?\\(?\\s*" +
    "([\\d.," +
    EASTERN +
    "]+)\\s*\\)?" +
    "(?:[^\\d]{0,15}?\\(?([\\d.," +
    EASTERN +
    "]+)\\)?)?" +
    "\\s*(?:جنيه)?\\s*" +
    "(?:هتكون|هتبقى|هتبقي|هيكون)?\\s*" +
    "(?:ع?م?و?ل?و?ت?ل?ك|عمولك|عمولتك|عمولتيك|عملوتك|عموتتك|عمولك)" +
    "\\s*\\(?\\s*([\\d.," +
    EASTERN +
    "]+)\\s*\\)?",
);

/** Parse one digit group, tolerating thousands separators and Arabic-Indic digits. */
function toAmount(raw: string): number | null {
  const normalised = raw.replace(/[.,\s]/g, "").replace(/[٠-٩]/g, (d) =>
    String(EASTERN.indexOf(d)),
  );
  if (normalised === "") return null;
  const value = Number(normalised);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Extract Safka's suggested price and its stated commission from a product note.
 *
 * Returns null — never a guess — when the note is absent, empty, encodes two
 * quantity tiers, or does not contain both a price and a commission.
 */
export function parseSafkaSuggestedPrice(
  note: string | null | undefined,
): SafkaSuggestedPrice | null {
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  if (trimmed === "") return null;

  // Two tiers means two different prices; refuse rather than pick the first.
  if (TIERED.test(trimmed)) return null;

  const match = SUGGESTED.exec(trimmed);
  if (!match) return null;

  const suggestedPrice = toAmount(match[1]);
  const statedCommission = toAmount(match[3]);
  if (suggestedPrice === null || statedCommission === null) return null;

  // A second number here is a bundle tier we failed to recognise, not noise.
  if (match[2] !== undefined) return null;

  return { suggestedPrice, statedCommission };
}

/**
 * The commission that makes price land exactly on Safka's suggested selling
 * price, given the product's live cost.
 *
 * Deriving rather than reading the note's own commission is deliberate: the
 * note's price is the figure the merchant expects to charge, and it is the
 * figure this guarantees -- even where the note's commission is stale.
 *
 * Returns null when there is nothing to derive from, so callers must not fall
 * back to 0 and silently publish an unpriced product.
 */
export function deriveSuggestedCommission(
  suggestedPrice: number | null | undefined,
  costPrice: number | null | undefined,
): number | null {
  if (suggestedPrice == null || costPrice == null) return null;
  const price = Number(suggestedPrice);
  const cost = Number(costPrice);
  if (!Number.isFinite(price) || !Number.isFinite(cost)) return null;
  // Never suggest a markup below cost: that would need a negative commission,
  // which the admin route rejects and displayPrice() would clamp to 0.
  if (price <= cost) return null;
  return Math.round((price - cost) * 100) / 100;
}