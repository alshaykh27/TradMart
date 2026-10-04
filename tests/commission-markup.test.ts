import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveSyncedPrice, displayPrice, round2 } from "../lib/products/pricing.ts";
import { buildManualProductPatch } from "../lib/admin/manual-product.ts";

/**
 * Regression cover for: "adding commission to a Safka-synced product in admin
 * does not change the price the customer sees".
 *
 * The bug was a write-side omission, not a storefront one: every reader renders
 * the `products.price` column, and the admin commission editor only wrote
 * `commission`. So the markup was stored and then ignored, leaving customers on
 * Safka's raw supplier price. The invariant these tests defend is that a
 * commission is always accompanied by the price it implies.
 */
const repoFile = (relative: string) => readFile(join(process.cwd(), relative), "utf8");

const PATCH_ROUTE = "app/api/admin/products/[id]/route.ts";
const SYNC_SCRIPT = "scripts/sync-safka-products.ts";

describe("deriveSyncedPrice", () => {
  it("is cost_price + commission — the exact reported case", () => {
    // cost_price 100, commission 50 => customers must see 150, not 100.
    assert.equal(deriveSyncedPrice(100, 50), 150);
  });

  it("treats a missing commission as no markup, so the price falls back to the cost", () => {
    assert.equal(deriveSyncedPrice(100, null), 100);
    assert.equal(deriveSyncedPrice(100, undefined), 100);
  });

  it("returns null when the cost is unknown instead of guessing a price", () => {
    // There is no base to add the markup to. Reporting null forces the caller to
    // refuse the write; returning `commission` or 0 here is what would let a
    // product with no known cost be re-priced to a meaningless number.
    assert.equal(deriveSyncedPrice(null, 50), null);
    assert.equal(deriveSyncedPrice(null, null), null);
    assert.equal(deriveSyncedPrice(undefined, 50), null);
  });

  it("adds the markup to a zero cost rather than ignoring it", () => {
    assert.equal(deriveSyncedPrice(0, 50), 50);
  });

  it("survives numerics that arrive as strings", () => {
    // Postgres numeric is typed as number in types/database.ts, but a driver
    // that hands back "100.00" must not silently become NaN.
    assert.equal(deriveSyncedPrice("100.50" as unknown as number, "49.5" as unknown as number), 150);
  });

  it("rounds to 2 decimals so float drift cannot leak into a stored price", () => {
    assert.equal(deriveSyncedPrice(0.1, 0.2), 0.3);
    assert.equal(deriveSyncedPrice(10.005, 0), 10.01);
    assert.equal(round2(1.005), 1.01);
  });

  it("clamps a negative cost or commission to zero", () => {
    assert.equal(deriveSyncedPrice(-10, 25), 25);
    assert.equal(deriveSyncedPrice(100, -25), 100);
  });

  it("agrees with displayPrice, which the manual-product writer uses", () => {
    for (const [cost, commission] of [
      [100, 50],
      [0, 0],
      [1050, 350],
      [12.34, 5.67],
    ]) {
      assert.equal(deriveSyncedPrice(cost, commission), displayPrice(cost, commission));
    }
  });
});

