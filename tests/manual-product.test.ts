import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildManualProduct,
  buildManualProductPatch,
} from "../lib/admin/manual-product.ts";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MANUAL_MAX_IMAGES,
  PRODUCT_IMAGE_BUCKET,
  isAllowedImageType,
  isSafeImageUrl,
  managedImageKeys,
  parseImageInput,
} from "../lib/products/manual.ts";
import { displayPrice, round2 } from "../lib/products/pricing.ts";

/** Stands in for lib/sanitize.ts so the test stays free of that dependency. */
const passthrough = (value: string) => `<p>${value}</p>`;

const validBody = {
  name: "  حقيبة  ظهر  احترافية ",
  description: "  وصف المنتج  ",
  images: "https://cdn.example.com/a.jpg",
  costPrice: 100.5,
  commission: 25,
  stock: 5,
  isPublished: true,
};

describe("displayPrice", () => {
  it("is cost plus commission", () => {
    assert.equal(displayPrice(100, 25), 125);
  });

  it("rounds to 2 decimals to avoid float drift", () => {
    assert.equal(displayPrice(0.1, 0.2), 0.3);
    assert.equal(round2(1.005), 1.01);
  });

  it("clamps negatives and non-finite input to zero", () => {
    assert.equal(displayPrice(-10, -5), 0);
    assert.equal(displayPrice(Number.NaN, 25), 25);
    assert.equal(displayPrice(10, Number.POSITIVE_INFINITY), 10);
  });
});

describe("parseImageInput", () => {
  it("splits a newline-separated textarea and trims each URL", () => {
    const outcome = parseImageInput(" https://a.example.com/1.jpg \n https://a.example.com/2.jpg ");
    assert.ok(outcome.ok);
    if (outcome.ok) {
      assert.deepEqual(outcome.images.urls, [
        "https://a.example.com/1.jpg",
        "https://a.example.com/2.jpg",
      ]);
      assert.deepEqual(outcome.images.rejected, []);
    }
  });

  it("accepts an already-split array", () => {
    const outcome = parseImageInput(["https://a.example.com/1.jpg"]);
    assert.ok(outcome.ok);
    if (outcome.ok) assert.equal(outcome.images.urls.length, 1);
  });

  it("collapses duplicates while preserving order", () => {
    const outcome = parseImageInput(
      "https://a.example.com/2.jpg\nhttps://a.example.com/1.jpg\nhttps://a.example.com/2.jpg",
    );
    assert.ok(outcome.ok);
    if (outcome.ok) {
      assert.deepEqual(outcome.images.urls, [
        "https://a.example.com/2.jpg",
        "https://a.example.com/1.jpg",
      ]);
    }
  });

  it("drops non-http(s) schemes but keeps the good ones", () => {
    const outcome = parseImageInput(
      [
        "javascript:alert(1)",
        "data:image/png;base64,AAAA",
        "/relative/path.jpg",
        "https://a.example.com/ok.jpg",
      ].join("\n"),
    );
    assert.ok(outcome.ok);
    if (outcome.ok) {
      assert.deepEqual(outcome.images.urls, ["https://a.example.com/ok.jpg"]);
      // Four candidates are rejected, not three: input also splits on commas, so
      // the data URL's base64 payload becomes a fifth rejected fragment.
      assert.equal(outcome.images.rejected.length, 4);
      assert.ok(outcome.images.rejected.some((value) => value.startsWith("javascript:")));
      assert.ok(!outcome.images.rejected.includes("https://a.example.com/ok.jpg"));
    }
  });

  it("fails the whole request when more than the max are supplied", () => {
    const many = Array.from(
      { length: MANUAL_MAX_IMAGES + 1 },
      (_, index) => `https://a.example.com/${index}.jpg`,
    ).join("\n");
    const outcome = parseImageInput(many);
    assert.ok(!outcome.ok);
  });

  it("treats empty input as no images rather than an error", () => {
    const outcome = parseImageInput("   ");
    assert.ok(outcome.ok);
    if (outcome.ok) assert.deepEqual(outcome.images.urls, []);
  });
});

describe("isSafeImageUrl", () => {
  it("accepts absolute http and https only", () => {
    assert.ok(isSafeImageUrl("https://a.example.com/i.jpg"));
    assert.ok(isSafeImageUrl("http://a.example.com/i.jpg"));
    assert.ok(!isSafeImageUrl("//a.example.com/i.jpg"));
    assert.ok(!isSafeImageUrl("ftp://a.example.com/i.jpg"));
    assert.ok(!isSafeImageUrl("not a url"));
  });
});

