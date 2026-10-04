import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CATEGORY_MAX_ICON,
  SLUG_PATTERN,
  cleanCategoryName,
  isUuid,
  isValidSlug,
  slugifyName,
  uniqueSlug,
} from "../lib/products/category.ts";
import { buildCategory, buildCategoryRow, createCategorySchema } from "../lib/admin/category.ts";
import { buildManualProduct, buildManualProductPatch } from "../lib/admin/manual-product.ts";

/**
 * Arabic literals are written as \u escapes on purpose: this file is loaded by
 * `node --test` and must not depend on how a text editor re-encodes the file.
 */
const AR = {
  // إلكترونيات — the first letter is إ (U+0625), not ا (U+0627).
  electronics: "\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0627\u062a",
  mobiles: "\u0645\u0648\u0628\u0627\u064a\u0644\u0627\u062a",
  homeKitchen: "\u0645\u0646\u0632\u0644 \u0648\u0645\u0637\u0628\u062e",
  fashion: "\u0645\u0648\u0636\u0629",
  beautyCare: "\u062c\u0645\u0627\u0644 \u0648\u0639\u0646\u0627\u064a\u0629",
  kids: "\u0623\u0637\u0641\u0627\u0644",
  sports: "\u0631\u064a\u0627\u0636\u0629",
  tools: "\u0623\u062f\u0648\u0627\u062a",
};

const CATEGORY_ID = "3f1c2b5a-9d6e-4a10-9b7f-3a2c1d0e8f66";

const repoFile = (relative: string) => readFile(join(process.cwd(), relative), "utf8");
const passthrough = (value: string) => `<p>${value}</p>`;

describe("slugifyName", () => {
  it("translates the seeded section names into readable URL slugs", () => {
    assert.equal(slugifyName(AR.electronics), "electronics");
    assert.equal(slugifyName(AR.mobiles), "mobiles");
    assert.equal(slugifyName(AR.homeKitchen), "home-kitchen");
    assert.equal(slugifyName(AR.fashion), "fashion");
    assert.equal(slugifyName(AR.beautyCare), "beauty-care");
    assert.equal(slugifyName(AR.kids), "kids");
    assert.equal(slugifyName(AR.sports), "sports");
    assert.equal(slugifyName(AR.tools), "tools");
  });

  it("splits the Arabic prefixing conjunction so compounds stay readable", () => {
    // "و" + kitchen, rather than the unreadable "wmtbkh" transliteration.
    const slug = slugifyName(AR.homeKitchen);
    assert.equal(slug, "home-kitchen");
    assert.equal(slug?.includes("wmtbkh"), false);
  });

  it("passes Latin names through", () => {
    assert.equal(slugifyName("Home & Kitchen"), "home-kitchen");
    assert.equal(slugifyName("  Test   Item  "), "test-item");
  });

  it("returns null when nothing transliterates", () => {
    assert.equal(slugifyName(""), null);
    assert.equal(slugifyName("   "), null);
    assert.equal(slugifyName("\u{1F389}\u{1F389}"), null);
  });

  it("only ever emits slugs the DB CHECK constraint accepts", () => {
    for (const name of Object.values(AR)) {
      const slug = slugifyName(name);
      if (slug !== null) assert.equal(SLUG_PATTERN.test(slug), true, name);
    }
  });

  it("passes every transliterated section name to the slug pattern check", () => {
    assert.equal(SLUG_PATTERN.test(slugifyName(AR.electronics) ?? ""), true);
    assert.equal(SLUG_PATTERN.test(slugifyName(AR.mobiles) ?? ""), true);
    assert.equal(SLUG_PATTERN.test(slugifyName(AR.homeKitchen) ?? ""), true);
    assert.equal(SLUG_PATTERN.test(slugifyName(AR.fashion) ?? ""), true);
    assert.equal(SLUG_PATTERN.test(slugifyName(AR.beautyCare) ?? ""), true);
    assert.equal(SLUG_PATTERN.test(slugifyName(AR.kids) ?? ""), true);
    assert.equal(SLUG_PATTERN.test(slugifyName(AR.sports) ?? ""), true);
    assert.equal(SLUG_PATTERN.test(slugifyName(AR.tools) ?? ""), true);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", () => {
    assert.equal(uniqueSlug("new", []), "new");
    assert.equal(uniqueSlug("new", ["kids"]), "new");
  });

  it("suffixes on collision", () => {
    assert.equal(uniqueSlug("kids", ["kids"]), "kids-2");
    assert.equal(uniqueSlug("kids", ["kids", "kids-2"]), "kids-3");
  });
});

