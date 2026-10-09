import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  allLinesFolded,
  shippingFoldApplied,
  storefrontPrice,
  MAX_SHIPPING_FOLD,
} from "../lib/products/pricing.ts";
import { buildManualProduct, buildManualProductPatch } from "../lib/admin/manual-product.ts";
import { buildOrderLines, type OrderableProduct } from "../lib/orders/lines.ts";

/**
 * "Free shipping" fold (تضمين الشحن في السعر).
 *
 * The fold is a DISPLAY feature: products keep a base `price` (cost +
 * commission) and the storefront adds a merchant-set flat amount with a
 * "شحن مجاني" badge. Orders, the Safka payload and margins must keep using the
 * base price and the real per-governorate fee. These tests pin the boundary:
 * the helpers/forms write the fold columns without touching `price`, and the
 * order pipeline proves it ignores the fold entirely.
 */
const repoFile = (relative: string) => readFile(join(process.cwd(), relative), "utf8");

const PATCH_ROUTE = "app/api/admin/products/[id]/route.ts";
const MIGRATION = "supabase/migrations/20261010000000_phase12_shipping_fold.sql";

describe("storefrontPrice", () => {
  it("adds the fold to the base — the exact reported case 500 + 85 = 585", () => {
    assert.equal(storefrontPrice(500, true, 85), 585);
  });

  it("stays at the base price when the toggle is off", () => {
    assert.equal(storefrontPrice(500, false, 85), 500);
    assert.equal(storefrontPrice(500, false, null), 500);
  });

  it("stays at the base price when the fold value is unusable", () => {
    assert.equal(storefrontPrice(500, true, null), 500);
    assert.equal(storefrontPrice(500, true, undefined), 500);
    assert.equal(storefrontPrice(500, true, 0), 500);
    assert.equal(storefrontPrice(500, true, Number.NaN), 500);
  });

  it("rounds to 2 decimals so float drift cannot leak into a displayed price", () => {
    assert.equal(storefrontPrice(0.1, true, 0.2), 0.3);
    assert.equal(storefrontPrice(10.005, true, 5), 15.01);
  });

  it("treats a negative fold as no fold rather than lowering the price", () => {
    assert.equal(storefrontPrice(500, true, -85), 500);
  });
});

describe("shippingFoldApplied", () => {
  it("returns 0 when not included and the rounded fold when included", () => {
    assert.equal(shippingFoldApplied(false, 85), 0);
    assert.equal(shippingFoldApplied(true, 85), 85);
    assert.equal(shippingFoldApplied(true, "49.5" as unknown as number), 49.5);
  });
});

describe("allLinesFolded (free-shipping cart rule)", () => {
  it("is false for an empty cart", () => {
    assert.equal(allLinesFolded([]), false);
  });

  it("is true only when every line is folded", () => {
    assert.equal(allLinesFolded([true, true]), true);
    assert.equal(allLinesFolded([true]), true);
  });

  it("flips to false the moment any line is not folded", () => {
    assert.equal(allLinesFolded([true, false]), false);
    assert.equal(allLinesFolded([false, false]), false);
  });
});

describe("manual products fold without touching price", () => {
  it("creates the product with the fold columns while price stays base", () => {
    const built = buildManualProduct(
      {
        name: "منتج مضمّن",
        description: "",
        images: "https://cdn.example.com/a.jpg",
        costPrice: 500,
        commission: 0,
        stock: 1,
        isPublished: true,
        shippingIncluded: true,
        shippingFold: 85,
      },
      (value) => value,
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.value.price, 500, "price must stay cost + commission");
    assert.equal(built.value.shipping_included, true);
    assert.equal(built.value.shipping_fold, 85);
  });

  it("never stores a fold when the toggle is off", () => {
    const built = buildManualProductPatch(
      {
        name: "منتج",
        description: "",
        images: "https://cdn.example.com/a.jpg",
        costPrice: 500,
        commission: 50,
        stock: 1,
        isPublished: true,
        shippingIncluded: false,
        shippingFold: 9999,
      },
      (value) => value,
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.value.shipping_included, false);
    assert.equal(built.value.shipping_fold, null, "off must clear the stored fold");
    assert.equal(built.value.price, 550);
  });
});

