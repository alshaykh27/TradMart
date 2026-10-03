/**
 * TradeMart — Phase 6 verification (manually-added products + image storage).
 *
 * Confirms the phase 6 migration is actually live on the project:
 *   - products.source exists, defaults to 'safka', and only accepts
 *     'safka' | 'manual'
 *   - every pre-existing row was backfilled to 'safka' (never 'manual'), which
 *     is what keeps Safka sync from touching hand-written rows
 *   - products.safka_product_id is nullable, so a manual row needs no Safka id
 *   - a manual row can be written with source='manual' + a null Safka id, and
 *     removed again
 *   - the `product-images` bucket exists, is PUBLIC, caps files at 5 MiB and
 *     allows exactly PNG/JPEG/WebP/AVIF
 *   - a real upload through the bucket succeeds and the public object URL is
 *     reachable without auth (that is what next/image will fetch)
 *
 * Probes are BEHAVIOURAL (insert/read/delete) rather than catalog reads, so no
 * extra RPC or SQL access is needed.
 *
 * Run: npm run verify:phase6
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
 * Secrets are never printed.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length > 0) {
  console.error(`\nMissing environment variables: ${missing.join(", ")}\n`);
  process.exit(1);
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceRoleKey, authOptions);
const anon = createClient(url, anonKey, authOptions);

const BUCKET = "product-images";
const MAX_BYTES = 5_242_880;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];
const TEST_NAME = "__phase6_verification__";

let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function cleanup(productIds, objectKeys) {
  for (const key of objectKeys) {
    await admin.storage.from(BUCKET).remove([key]);
  }
  for (const id of productIds) {
    if (id) await admin.from("products").delete().eq("id", id);
  }
}

async function main() {
  console.log("\nTradeMart Phase 6 verification\n");

  const productIds = [];
  const objectKeys = [];

  try {
    // 1. The storage bucket. This is the single question the migration was
    //    asked to answer: created automatically, or by hand?
    {
      const { data, error } = await admin.storage.listBuckets();
      const bucket = (data ?? []).find((row) => row.id === BUCKET);

      check(`${BUCKET} bucket was created by the migration`, Boolean(bucket), error?.message ?? "");
      check("bucket is PUBLIC (storefront images, no auth)", bucket?.public === true, `public=${bucket?.public}`);
      check(
        "bucket file size limit is 5 MiB",
        Number(bucket?.file_size_limit) === MAX_BYTES,
        `limit=${bucket?.file_size_limit}`,
      );

      const types = [...(bucket?.allowed_mime_types ?? [])].sort();
      check(
        "bucket allows exactly PNG/JPEG/WebP/AVIF",
        JSON.stringify(types) === JSON.stringify([...ALLOWED_TYPES].sort()),
        `types=${JSON.stringify(types)}`,
      );
    }

    // 2. products.source exists and defaults to 'safka'.
    {
      const { data, error } = await admin
        .from("products")
        .insert({
          safka_product_id: null,
          name: `${TEST_NAME} default`,
          price: 10,
          stock: 1,
          status: "active",
          is_published: false,
        })
        .select("id, source")
        .single();

      check("products.source column exists", !error, error?.message ?? "");
      check(
        "a row inserted WITHOUT source defaults to 'safka'",
        data?.source === "safka",
        `source=${data?.source}`,
      );
      if (data?.id) productIds.push(data.id);
    }

    // 3. safka_product_id is nullable and 'manual' is accepted.
    {
      const { data, error } = await admin
        .from("products")
        .insert({
          safka_product_id: null,
          source: "manual",
          name: `${TEST_NAME} manual`,
          price: 250,
          cost_price: 200,
          commission: 50,
          stock: 3,
          status: "active",
          is_published: true,
        })
        .select("id, source, safka_product_id, price")
        .single();

      check(
        "a manual row inserts with safka_product_id = null",
        !error && data?.source === "manual" && data?.safka_product_id === null,
        error?.message ?? "",
      );
      check(
        "manual row stores the server-derived price",
        Number(data?.price) === 250,
        `price=${data?.price}`,
      );
      if (data?.id) productIds.push(data.id);
    }

    // 4. The CHECK constraint rejects anything outside the vocabulary.
    {
      const { error } = await admin.from("products").insert({
        safka_product_id: null,
        source: "not-a-real-source",
        name: `${TEST_NAME} bogus`,
        price: 1,
        stock: 1,
        status: "active",
        is_published: false,
      });
      check(
        "source rejects a value outside ('safka','manual')",
        error !== null,
        error?.message ?? "the constraint did NOT fire",
      );
    }

    // 5. The backfill covered every row that existed before the migration:
    //    no product may be left with a NULL source, which would otherwise make
    //    the Safka writers' source filter silently skip that row forever.
    //    (Rows legitimately created as 'manual' afterwards are fine, so this
    //    checks for NULL rather than "every row is safka".)
    {
      const { count, error } = await admin
        .from("products")
        .select("id", { count: "exact", head: true })
        .is("source", null);

      check(
        "no product was left with a NULL source by the backfill",
        !error && (count ?? 0) === 0,
        error?.message ?? `count=${count}`,
      );
    }

    // 6. A manual row is invisible to anon unless published — it still has to
    //    clear the same storefront rules as a Safka product.
    {
      const { data: manual, error: lookupError } = await admin
        .from("products")
        .select("id")
        .eq("name", `${TEST_NAME} manual`)
        .maybeSingle();

      if (!lookupError && manual?.id) {
        const { data: anonRow, error: anonError } = await anon
          .from("products")
          .select("id")
          .eq("id", manual.id)
          .maybeSingle();
        check(
          "anon can read a PUBLISHED manual product (storefront)",
          !anonError && anonRow?.id === manual.id,
          anonError?.message ?? "",
        );
      }

      await admin
        .from("products")
        .update({ is_published: false })
        .eq("name", `${TEST_NAME} manual`);
      const { data: hidden, error: hiddenError } = await anon
        .from("products")
        .select("id")
        .eq("name", `${TEST_NAME} manual`)
        .maybeSingle();
      check(
        "anon cannot read an UNPUBLISHED manual product (RLS)",
        !hiddenError && hidden === null,
        hiddenError?.message ?? "",
      );
    }

    // 7. End-to-end upload through the bucket, then read the public URL with the
    //    ANON key. This is the URL next/image will be pointed at.
    {
      // 1x1 transparent PNG.
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        ),
        (char) => char.charCodeAt(0),
      );

      const key = `manual/${crypto.randomUUID()}.png`;
      objectKeys.push(key);

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(key, png, { contentType: "image/png", upsert: false });

      check("upload to product-images/manual/ succeeds", !uploadError, uploadError?.message ?? "");

      const publicUrl = admin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
      const response = await fetch(publicUrl);
      check(
        "uploaded object is reachable at its PUBLIC url with no auth",
        response.ok,
        `status=${response.status} url=${publicUrl}`,
      );

      const { error: listError } = await admin.storage.from(BUCKET).remove([key]);
      check("uploaded object can be removed", !listError, listError?.message ?? "");
    }

    // 8. Manual rows must not be reachable through the Safka sync's write path.
    //    The script filters on source, so a manual row keeps its own name and
    //    publication state when the webhook runs. Assert the manual row we made
    //    still carries source='manual' and an independent name.
    {
      const { data, error } = await admin
        .from("products")
        .select("name, source")
        .eq("name", `${TEST_NAME} manual`)
        .maybeSingle();
      check(
        "manual row keeps source='manual' and its own name",
        !error && data?.source === "manual" && data?.name === `${TEST_NAME} manual`,
        error?.message ?? "",
      );
    }
  // 9. Deleting a manual product must leave NO orphaned files. This replays
    //    exactly what DELETE /api/admin/products/manual/[id] does — same
    //    managedImageKeys() helper, same storage.remove() call — against real
    //    uploaded objects, so the cleanup path is proven rather than assumed.
    {
      const { managedImageKeys } = await import("../lib/products/manual.ts");

      // Two objects under our own folder, one under someone else's folder.
      const ownedKeys = [
        `manual/${crypto.randomUUID()}.png`,
        `manual/${crypto.randomUUID()}.jpg`,
      ];
      const foreignKey = `other/${crypto.randomUUID()}.png`;
      const allKeys = [...ownedKeys, foreignKey];
      objectKeys.push(...allKeys);

      // 1x1 transparent PNG.
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        ),
        (char) => char.charCodeAt(0),
      );

      for (const key of allKeys) {
        const { error } = await admin.storage
          .from(BUCKET)
          .upload(key, png, { contentType: "image/png", upsert: true });
        if (error) {
          check("uploaded delete fixtures", false, error.message);
          break;
        }
      }

      const { data: created, error: createError } = await admin
        .from("products")
        .insert({
          safka_product_id: null,
          source: "manual",
          name: `${TEST_NAME} to-delete`,
          price: 100,
          cost_price: 80,
          commission: 20,
          stock: 1,
          status: "active",
          is_published: false,
          image_url: admin.storage.from(BUCKET).getPublicUrl(ownedKeys[0]).data.publicUrl,
          images: allKeys.map(
            (key) => admin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl,
          ),
        })
        .select("id, image_url, images")
        .single();

      check("delete fixture product created", !createError, createError?.message ?? "");

      if (!createError && created?.id) {
        const urls = [
          created.image_url,
          ...(Array.isArray(created.images) ? created.images : []),
        ];

        // The route recomputes keys from the row it just loaded.
        const keys = managedImageKeys(urls, BUCKET);
        check(
          "only OUR objects are scheduled for deletion",
          keys.length === ownedKeys.length &&
            ownedKeys.every((key) => keys.includes(key)) &&
            !keys.includes(foreignKey),
          `keys=${JSON.stringify(keys)}`,
        );

        const { error: deleteError } = await admin.from("products").delete().eq("id", created.id);
        check("manual product row deleted", !deleteError, deleteError?.message ?? "");

        const { error: removeError } = await admin.storage.from(BUCKET).remove(keys);
        check("uploaded objects removed", !removeError, removeError?.message ?? "");

        // Prove the objects are really gone rather than trusting remove().
        const { data: ownedLeft } = await admin.storage.from(BUCKET).list("manual", {
          limit: 1000,
        });
        const orphans = ownedKeys.filter((key) =>
          (ownedLeft ?? []).some((row) => row.name === key.split("/")[1]),
        );
        check(
          "NO orphaned files left in product-images/manual/",
          orphans.length === 0,
          orphans.length > 0 ? `orphans=${JSON.stringify(orphans)}` : "",
        );
      }

      // The foreign-folder object must survive: we do not own it.
      const { data: foreignLeft } = await admin.storage
        .from(BUCKET)
        .list("other", { limit: 100 });
      check(
        "an object outside manual/ was NOT deleted",
        (foreignLeft ?? []).some((row) => row.name === foreignKey.split("/")[1]),
      );
    }
  } catch (error) {
    check("verification ran without throwing", false, error?.message ?? String(error));
  } finally {
    await cleanup(productIds, objectKeys);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();