describe("isValidSlug / isUuid", () => {
  it("rejects anything that could escape the query string", () => {
    assert.equal(isValidSlug("../etc/passwd"), false);
    assert.equal(isValidSlug("home kitchen"), false);
    assert.equal(isValidSlug("Home-Kitchen"), false);
    assert.equal(isValidSlug("home--kitchen"), false);
    assert.equal(isValidSlug("-home"), false);
    assert.equal(isValidSlug(""), false);
    assert.equal(isValidSlug(null), false);
    assert.equal(isValidSlug("home-kitchen"), true);
  });

  it("accepts only UUID-shaped ids", () => {
    assert.equal(isUuid(CATEGORY_ID), true);
    assert.equal(isUuid("not-a-uuid"), false);
    assert.equal(isUuid(""), false);
    assert.equal(isUuid(null), false);
    assert.equal(isUuid(`${CATEGORY_ID}'; drop table products; --`), false);
  });
});

describe("cleanCategoryName", () => {
  it("strips control characters and collapses whitespace", () => {
    assert.equal(cleanCategoryName("  a\u0000  b\u001F c  "), "a b c");
  });
});

describe("buildCategory", () => {
  it("derives a slug from an Arabic name when none is supplied", () => {
    const built = buildCategory({ nameAr: AR.electronics, icon: "\u{1F4BB}" });
    assert.equal(built.ok, true);
    if (built.ok) {
      assert.equal(built.value.name_ar, AR.electronics);
      assert.equal(built.value.slug, "electronics");
      assert.equal(built.value.icon, "\u{1F4BB}");
    }
  });

  it("prefers an explicit slug and normalises its case", () => {
    const built = buildCategory({ nameAr: AR.fashion, slug: "  Fashion-Plus " });
    assert.equal(built.ok, true);
    if (built.ok) assert.equal(built.value.slug, "fashion-plus");
  });

  it("rejects a slug the DB CHECK constraint would refuse", () => {
    // Upper case is NOT in this list: the schema lower-cases it first, which the
    // test above covers.
    for (const slug of ["home kitchen", "home--kitchen", "-x", "../etc", "home/kitchen"]) {
      const built = buildCategory({ nameAr: AR.fashion, slug });
      assert.equal(built.ok, false, slug);
    }
  });

  it("rejects an empty or too-short name", () => {
    assert.equal(buildCategory({ nameAr: "  " }).ok, false);
    assert.equal(buildCategory({ nameAr: "x" }).ok, false);
    assert.equal(buildCategory({}).ok, false);
  });

  it("drops an over-long icon instead of failing the whole create", () => {
    const built = buildCategory({ nameAr: AR.tools, icon: "x".repeat(CATEGORY_MAX_ICON + 1) });
    assert.equal(built.ok, true);
    if (built.ok) assert.equal(built.value.icon, null);
  });

  it("carries a valid emoji through", () => {
    const built = buildCategory({ nameAr: AR.tools, icon: "\u{1F9F0}" });
    assert.equal(built.ok, true);
    if (built.ok) assert.equal(built.value.icon, "\u{1F9F0}");
  });

  it("builds an insert row with the given display order", () => {
    const row = buildCategoryRow({ name_ar: AR.kids, slug: "kids", icon: null }, 60);
    assert.deepEqual(row, { name_ar: AR.kids, slug: "kids", icon: null, display_order: 60 });
  });

  it("exposes a schema for direct use", () => {
    assert.equal(createCategorySchema.safeParse({ nameAr: AR.kids }).success, true);
  });
});

describe("manual products carry a category", () => {
  const validBody = {
    name: "Test item",
    description: "",
    images: [],
    costPrice: 100,
    commission: 20,
    stock: 3,
    isPublished: true,
  };

  it("writes null when no category is chosen", () => {
    const built = buildManualProduct({ ...validBody }, passthrough);
    assert.equal(built.ok, true);
    if (built.ok) assert.equal(built.value.category_id, null);
  });

  it("treats an empty dropdown value as no category", () => {
    const built = buildManualProduct({ ...validBody, categoryId: "" }, passthrough);
    assert.equal(built.ok, true);
    if (built.ok) assert.equal(built.value.category_id, null);
  });

  it("stores the chosen category id", () => {
    const built = buildManualProduct({ ...validBody, categoryId: CATEGORY_ID }, passthrough);
    assert.equal(built.ok, true);
    if (built.ok) assert.equal(built.value.category_id, CATEGORY_ID);
  });

  it("rejects an id that is not a UUID instead of failing on the FK", () => {
    const built = buildManualProduct({ ...validBody, categoryId: "nope" }, passthrough);
    assert.equal(built.ok, false);
  });

  it("can clear the category on edit", () => {
    const built = buildManualProductPatch(
      { ...validBody, categoryId: null },
      passthrough,
    );
    assert.equal(built.ok, true);
    if (built.ok) assert.equal(built.value.category_id, null);
  });

  it("keeps source manual so the Safka writers still skip it", () => {
    const built = buildManualProduct({ ...validBody, categoryId: CATEGORY_ID }, passthrough);
    assert.equal(built.ok, true);
    if (built.ok) assert.equal(built.value.source, "manual");
  });
});