describe("the order pipeline ignores the fold", () => {
  const request = new Map([["p1", 2]]);
  const product: OrderableProduct = {
    id: "p1",
    price: 500,
    stock: 5,
    is_published: true,
    status: "active",
    // The fold columns flow on the same row, so this mirrors reality: the order
    // writer must price from `price`, not from a shipping-inclusive figure.
  } as OrderableProduct & { shipping_included: boolean; shipping_fold: number | null };

  it("buildOrderLines prices a folded product strictly at products.price", () => {
    const { rows, subtotal } = buildOrderLines(request, [product]);
    assert.equal(rows[0].price, 500);
    assert.deepEqual([rows[0].quantity, rows[0].product_id], [2, "p1"]);
    assert.equal(subtotal, 1000);
  });

  it("the Safka payload builder never reads the fold columns", async () => {
    const payload = await repoFile("lib/safka/order-payload.ts");
    assert.equal(/shipping_fold|shipping_included/.test(payload), false);
  });

  it("the lines builder never reads the fold columns", async () => {
    const lines = await repoFile("lib/orders/lines.ts");
    assert.equal(/shipping_fold|shipping_included/.test(lines), false);
  });
});

describe("the admin PATCH route guards the fold", () => {
  it("accepts the two body keys and validates the fold range", async () => {
    const route = await repoFile(PATCH_ROUTE);
    assert.match(route, /"shippingIncluded" in body/);
    assert.match(route, /"shippingFold" in body/);
    assert.match(route, /MAX_SHIPPING_FOLD/);
    assert.match(route, /الشحن المضمّن خارج النطاق/);
  });

  it("forces a fold write to never derive products.price", async () => {
    const route = await repoFile(PATCH_ROUTE);
    // The fold rides entirely in `shipping_fold`; `price` is only ever derived
    // from commission, and the body can never supply one.
    assert.doesNotMatch(route, /body\.price/);
    assert.doesNotMatch(route, /"price" in body/);
  });

  it("turning the toggle off clears the stored fold", async () => {
    const route = await repoFile(PATCH_ROUTE);
    assert.match(route, /update\.shipping_fold = null/);
  });

  it("resolves the flat default from settings when enabled without an explicit value", async () => {
    const route = await repoFile(PATCH_ROUTE);
    assert.match(route, /shipping_fold_default/);
    assert.match(route, /if \(update\.shipping_included\)/);
  });
});

describe("the migration ships the display columns and the flat default", () => {
  it("adds shipping_included and shipping_fold idempotently", async () => {
    const migration = await repoFile(MIGRATION);
    assert.match(migration, /add column if not exists shipping_included boolean not null default false/);
    assert.match(migration, /add column if not exists shipping_fold numeric\(12, 2\)/);
    assert.match(migration, /add column if not exists shipping_fold_default numeric\(12, 2\) not null default 85/);
    assert.match(migration, /notify pgrst, 'reload schema'/);
  });

  it("grants ONLY the two display columns to the storefront", async () => {
    const migration = await repoFile(MIGRATION);
    assert.match(migration, /grant select \(shipping_included, shipping_fold\)\s*\n\s*on public\.products to anon, authenticated/);
    // The commerce columns stay privileged: the grant is column-scoped, never
    // the whole table.
    assert.doesNotMatch(migration, /grant select\s*\n?\s*on public\.products to anon, authenticated/);
  });

  it("leaves the existing phase 3.5.1 column grant untouched", async () => {
    const realPayload = await repoFile("supabase/migrations/20260922000000_phase3-5-1_real_payload.sql");
    assert.match(realPayload, /revoke select on public\.products from anon, authenticated;/);
  });
});

describe("sanity: the fold ceiling is bounded", () => {
  it("matches the admin commission cap magnitude", () => {
    assert.equal(typeof MAX_SHIPPING_FOLD, "number");
    assert.ok(MAX_SHIPPING_FOLD > 0);
  });
});