/**
 * Category rules shared by the server writers, the admin Client Component and
 * the storefront. Deliberately dependency-free (no zod, no Supabase, no React)
 * so importing it never widens a bundle — same rule as lib/products/manual.ts.
 *
 * Slugs are the URL key for /products?category=<slug>, so they are restricted to
 * lowercase ASCII letters, digits and single hyphens. Arabic input is translated
 * through a curated retail vocabulary rather than transliterated, because
 * transliteration produces unreadable URLs (إلكترونيات -> alktrwnyat).
 */

/** Matches the CHECK constraint on categories.slug in the phase 7 migration. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CATEGORY_MAX_NAME = 80;
export const CATEGORY_MAX_ICON = 16;

/**
 * Curated Arabic -> English retail vocabulary. A token found here is translated;
 * anything missing falls back to TRANSLITERATION. This is a convenience, not a
 * guarantee — the admin form lets the merchant overwrite the suggested slug.
 */
const WORD_MAP: Record<string, string> = {
  إلكترونيات: "electronics",
  الكتروني: "electronics",
  إلكترونية: "electronics",
  كمبيوتر: "computers",
  لابتوب: "laptops",
  سماعات: "headphones",
  ساعات: "watches",
  موبايلات: "mobiles",
  موبايل: "mobile",
  هواتف: "phones",
  هاتف: "phone",
  تابلت: "tablets",
  منزل: "home",
  منزلي: "home",
  مطبخ: "kitchen",
  أثاث: "furniture",
  مفروشات: "bedding",
  موضة: "fashion",
  أزياء: "fashion",
  ملابس: "clothes",
  قمصان: "shirts",
  بناطيل: "pants",
  أحذية: "shoes",
  حقائب: "bags",
  جمال: "beauty",
  عناية: "care",
  العناية: "care",
  عطور: "perfumes",
  عطورات: "perfumes",
  مستحضرات: "cosmetics",
  أطفال: "kids",
  رضّع: "baby",
  ألعاب: "toys",
  رياضة: "sports",
  رياضات: "sports",
  معدات: "equipment",
  أدوات: "tools",
  العدة: "hardware",
  كتب: "books",
  قرطاسية: "stationery",
  مواد: "supplies",
  غذاء: "food",
  بقالة: "grocery",
  مشروبات: "drinks",
  حلويات: "sweets",
  شوكولاتة: "chocolate",
  زهور: "flowers",
  بلدي: "local",
  مستورد: "imported",
  عروض: "offers",
  تخفيضات: "sale",
  Bulk: "bulk",
};

/** Arabic conjunctions and the definite article — never part of a slug. */
const IGNORED_TOKENS = new Set(["و", "من", "الى", "على", "في", "مع", "ال", "لل", "بال"]);

/** Per-character fallback for tokens missing from WORD_MAP. */
const TRANSLITERATION: [RegExp, string][] = [
  [/إ|أ|آ|ا/g, "a"],
  [/ب/g, "b"],
  [/ت/g, "t"],
  [/ث/g, "th"],
  [/ج/g, "j"],
  [/ح/g, "h"],
  [/خ/g, "kh"],
  [/د/g, "d"],
  [/ذ/g, "dh"],
  [/ر/g, "r"],
  [/ز/g, "z"],
  [/س/g, "s"],
  [/ش/g, "sh"],
  [/ص/g, "s"],
  [/ض/g, "d"],
  [/ط/g, "t"],
  [/ظ/g, "z"],
  [/ع/g, "a"],
  [/غ/g, "gh"],
  [/ف/g, "f"],
  [/ق/g, "q"],
  [/ك/g, "k"],
  [/ل/g, "l"],
  [/م/g, "m"],
  [/ن/g, "n"],
  [/ه|ة/g, "h"],
  [/و|ؤ/g, "w"],
  [/ي|ى|ئ/g, "y"],
];

function transliterate(value: string): string {
  let out = value;

  for (const [pattern, replacement] of TRANSLITERATION) {
    out = out.replace(pattern, replacement);
  }

  return out;
}