/** Extracts a `{ ... }` object literal so a writer's payload can be inspected. */
function objectLiteral(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `marker not found: ${marker}`);
  const open = source.indexOf("{", start + marker.length - 1);
  const close = source.indexOf("};", open);
  return source.slice(open, close + 1);
}

describe("Safka writers never touch category_id", () => {
  it("the webhook upsert payload omits category_id", async () => {
    const source = await repoFile("app/api/webhooks/safka/products/[[...token]]/route.ts");
    const row = objectLiteral(source, "const row =");
    assert.equal(row.includes("category_id"), false, row);
  });

  it("the webhook row is still checked against the products Insert shape", async () => {
    const source = await repoFile("app/api/webhooks/safka/products/[[...token]]/route.ts");
    assert.match(source, /const row = \{[\s\S]*?\} satisfies TablesInsert<"products">;/);
  });

  it("the sync script's insert payload omits category_id", async () => {
    const source = await repoFile("scripts/sync-safka-products.ts");
    const insert = objectLiteral(source, "toInsert.push(");
    assert.equal(insert.includes("category_id"), false, insert);
  });

  it("the sync script's per-row update payload omits category_id", async () => {
    const source = await repoFile("scripts/sync-safka-products.ts");
    const details = objectLiteral(source, "function refreshPayload");
    assert.equal(details.includes("category_id"), false, details);
  });

  it("the sync script still filters out manual products", async () => {
    const source = await repoFile("scripts/sync-safka-products.ts");
    assert.match(source, /\.neq\("source", "manual"\)/);
  });

  it("the webhook still refuses to claim manual products", async () => {
    const source = await repoFile("app/api/webhooks/safka/products/[[...token]]/route.ts");
    assert.match(source, /\.neq\("source", "manual"\)/);
  });
});

describe("phase 7 migration", () => {
  it("creates categories with anon-readable RLS", async () => {
    const sql = await repoFile("supabase/migrations/20260927000000_phase7_categories.sql");
    assert.match(sql, /create table if not exists public\.categories/i);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /create policy "anon read categories"/i);
    assert.match(sql, /grant select on public\.categories to anon/i);
  });

  it("adds a nullable category_id that survives a category being deleted", async () => {
    const sql = await repoFile("supabase/migrations/20260927000000_phase7_categories.sql");
    assert.match(sql, /add column if not exists category_id uuid/i);
    assert.match(sql, /on delete set null/i);
  });

  it("grants anon select on products.category_id so filtering works", async () => {
    const sql = await repoFile("supabase/migrations/20260927000000_phase7_categories.sql");
    assert.match(sql, /grant select \(category_id\) on public\.products to anon/i);
  });

  it("still keeps the private product columns out of the anon grant", async () => {
    const sql = await repoFile("supabase/migrations/20260927000000_phase7_categories.sql");
    const grant = sql.match(/grant select \([^)]*\) on public\.products[^;]*;/i)?.[0] ?? "";
    for (const secret of ["cost_price", "commission", "source", "barcode", "media_url"]) {
      assert.equal(grant.includes(secret), false, secret);
    }
  });

  it("seeds the eight storefront sections with stable slugs", async () => {
    const sql = await repoFile("supabase/migrations/20260927000000_phase7_categories.sql");
    const seeds = [...sql.matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)*)'\s*,\s*'/g)].map((m) => m[1]);
    assert.deepEqual(seeds, [
      "electronics",
      "mobiles",
      "home-kitchen",
      "fashion",
      "beauty",
      "kids",
      "sports",
      "tools",
    ]);
  });

  it("seeds are idempotent so re-running never renames a section", async () => {
    const sql = await repoFile("supabase/migrations/20260927000000_phase7_categories.sql");
    assert.match(sql, /on conflict \(slug\) do nothing/i);
  });

  it("seeds real Arabic, not mojibake", async () => {
    const sql = await repoFile("supabase/migrations/20260927000000_phase7_categories.sql");
    // (name_ar, slug, icon, display_order)
    const seeds = [...sql.matchAll(/\('([^']*)',\s*'([a-z0-9-]+)'/g)];
    assert.equal(seeds.length, 8, "expected 8 seed rows");
    for (const [, nameAr, slug] of seeds) {
      assert.ok(/[\u0600-\u06FF]/u.test(nameAr), `${slug}: name_ar has no Arabic — ${JSON.stringify(nameAr)}`);
    }
  });

  it("the repair migration lists all 8 sections as clean Arabic", async () => {
    const sql = await repoFile("supabase/migrations/20260927000100_phase7_fix_seed_encoding.sql");
    // (slug, name_ar, icon)
    const rows = [...sql.matchAll(/\('([a-z0-9-]+)',\s*'([^']*)'/g)];
    assert.equal(rows.length, 8, "expected 8 repair rows");
    for (const [, slug, nameAr] of rows) {
      assert.ok(/[\u0600-\u06FF]/u.test(nameAr), `${slug}: repair name_ar has no Arabic`);
    }
  });
});

