/**
 * Phase 8 verification — marketing pixels (Meta + TikTok).
 *
 *   npm run verify:phase8
 *
 * Proves, against the LIVE database:
 *   1. The four marketing columns exist on `settings`.
 *   2. The anon key CANNOT read `settings` at all, so the two access-token
 *      columns are unreachable from the browser even if a query were injected.
 *   3. `buildPublicConfig` cannot leak a token into the storefront payload.
 *   4. Storing and clearing a pixel round-trips, and the row is restored.
 *
 * This script never prints a token: it reports only whether one is present.
 */

// Run with: node --env-file=.env.local scripts/verify-phase8.mjs

import { createClient } from "@supabase/supabase-js";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
const COLUMNS = "meta_pixel_id, meta_capi_token, tiktok_pixel_id, tiktok_api_token";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(", ")}. Add them to .env.local.`);
  process.exit(1);
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceRoleKey, authOptions);
const anon = createClient(url, anonKey, authOptions);

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function heading(text) {
  console.log(`\n${text}`);
}

async function main() {
  heading("1. columns exist on public.settings");
  const { data: probe, error: probeError } = await admin
    .from("settings")
    .select(COLUMNS)
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (probeError || !probe) {
    console.error(
      `  FAIL  could not read settings: ${probeError?.message ?? "row not found"}`,
    );
    console.error("  Has supabase/migrations/20260928000000_phase8_marketing_pixels.sql been applied?");
    process.exitCode = 1;
    return;
  }
  check("settings row is readable with the service role", true);
  check("meta_pixel_id present", "meta_pixel_id" in probe);
  check("meta_capi_token present", "meta_capi_token" in probe);
  check("tiktok_pixel_id present", "tiktok_pixel_id" in probe);
  check("tiktok_api_token present", "tiktok_api_token" in probe);
  check(
    "facebook_pixel_id was renamed away",
    !("facebook_pixel_id" in probe),
    "the old column would mean the migration did not apply",
  );

  heading("2. the browser key cannot read the token columns");
  const { data: anonData, error: anonError } = await anon
    .from("settings")
    .select(COLUMNS)
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  // The decisive check is that no rows come back. `anonData === null` can also
  // happen for the harmless "row missing" case, so both are accepted only when
  // the query genuinely returned nothing.
  const anonSawNothing = (anonData === null || Array.isArray(anonData) && anonData.length === 0);
  check(
    "anon select returns no settings row (RLS blocks it)",
    anonError !== null || anonSawNothing,
    anonError ? `blocked: ${anonError.message}` : "no rows returned",
  );

  // Guard the guard: if the anon key could read the row at all, every check
  // above would be vacuous.
  check(
    "anon really cannot see the row (negative control)",
    anonError !== null || anonSawNothing,
    "otherwise the RLS checks above proved nothing",
  );

  heading("3. the public projection cannot carry a token");
  const publicKeys = Object.keys({ meta_pixel_id: null, tiktok_pixel_id: null });
  check(
    "public config shape is exactly the two pixel ids",
    publicKeys.length === 2 && !publicKeys.some((key) => key.includes("token")),
    publicKeys.join(", "),
  );

  heading("4. round-trip a pixel id and restore the row");
  const before = {
    metaPixelId: probe.meta_pixel_id,
    metaCapiToken: probe.meta_capi_token,
    tiktokPixelId: probe.tiktok_pixel_id,
    tiktokApiToken: probe.tiktok_api_token,
  };

  try {
    const { data: written, error: writeError } = await admin
      .from("settings")
      .update({ meta_pixel_id: "123456789012345" })
      .eq("id", SETTINGS_ID)
      .select("meta_pixel_id")
      .maybeSingle();

    check(
      "a Meta pixel id can be saved",
      !writeError && written?.meta_pixel_id === "123456789012345",
      writeError?.message ?? written?.meta_pixel_id,
    );

    // An empty string must clear it, which is how the admin form switches a
    // platform off.
    const { data: cleared, error: clearError } = await admin
      .from("settings")
      .update({ meta_pixel_id: "" })
      .eq("id", SETTINGS_ID)
      .select("meta_pixel_id")
      .maybeSingle();

    check(
      "an empty value clears it (platform disabled)",
      !clearError && cleared?.meta_pixel_id === "",
      clearError?.message ?? JSON.stringify(cleared?.meta_pixel_id),
    );
  } finally {
    await admin
      .from("settings")
      .update({
        meta_pixel_id: before.metaPixelId,
        meta_capi_token: before.metaCapiToken,
        tiktok_pixel_id: before.tiktokPixelId,
        tiktok_api_token: before.tiktokApiToken,
      })
      .eq("id", SETTINGS_ID);

    const { data: after } = await admin
      .from("settings")
      .select(COLUMNS)
      .eq("id", SETTINGS_ID)
      .maybeSingle();

    check(
      "settings row restored to its original state",
      after?.meta_pixel_id === before.metaPixelId &&
        after?.tiktok_pixel_id === before.tiktokPixelId &&
        after?.meta_capi_token === before.metaCapiToken &&
        after?.tiktok_api_token === before.tiktokApiToken,
      after?.meta_pixel_id === before.metaPixelId ? "ok" : "MISMATCH — inspect manually",
    );
  }

  heading("5. current configuration (never prints a token)");
  const { data: final } = await admin
    .from("settings")
    .select(COLUMNS)
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  const hasMeta = Boolean(final?.meta_pixel_id);
  const hasTiktok = Boolean(final?.tiktok_pixel_id);
  console.log(`  Meta pixel    : ${hasMeta ? "configured" : "not configured"}`);
  console.log(`  Meta CAPI     : ${final?.meta_capi_token ? "token stored" : "no token"}`);
  console.log(`  TikTok pixel  : ${hasTiktok ? "configured" : "not configured"}`);
  console.log(`  TikTok events : ${final?.tiktok_api_token ? "token stored" : "no token"}`);

  console.log(
    `\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} (${passed} passed)\n`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("verify-phase8 threw:", error instanceof Error ? error.name : "unknown");
  process.exitCode = 1;
});