/**
 * Best-effort slug from an Arabic (or Latin) display name.
 *
 * Returns null when nothing usable survives — for a name made only of characters
 * we cannot map. The caller decides the fallback; we never invent a misleading
 * slug from an untransliterated string.
 */
export function slugifyName(name: string): string | null {
  const tokens = name.trim().split(/\s+/).filter(Boolean);

  // Arabic "و" is a prefixing conjunction: «ومطبخ» is و+مطبخ, not one word.
  // Splitting it keeps compound names readable — "منزل ومطبخ" -> home-kitchen
  // instead of home-wmtbkh.
  const expanded: string[] = [];
  for (const token of tokens) {
    if (token.length > 1 && token.startsWith("و") && Object.hasOwn(WORD_MAP, token.slice(1))) {
      expanded.push(token.slice(1));
      continue;
    }
    expanded.push(token);
  }

  const words: string[] = [];
  for (const token of expanded) {
    const lower = token.toLowerCase();
    if (IGNORED_TOKENS.has(lower)) continue;

    const mapped = WORD_MAP[lower];
    // An empty mapped value means "translate to nothing" — skip the token.
    if (mapped === "") continue;
    if (mapped) {
      words.push(mapped);
      continue;
    }

    words.push(transliterate(lower));
  }

  const slug = words
    .join("-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!SLUG_PATTERN.test(slug)) return null;
  return slug.slice(0, 60);
}

/**
 * Makes a slug unique against the ones already taken by appending -2, -3, …
 * Pure so it is unit-testable and so the caller can retry once on the unique
 * violation rather than looping against the database.
 */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let suffix = 2; suffix < 200; suffix += 1) {
    const candidate = `${base.slice(0, 57)}-${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
  // 200 collisions on one name is pathological; return the last attempt and let
  // the database's unique index be the final arbiter.
  return `${base.slice(0, 57)}-200`;
}

/** Strips control characters and collapses whitespace, like lib/products/manual.ts. */
export function cleanCategoryName(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A category slug arriving from the URL is validated before it hits the DB. */
export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A category id from a request body is validated before it hits the DB. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

/**
 * Characters that carry structural meaning inside a PostgREST filter
 * expression: `,` separates clauses in `.or()`, `.` separates column from
 * operator, `(` / `)` group clauses, `*` is the shorthand wildcard, and
 * quotes can terminate a value. A search term containing any of them is
 * rejected outright rather than escaped, because none of them legitimately
 * appear in a product name, SKU or barcode.
 */
const POSTGREST_METACHARACTERS = /[,.()*"';\\]|^$|[\u0000-\u001F\u007F]/;

/** Longest search term we will hand to an `ilike` filter. */
const SEARCH_TERM_MAX_LENGTH = 80;

/**
 * Builds the `.or(...)` argument for the admin product search box, or returns
 * null when the term cannot be expressed safely.
 *
 * PostgREST `.or()` takes a raw filter string, so interpolating an unvalidated
 * term lets a caller append extra filter clauses (`q=a,price.gte.0`) or inject
 * a wildcard. Values are therefore restricted to a conservative character set
 * and the LIKE wildcards `%` / `_` are neutralised.
 */
export function buildProductSearchOrFilter(term: string): string | null {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length > SEARCH_TERM_MAX_LENGTH) return null;
  if (POSTGREST_METACHARACTERS.test(trimmed)) return null;

  // Escape the SQL LIKE wildcards so a search for "50%" cannot become a
  // match-everything pattern. Postgres uses backslash as the default escape.
  const escaped = escapeLikePattern(trimmed);
  return `name.ilike.%${escaped}%,safka_product_id.ilike.%${escaped}%,barcode.ilike.%${escaped}%`;
}

/**
 * Escapes the SQL `LIKE` wildcards `%` and `_` (plus the escape character
 * itself) so a user-supplied term is matched literally. Postgres treats
 * backslash as the default LIKE escape character, so a doubled backslash is
 * interpreted as a literal backslash by the LIKE parser.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

export type CategoryOption = {
  id: string;
  name_ar: string;
  slug: string;
  icon: string | null;
  display_order: number;
};