describe("the admin commission editor re-prices the product", () => {
  it("derives the price from the stored cost instead of trusting the request", async () => {
    const route = await repoFile(PATCH_ROUTE);
    assert.match(route, /deriveSyncedPrice\(current\.cost_price, update\.commission\)/);
    // The cost is read back from the database, not taken from the body.
    assert.match(route, /\.select\("cost_price"\)/);
    assert.match(route, /deriveSyncedPrice/);
  });

  it("writes commission and the derived price in the same update", async () => {
    const route = await repoFile(PATCH_ROUTE);
    // Two separate writes would let a failure between them persist a commission
    // with no matching price — exactly the reported symptom.
    assert.match(route, /update\.price = price;[\s\S]*?\.update\(update\)/);
    assert.doesNotMatch(route, /\.update\(\{[^}]*price/);
  });

  it("never lets the request body supply a price", async () => {
    const route = await repoFile(PATCH_ROUTE);
    // The browser may set cost and commission; the customer-facing price is the
    // server's to derive. A body-driven price would be a client-chosen price.
    assert.doesNotMatch(route, /body\.price/);
    assert.doesNotMatch(route, /"price" in body/);
  });

  it("refuses the save when the cost is unknown rather than reporting success", async () => {
    const route = await repoFile(PATCH_ROUTE);
    assert.match(route, /if \(price === null\)[\s\S]*?status: 422/);
  });

  it("re-prices on every commission write, including clearing it", async () => {
    const route = await repoFile(PATCH_ROUTE);
    // The guard keys off the presence of commission in the update — not on it
    // being a non-null number — so `commission: null` also resets the price to
    // the bare cost.
    assert.match(route, /if \("commission" in update\)/);
    assert.match(route, /update\.commission = null;/);
  });

  it("still requires an admin session", async () => {
    const route = await repoFile(PATCH_ROUTE);
    assert.match(route, /if \(!\(await isAdmin\(\)\)\)/);
  });

  it("still refuses to write cost_price, so Safka remains the source of cost", async () => {
    const route = await repoFile(PATCH_ROUTE);
    assert.doesNotMatch(route, /update\.cost_price/);
    assert.doesNotMatch(route, /"cost_price" in body/);
  });
});

/** The object literal a sync run writes for one existing product. */
const refreshPayload = async () => {
  const source = await repoFile(SYNC_SCRIPT);
  const start = source.indexOf("function refreshPayload");
  assert.notEqual(start, -1, "refreshPayload() not found in the sync script");
  const open = source.indexOf("{", start);
  const close = source.indexOf("};", open);
  return source.slice(open, close + 1);
};

describe("the Safka sync seeds a cost the merchant can mark up", () => {
  it("no longer inserts a new product with a null cost_price", async () => {
    const sync = await repoFile(SYNC_SCRIPT);
    // A null cost left a freshly synced product with no base for its display
    // price, so no commission could ever be applied to it.
    const insert = sync.slice(sync.indexOf("toInsert.push("), sync.indexOf("continue;", sync.indexOf("toInsert.push(")));
    assert.doesNotMatch(insert, /cost_price:\s*null/);
    assert.match(insert, /cost_price:\s*cost/);
  });

  it("derives the refreshed price with the same helper as the admin editor", async () => {
    const sync = await repoFile(SYNC_SCRIPT);
    assert.match(sync, /deriveSyncedPrice\(newCost, existing\.commission\)/);
  });

  it("shares one helper with the admin route, so the two cannot drift", async () => {
    const [sync, route] = await Promise.all([repoFile(SYNC_SCRIPT), repoFile(PATCH_ROUTE)]);
    assert.match(sync, /from "\.\.\/lib\/products\/pricing\.ts"/);
    assert.match(route, /from "@\/lib\/products\/pricing"/);
  });

  it("still never writes commission, is_published or category_id", async () => {
    const payload = await refreshPayload();
    for (const forbidden of ["commission", "is_published", "category_id"]) {
      assert.doesNotMatch(payload, new RegExp(forbidden), `${forbidden} must not be sync-written`);
    }
  });

  it("refreshes unpublished rows too, so a cost exists before publishing", async () => {
    const sync = await repoFile(SYNC_SCRIPT);
    // The publish-only gate used to `continue` past every unpublished row. Since
    // cost_price is written only on the refresh path, that left 445 of 455
    // products with no cost at all — so a commission save on them could only
    // ever fail, and the merchant had no way to price them up.
    assert.doesNotMatch(sync, /is_published !== true/);
    assert.doesNotMatch(sync, /if \(existing\.is_published/);
  });

  it("keeps a newly inserted row unpublished, so a sync never publishes anything", async () => {
    const sync = await repoFile(SYNC_SCRIPT);
    const insert = sync.slice(
      sync.indexOf("toInsert.push("),
      sync.indexOf("continue;", sync.indexOf("toInsert.push(")),
    );
    assert.match(insert, /is_published: false/);
  });

  it("still refreshes cost, price, stock and status on the row it updates", async () => {
    const payload = await refreshPayload();
    for (const column of ["cost_price", "price", "stock", "status"]) {
      assert.match(payload, new RegExp(column), `${column} must still be refreshed`);
    }
  });

  it("writes one row per request, never a bulk array body", async () => {
    const sync = await repoFile(SYNC_SCRIPT);
    // PostgREST pairs an array update body against the order the DATABASE
    // returns rows for the filter, which is unspecified. A 100-row chunk
    // therefore wrote each product's cost onto whichever row landed in that
    // position — it corrupted 441 of 450 products when this ran against real
    // data. One row per request leaves nothing to mispair.
    assert.doesNotMatch(sync, /\.update\(\[|update\(details\)|update\(rows\)/);
    assert.doesNotMatch(sync, /\.update\(\w+\)\s*\.in\("id"/);
    assert.match(sync, /\.update\(refreshPayload\(row\)\)\s*\.eq\("id", row\.id\)/);
  });
});

describe("every writer derives price the same way", () => {
  it("a manual product and a synced product agree on cost 100 + commission 50", async () => {
    const body = {
      name: "منتج",
      description: "",
      images: "https://cdn.example.com/a.jpg",
      costPrice: 100,
      commission: 50,
      stock: 1,
      isPublished: true,
    };
    const manual = buildManualProductPatch(body, (value) => value);
    assert.equal(manual.ok, true);
    if (!manual.ok) return;
    assert.equal(manual.value.cost_price, 100);
    assert.equal(manual.value.commission, 50);
    assert.equal(manual.value.price, 150);
    assert.equal(manual.value.price, deriveSyncedPrice(100, 50));
  });

  it("a browser-supplied price never survives on a manual product", async () => {
    const manual = buildManualProductPatch(
      {
        name: "منتج",
        description: "",
        images: "https://cdn.example.com/a.jpg",
        costPrice: 100,
        commission: 50,
        price: 1,
        stock: 1,
        isPublished: true,
      },
      (value) => value,
    );
    assert.equal(manual.ok, true);
    if (!manual.ok) return;
    assert.equal(manual.value.price, 150);
  });
});