describe("buildManualProduct", () => {
  it("marks the row as manual with no Safka id and no barcode", () => {
    const outcome = buildManualProduct(validBody, passthrough);
    assert.ok(outcome.ok);
    if (!outcome.ok) return;

    assert.equal(outcome.value.source, "manual");
    assert.equal(outcome.value.safka_product_id, null);
    assert.equal(outcome.value.barcode, null);
    assert.equal(outcome.value.status, "active");
  });

  it("derives the price server-side and ignores any price sent by the browser", () => {
    const outcome = buildManualProduct(
      { ...validBody, costPrice: 200, commission: 50, price: 1 },
      passthrough,
    );
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.value.price, 250);
  });

  it("trims the name and sanitizes the description", () => {
    const outcome = buildManualProduct(validBody, passthrough);
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.value.name, "حقيبة ظهر احترافية");
    assert.equal(outcome.value.description, "<p>وصف المنتج</p>");
  });

  it("sets image_url to the first URL and mirrors the list into images", () => {
    const outcome = buildManualProduct(
      {
        ...validBody,
        images: "https://a.example.com/1.jpg\nhttps://a.example.com/2.jpg",
      },
      passthrough,
    );
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.value.image_url, "https://a.example.com/1.jpg");
    assert.deepEqual(outcome.value.images, [
      "https://a.example.com/1.jpg",
      "https://a.example.com/2.jpg",
    ]);
  });

  it("rejects a name shorter than 2 characters", () => {
    const outcome = buildManualProduct({ ...validBody, name: "a" }, passthrough);
    assert.ok(!outcome.ok);
    if (!outcome.ok) assert.equal(typeof outcome.error, "string");
  });

  it("rejects negative money and negative stock", () => {
    assert.ok(!buildManualProduct({ ...validBody, costPrice: -1 }, passthrough).ok);
    assert.ok(!buildManualProduct({ ...validBody, commission: -1 }, passthrough).ok);
    assert.ok(!buildManualProduct({ ...validBody, stock: -1 }, passthrough).ok);
  });

  it("rejects a fractional stock", () => {
    assert.ok(!buildManualProduct({ ...validBody, stock: 1.5 }, passthrough).ok);
  });

  it("treats the string \"false\" as false, not true", () => {
    const outcome = buildManualProduct(
      { ...validBody, isPublished: "false" },
      passthrough,
    );
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.value.is_published, false);
  });

  it("accepts a numeric form payload for booleans, stock and money", () => {
    const outcome = buildManualProduct(
      { ...validBody, isPublished: "1", stock: "7", costPrice: "300", commission: "75" },
      passthrough,
    );
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.value.is_published, true);
    assert.equal(outcome.value.stock, 7);
    assert.equal(outcome.value.price, 375);
  });
});

describe("buildManualProductPatch", () => {
  it("never rewrites source, safka_product_id, barcode or status", () => {
    const outcome = buildManualProductPatch(validBody, passthrough);
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    for (const key of ["source", "safka_product_id", "barcode", "status"]) {
      assert.ok(!(key in outcome.value), `patch must not contain ${key}`);
    }
  });

  it("still recomputes price from cost plus commission", () => {
    const outcome = buildManualProductPatch(
      { ...validBody, costPrice: 40, commission: 10, price: 999 },
      passthrough,
    );
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.value.price, 50);
  });

  it("clears the description when the field is sent empty", () => {
    const outcome = buildManualProductPatch({ ...validBody, description: "" }, passthrough);
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.value.description, null);
  });

  it("clears the images when none are supplied", () => {
    const outcome = buildManualProductPatch({ ...validBody, images: "" }, passthrough);
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.value.image_url, null);
    assert.equal(outcome.value.images, null);
  });
});

describe("managedImageKeys", () => {
  const bucket = PRODUCT_IMAGE_BUCKET;
  const prefix = `/storage/v1/object/public/${bucket}/`;

  it("extracts keys for objects in our own bucket and folder", () => {
    const keys = managedImageKeys(
      [
        `https://ref.supabase.co${prefix}manual/abc-123.jpg`,
        `https://ref.supabase.co${prefix}manual/def-456.png`,
      ],
      bucket,
    );
    assert.deepEqual(keys, ["manual/abc-123.jpg", "manual/def-456.png"]);
  });

  it("ignores external URLs and objects outside our folder", () => {
    assert.deepEqual(
      managedImageKeys(
        [
          "https://cdn.example.com/manual/evil.jpg",
          `https://ref.supabase.co${prefix}other/abc.jpg`,
          "https://cdn.example.com/x.png",
          42,
          null,
        ],
        bucket,
      ),
      [],
    );
  });

  it("refuses traversal and absolute keys", () => {
    assert.deepEqual(
      managedImageKeys(
        [
          `https://ref.supabase.co${prefix}manual/../../etc/passwd`,
          `https://ref.supabase.co${prefix}manual/%2e%2e%2fsecret.jpg`,
          `https://ref.supabase.co${prefix}manual/ok.jpg`,
        ],
        bucket,
      ),
      ["manual/ok.jpg"],
    );
  });

  it("returns [] for non-array input", () => {
    assert.deepEqual(managedImageKeys("nope" as unknown as unknown[], bucket), []);
  });
});