/**
 * UTF-8 double-encoding (mojibake) is invisible in a diff but destroys every
 * Arabic string in the app. A double-encoded character always lands in the
 * Latin-1 Supplement range, and decoding those bytes as UTF-8 reproduces
 * readable text — that reversibility is the signature.
 *
 * This is checked over the whole category surface rather than one file, because
 * the corruption reached the database through a copy/paste round trip and could
 * just as easily reach a component.
 */
describe("no mojibake in the category files", () => {
  const files = [
    "lib/products/category.ts",
    "lib/admin/category.ts",
    "components/admin/CategorySelect.tsx",
    "components/admin/AdminProductList.tsx",
    "components/admin/BulkActionsBar.tsx",
    "components/admin/ProductRow.tsx",
    "components/admin/ManualProductForm.tsx",
    "app/page.tsx",
    "app/products/page.tsx",
    "app/admin/(panel)/products/page.tsx",
    "i18n/ar.ts",
    "supabase/migrations/20260927000000_phase7_categories.sql",
    "supabase/migrations/20260927000100_phase7_fix_seed_encoding.sql",
  ];

  it("no file contains double-encoded text", async () => {
    for (const file of files) {
      const text = await repoFile(file);
      const suspicious = [...text].filter((ch) => {
        const code = ch.codePointAt(0) ?? 0;
        if (code < 0x80 || code > 0x00ff) return false;
        // Latin-1 bytes that decode cleanly as UTF-8 => was double-encoded.
        return !Buffer.from(ch, "latin1").toString("utf8").includes("\uFFFD");
      });
      assert.deepEqual(suspicious, [], `${file} contains ${suspicious.length} mojibake char(s)`);
    }
  });

  it("the seeded section names are the ones the storefront should show", async () => {
    // Guards the whole chain in one assertion: the literal in the migration is
    // the Arabic the admin types, and the slug is what ends up in the URL.
    const sql = await repoFile("supabase/migrations/20260927000000_phase7_categories.sql");
    const seeds = [...sql.matchAll(/\('([^']*)',\s*'([a-z0-9-]+)'/g)];
    const pairs = new Map(seeds.map(([, nameAr, slug]) => [slug, nameAr]));
    assert.equal(pairs.size, 8);
    assert.equal(pairs.get("electronics"), AR.electronics);
    assert.equal(pairs.get("mobiles"), AR.mobiles);
    assert.equal(pairs.get("home-kitchen"), AR.homeKitchen);
    assert.equal(pairs.get("fashion"), AR.fashion);
    assert.equal(pairs.get("beauty"), AR.beautyCare);
    assert.equal(pairs.get("kids"), AR.kids);
    assert.equal(pairs.get("sports"), AR.sports);
    assert.equal(pairs.get("tools"), AR.tools);
  });
});

describe("product type carries category_id", () => {
  it("is nullable on the row, insert and update shapes", async () => {
    const source = await repoFile("types/database.ts");
    const matches = source.match(/category_id\??: string \| null;/g) ?? [];
    assert.equal(matches.length, 3);
  });

  it("declares the categories table", async () => {
    const source = await repoFile("types/database.ts");
    assert.match(source, /categories: \{/);
    assert.match(source, /slug: string;/);
  });
});

/**
 * The bulk route is the one place where a merchant action can touch many rows at
 * once, so its blast radius is asserted here rather than trusted. The merchant
 * publishes by hand, one product or one hand-picked batch at a time, so these
 * tests pin the two properties that make that safe: a write can only ever
 * address explicitly listed ids, and it can only ever do one thing per request.
 */
describe("bulk product route is scoped to hand-picked ids", () => {
  const route = () => repoFile("app/api/admin/products/bulk/route.ts");

  it("requires an explicit id list and caps its size", async () => {
    const sql = await route();
    assert.match(sql, /const ids = body\.ids;/);
    assert.match(sql, /ids\.length > MAX_IDS/);
    assert.match(sql, /MAX_IDS = 100/);
  });

  it("rejects the whole request unless every entry is a unique UUID", async () => {
    const sql = await route();
    // De-duplication alone would silently shrink the set, so a mismatch between
    // the deduped count and the input count is an error, not a convenience.
    assert.match(sql, /uniqueIds\.length !== ids\.length/);
    assert.match(sql, /isUuid\(id\)/);
  });

  it("has no code path that widens the id set", async () => {
    const sql = await route();
    // No `.select()`-then-update-all, no filter-derived ids, no "all" escape
    // hatch: every write is bound to the validated uniqueIds array.
    assert.doesNotMatch(sql, /\.neq\("category_id"/);
    assert.doesNotMatch(sql, /is_published=eq/);
    assert.doesNotMatch(sql, /\.update\(update\)\s*;(?!\s*\.in\()/);
    assert.match(sql, /\.update\(update\)\s*\.in\("id", uniqueIds\)/);
  });

  it("refuses a request that carries both actions or neither", async () => {
    const sql = await route();
    assert.match(sql, /if \(wantsCategory === wantsPublish\)/);
    assert.match(sql, /حدّد إجراءً واحدًا/);
  });

  it("only accepts a boolean publish value", async () => {
    const sql = await route();
    assert.match(sql, /typeof body\.is_published !== "boolean"/);
  });

  it("cannot write price, cost, commission or stock", async () => {
    const sql = await route();
    const writable = sql.match(/const update: \{([^}]*)\}/)?.[1] ?? "";
    assert.match(writable, /category_id\?: string \| null;/);
    assert.match(writable, /is_published\?: boolean/);
    for (const forbidden of ["price", "cost_price", "commission", "stock", "status"]) {
      assert.doesNotMatch(writable, new RegExp(forbidden), `${forbidden} must not be bulk-writable`);
    }
  });

  it("still requires an admin session", async () => {
    const sql = await route();
    assert.match(sql, /if \(\!\(await isAdmin\(\)\)\)/);
  });
});

describe("bulk action bar cannot publish everything", () => {
  const bar = () => repoFile("components/admin/BulkActionsBar.tsx");

  it("offers no select-all-products or apply-to-filter control", async () => {
    const source = await bar();
    for (const forbidden of ["تحديد الكل", "كل المنتجات", "publishAll", "selectAllMatching"]) {
      assert.doesNotMatch(source, new RegExp(forbidden), `${forbidden} must not exist`);
    }
  });

  it("requires a second confirming click before publishing or unpublishing", async () => {
    const source = await bar();
    assert.match(source, /const \[confirming, setConfirming\] = useState<"publish" \| "unpublish" \| null>/);
    // The first click only arms; the request fires from runPublish behind the panel.
    assert.match(source, /onClick=\{\(\) => setConfirming\("publish"\)\}/);
    assert.match(source, /onClick=\{\(\) => setConfirming\("unpublish"\)\}/);
    assert.match(source, /onClick=\{\(\) => runPublish\(confirming\)\}/);
    assert.match(source, /تراجع/);
  });

  it("sends exactly one action per request", async () => {
    const source = await bar();
    // One call may wrap its object across lines, so allow whitespace after the paren.
    const bodies = source.match(/send\(\s*\{[^}]*\}/g) ?? [];
    assert.equal(bodies.length, 2);
    // Exactly one call carries category_id and exactly one carries is_published,
    // and no single call may carry both.
    assert.equal(bodies.filter((b) => /category_id/.test(b)).length, 1);
    assert.equal(bodies.filter((b) => /is_published/.test(b)).length, 1);
    for (const b of bodies) {
      assert.doesNotMatch(
        b,
        /category_id[\s\S]*is_published|is_published[\s\S]*category_id/,
        `a single request must not carry both actions: ${b}`,
      );
    }
    assert.match(source, /\{ category_id: categoryId === "" \? null : categoryId \}/);
    assert.match(source, /\{ is_published: action === "publish" \}/);
  });

  it("always sends the explicit selection, never a filter or a count", async () => {
    const source = await bar();
    assert.match(source, /JSON\.stringify\(\{ ids: selectedIds, \.\.\.body \}\)/);
    assert.doesNotMatch(source, /searchParams|category=|status=/);
  });
});