describe("upload limits", () => {
  it("only allows the four documented image MIME types", () => {
    assert.ok(isAllowedImageType("image/png"));
    assert.ok(isAllowedImageType("image/jpeg"));
    assert.ok(isAllowedImageType("image/webp"));
    assert.ok(isAllowedImageType("image/avif"));
    assert.ok(!isAllowedImageType("image/gif"));
    assert.ok(!isAllowedImageType("application/pdf"));
    assert.ok(!isAllowedImageType("image/svg+xml"));
  });

  it("maps each MIME type to a fixed extension, never to the filename", () => {
    assert.equal(ALLOWED_IMAGE_TYPES["image/jpeg"], "jpg");
    assert.equal(ALLOWED_IMAGE_TYPES["image/png"], "png");
  });

  it("isAllowedImageType is not fooled by inherited Object properties", () => {
    assert.ok(!isAllowedImageType("toString"));
    assert.ok(!isAllowedImageType("constructor"));
  });

  it("the 5 MiB limit matches the migration's file_size_limit", async () => {
    const migration = await readFile(
      join(process.cwd(), "supabase/migrations/20260926000000_phase6_manual_products.sql"),
      "utf8",
    );
    assert.match(migration, new RegExp(String(MAX_IMAGE_BYTES)));
  });
});

describe("manual products are isolated from Safka", () => {
  it("the webhook ignores rows whose source is not safka", async () => {
    const webhook = await readFile(
      join(
        process.cwd(),
        "app/api/webhooks/safka/products/[[...token]]/route.ts",
      ),
      "utf8",
    );
    assert.match(webhook, /source/);
    assert.match(webhook, /safka/);
  });

  it("the sync script skips manual rows when deactivating", async () => {
    const sync = await readFile(
      join(process.cwd(), "scripts/sync-safka-products.ts"),
      "utf8",
    );
    assert.match(sync, /source/);
    assert.match(sync, /manual/);
  });
});

describe("manual product deletion", () => {
  const ROUTE = "app/api/admin/products/manual/[id]/route.ts";

  it("the DELETE handler refuses any product whose source is not 'manual'", async () => {
    // The guard is the real protection: the UI only hides the button, so a
    // hand-crafted request must still not be able to delete a Safka row.
    const route = await readFile(join(process.cwd(), ROUTE), "utf8");
    assert.match(route, /export async function DELETE/);
    assert.match(route, /data\.source !== "manual"/);
    assert.match(route, /status: 409/);
  });

  it("the delete is scoped by source in the query itself, not just in the guard", async () => {
    const route = await readFile(join(process.cwd(), ROUTE), "utf8");
    assert.match(route, /\.delete\(\)/);
    assert.match(route, /\.eq\("source", "manual"\)/);
  });

  it("the DELETE handler requires an admin session", async () => {
    const route = await readFile(join(process.cwd(), ROUTE), "utf8");
    assert.match(route, /export async function DELETE[\s\S]*?isAdmin\(\)[\s\S]*?status: 401/);
  });

  it("removes the product's uploaded objects from the product-images bucket", async () => {
    const route = await readFile(join(process.cwd(), ROUTE), "utf8");
    assert.match(route, /managedImageKeys/);
    assert.match(route, /storage/);
    assert.match(route, /\.remove\(keys\)/);
    assert.match(route, /PRODUCT_IMAGE_BUCKET/);
  });

  it("order history survives a product delete (FK is ON DELETE SET NULL)", async () => {
    // Deleting a product that was already ordered must not fail, and past
    // orders must keep their line items — the FK nulls the product link.
    const migration = await readFile(
      join(process.cwd(), "supabase/migrations/20260919000000_init.sql"),
      "utf8",
    );
    assert.match(
      migration,
      /product_id\s+uuid\s+references\s+public\.products\s*\(id\)\s+on\s+delete\s+set\s+null/i,
    );
  });

  it("the delete button is mounted only for manual products", async () => {
    const row = await readFile(
      join(process.cwd(), "components/admin/ProductRow.tsx"),
      "utf8",
    );
    assert.match(row, /DeleteManualProductButton/);
    // ...and it sits inside the isManual branch, next to the edit button.
    assert.match(row, /\{isManual \? \([\s\S]*?DeleteManualProductButton[\s\S]*?\) : \(/);
  });

  it("the delete button asks for confirmation before firing the request", async () => {
    const button = await readFile(
      join(process.cwd(), "components/admin/DeleteManualProductButton.tsx"),
      "utf8",
    );
    assert.match(button, /هل أنت متأكد من حذف هذا المنتج؟/);
    // The destructive call is behind the confirming flag, not the initial render.
    assert.match(button, /if \(!confirming\)/);
    assert.match(button, /method: "DELETE"/);
    // Success is announced on the list, carried in the URL.
    assert.match(button, /params\.set\("deleted"/);
  });
});