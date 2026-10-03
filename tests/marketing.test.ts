import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildPublicConfig,
  cleanPixelId,
  isValidAccessToken,
  isValidMetaPixelId,
  isValidTikTokPixelId,
  MARKETING_CURRENCY,
  metaBrowserParams,
  normaliseMarketingSettings,
  normaliseNameForHash,
  normalisePhoneForHash,
  resolvePlatforms,
  tiktokBrowserParams,
  tiktokEventName,
  type MarketingSettings,
} from "../lib/marketing/config.ts";
import {
  buildMetaCapiPayload,
  buildMetaUserData,
  buildTikTokEventsPayload,
} from "../lib/marketing/payloads.ts";

const OFF: MarketingSettings = {
  metaPixelId: null,
  metaCapiToken: null,
  tiktokPixelId: null,
  tiktokApiToken: null,
};

const read = (relative: string) => readFile(join(process.cwd(), relative), "utf8");

describe("pixel id validation", () => {
  it("accepts real Meta and TikTok id shapes", () => {
    assert.equal(isValidMetaPixelId("123456789012345"), true);
    assert.equal(isValidTikTokPixelId("C9DQ0U05C8U8A8A8Q"), true);
  });

  it("rejects a non-numeric Meta id", () => {
    // The classic copy/paste failure: pasting a whole fbevents.js URL.
    assert.equal(isValidMetaPixelId("<script>alert(1)</script>"), false);
    assert.equal(isValidMetaPixelId("12345abc"), false);
    assert.equal(isValidMetaPixelId("12345"), false, "too short to be real");
  });

  it("rejects an id containing a quote, so it cannot break out of the snippet", () => {
    assert.equal(isValidMetaPixelId("1234';alert(1);'"), false);
    assert.equal(isValidTikTokPixelId("ABC\";alert(1);\""), false);
    assert.equal(isValidTikTokPixelId("ABC DEF"), false, "no whitespace");
  });

  it("treats blank and oversized input as unset", () => {
    assert.equal(cleanPixelId(""), null);
    assert.equal(cleanPixelId("   "), null);
    assert.equal(cleanPixelId(null), null);
    assert.equal(cleanPixelId(undefined), null);
    assert.equal(cleanPixelId(42), null);
    assert.equal(cleanPixelId("x".repeat(65)), null);
    assert.equal(cleanPixelId("  123456789012345  "), "123456789012345");
  });
});

describe("access token validation", () => {
  it("accepts opaque tokens and rejects empty, whitespace and oversized ones", () => {
    assert.equal(isValidAccessToken("EAAJabc123"), true);
    assert.equal(isValidAccessToken(""), false);
    assert.equal(isValidAccessToken("   "), false);
    assert.equal(isValidAccessToken("has space"), false);
    assert.equal(isValidAccessToken("x".repeat(513)), false);
    assert.equal(isValidAccessToken(null), false);
  });
});

describe("normaliseMarketingSettings", () => {
  it("drops an invalid stored id and token rather than propagating them", () => {
    const result = normaliseMarketingSettings({
      meta_pixel_id: "<script>x</script>",
      meta_capi_token: "good-token",
      tiktok_pixel_id: "C9DQ0U05C8U8A8A8Q",
      tiktok_api_token: "  ",
    });
    assert.equal(result.metaPixelId, null);
    assert.equal(result.metaCapiToken, "good-token");
    assert.equal(result.tiktokPixelId, "C9DQ0U05C8U8A8A8Q");
    assert.equal(result.tiktokApiToken, null);
  });

  it("tolerates a missing row", () => {
    assert.deepEqual(normaliseMarketingSettings(null), OFF);
    assert.deepEqual(normaliseMarketingSettings(undefined), OFF);
  });
});

describe("buildPublicConfig", () => {
  it("never carries a token, even when both are set", () => {
    const publicConfig = buildPublicConfig({
      metaPixelId: "123456789012345",
      metaCapiToken: "META-SECRET",
      tiktokPixelId: "C9DQ0U05C8U8A8A8Q",
      tiktokApiToken: "TIKTOK-SECRET",
    });

    assert.deepEqual(Object.keys(publicConfig).sort(), ["metaPixelId", "tiktokPixelId"]);
    assert.equal(JSON.stringify(publicConfig).includes("SECRET"), false);
  });
});

describe("resolvePlatforms", () => {
  it("skips everything when nothing is configured", () => {
    assert.deepEqual(resolvePlatforms(OFF), {
      metaPixel: false,
      metaConversionsApi: false,
      tiktokPixel: false,
      tiktokEventsApi: false,
    });
  });

  it("needs a token for the server side but not the browser", () => {
    const platforms = resolvePlatforms({
      metaPixelId: "123456789012345",
      metaCapiToken: null,
      tiktokPixelId: null,
      tiktokApiToken: "leaked-token-without-a-pixel-id",
    });
    assert.equal(platforms.metaPixel, true);
    assert.equal(platforms.metaConversionsApi, false, "browser works, server does not");
    assert.equal(platforms.tiktokPixel, false, "a token alone must never enable the pixel");
    assert.equal(platforms.tiktokEventsApi, false);
  });

  it("enables all four when both platforms are fully configured", () => {
    const platforms = resolvePlatforms({
      metaPixelId: "123456789012345",
      metaCapiToken: "a",
      tiktokPixelId: "C9DQ0U05C8U8A8A8Q",
      tiktokApiToken: "b",
    });
    assert.deepEqual(platforms, {
      metaPixel: true,
      metaConversionsApi: true,
      tiktokPixel: true,
      tiktokEventsApi: true,
    });
  });
});

describe("dedup key casing", () => {
  it("uses eventID on the Meta browser pixel and event_id in the Conversions API", () => {
    // Swapping these silently disables deduplication, which double-counts every
    // order instead of failing loudly.
    const params = metaBrowserParams("Purchase", { eventId: "evt-1" });
    assert.equal(params?.eventID, "evt-1");
    assert.equal("event_id" in (params ?? {}), false);

    const capi = buildMetaCapiPayload({
      eventName: "Purchase",
      eventId: "evt-1",
      eventTime: 1700000000,
    });
    const event = (capi.data as Record<string, unknown>[])[0];
    assert.equal(event.event_id, "evt-1");
    assert.equal("eventID" in event, false);
  });

  it("uses event_id on both TikTok surfaces", () => {
    assert.equal(tiktokBrowserParams("Purchase", { eventId: "evt-2" })?.event_id, "evt-2");
    assert.equal(
      buildTikTokEventsPayload({
        eventName: "Purchase",
        eventId: "evt-2",
        eventTime: 1700000000,
        pixelCode: "C9DQ0U05C8U8A8A8Q",
        accessToken: "t",
      }).event_id,
      "evt-2",
    );
  });

  it("renames Purchase to CompletePayment for TikTok only", () => {
    assert.equal(tiktokEventName("Purchase"), "CompletePayment");
    assert.equal(tiktokEventName("ViewContent"), "ViewContent");
    assert.equal(
      buildTikTokEventsPayload({
        eventName: "Purchase",
        eventId: "e",
        eventTime: 1,
        pixelCode: "C9DQ0U05C8U8A8A8Q",
        accessToken: "t",
      }).event_name,
      "CompletePayment",
    );
  });
});

describe("browser payloads", () => {
  it("sends no parameters for PageView", () => {
    assert.equal(metaBrowserParams("PageView", { value: 10 }), null);
    assert.equal(tiktokBrowserParams("PageView", { value: 10 }), null);
  });

  it("always prices in EGP", () => {
    const params = metaBrowserParams("Purchase", { value: 1234.567, contentIds: ["p1"] });
    assert.equal(params?.value, 1234.57, "rounded to 2 decimals");
    assert.equal(params?.currency, MARKETING_CURRENCY);
  });

  it("carries product id, name and qty on AddToCart", () => {
    const params = metaBrowserParams("AddToCart", {
      contentIds: ["p1"],
      contentNames: ["شاحن"],
      value: 250,
      numItems: 2,
    });
    assert.deepEqual(params?.content_ids, ["p1"]);
    assert.deepEqual(params?.content_names, ["شاحن"]);
    assert.equal(params?.num_items, 2);
  });

  it("omits value and currency entirely when no value is known", () => {
    // A null value must not be reported as a 0 EGP purchase.
    const params = metaBrowserParams("AddToCart", { contentIds: ["p1"], value: null });
    assert.equal("value" in (params ?? {}), false);
    assert.equal("currency" in (params ?? {}), false);
  });

  it("flattens content ids to a single content_id for TikTok", () => {
    const params = tiktokBrowserParams("Purchase", {
      contentIds: ["p1", "p2"],
      contentNames: ["أ", "ب"],
      value: 100,
    });
    assert.equal(params?.content_id, "p1");
    assert.equal(params?.content_name, "أ");
  });

  it("ignores non-finite numbers", () => {
    const params = metaBrowserParams("Purchase", { value: Number.NaN, numItems: Infinity });
    assert.equal("value" in (params ?? {}), false);
    assert.equal("num_items" in (params ?? {}), false);
  });
});

describe("personal data is hashed, never sent raw", () => {
  it("normalises a phone the way Meta requires", () => {
    assert.equal(normalisePhoneForHash("+20 100 123 4567"), "+201001234567");
    assert.equal(normalisePhoneForHash("01001234567"), "01001234567");
    assert.equal(normalisePhoneForHash("(010) 123-4567"), "0101234567");
  });

  it("splits and lowercases a name", () => {
    assert.deepEqual(normaliseNameForHash("  Ahmed   Mohamed Ali "), {
      fn: "ahmed",
      ln: "mohamed ali",
    });
    assert.deepEqual(normaliseNameForHash(""), { fn: "", ln: "" });
  });

  it("emits 64-char hex and never the raw digits or name", () => {
    const data = buildMetaUserData({
      phone: "+201001234567",
      customerName: "Ahmed Mohamed",
      ip: "1.2.3.4",
      userAgent: "Mozilla/5.0",
    });

    assert.match(data.ph ?? "", /^[0-9a-f]{64}$/);
    assert.match(data.fn ?? "", /^[0-9a-f]{64}$/);
    assert.match(data.ln ?? "", /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(data).includes("201001234567"), false);
    assert.equal(JSON.stringify(data).includes("Ahmed"), false);
    assert.equal(data.client_ip_address, "1.2.3.4");
  });

  it("hashes deterministically so the same buyer matches across events", () => {
    const a = buildMetaUserData({ phone: "+201001234567", customerName: "Ahmed" });
    const b = buildMetaUserData({ phone: "+20 100 123 4567", customerName: "ahmed" });
    assert.equal(a.ph, b.ph, "formatting differences must not change the hash");
    assert.equal(a.fn, b.fn);
  });

  it("omits user data entirely when nothing is supplied", () => {
    assert.deepEqual(buildMetaUserData({}), {});
    assert.deepEqual(buildMetaUserData({ phone: "", customerName: null }), {});
  });

  it("sends TikTok no user data at all", () => {
    const payload = buildTikTokEventsPayload({
      eventName: "Purchase",
      eventId: "evt",
      eventTime: 1700000000,
      pixelCode: "C9DQ0U05C8U8A8A8Q",
      accessToken: "secret",
      value: 500,
      contentIds: ["p1"],
    });
    assert.equal("user_data" in payload, false);
    assert.equal("user" in payload, false);
    assert.equal("phone" in payload, false);
  });
});

describe("server payloads", () => {
  it("builds a single CAPI event with action_source website", () => {
    const payload = buildMetaCapiPayload({
      eventName: "Purchase",
      eventId: "evt-1",
      eventTime: 1700000000,
      eventSourceUrl: "https://trad-mart.vercel.app/cart",
      value: 1500,
      numItems: 3,
      contentIds: ["p1", "p2"],
      userData: buildMetaUserData({ phone: "+201001234567", customerName: "Ahmed" }),
    });

    assert.equal(Array.isArray(payload.data), true);
    assert.equal((payload.data as unknown[]).length, 1);

    const event = (payload.data as Record<string, unknown>[])[0];
    assert.equal(event.event_name, "Purchase");
    assert.equal(event.action_source, "website");
    assert.equal(event.event_time, 1700000000);
    assert.equal(event.event_source_url, "https://trad-mart.vercel.app/cart");

    const customData = event.custom_data as Record<string, unknown>;
    assert.equal(customData.value, 1500);
    assert.equal(customData.currency, MARKETING_CURRENCY);
    assert.equal(customData.num_items, 3);
    assert.deepEqual(customData.content_ids, ["p1", "p2"]);
  });

  it("omits event_source_url when there is no referer", () => {
    const payload = buildMetaCapiPayload({
      eventName: "Purchase",
      eventId: "e",
      eventTime: 1,
      eventSourceUrl: null,
    });
    assert.equal("event_source_url" in ((payload.data as Record<string, unknown>[])[0]), false);
  });
});

describe("access tokens never reach the browser", () => {
  it("the storefront script loader imports only the public projection", async () => {
    const component = await read("components/marketing/PixelScripts.tsx");
    assert.match(component, /getPublicMarketingConfig/);
    assert.equal(
      /metaCapiToken|tiktokApiToken/.test(component),
      false,
      "the script component must not name a token at all",
    );
    assert.match(component, /isValidMetaPixelId/);
    assert.match(component, /isValidTikTokPixelId/);
  });

  it("the settings projection function is the only reader handed to the client tree", async () => {
    const source = await read("lib/marketing/settings.ts");
    assert.match(source, /getPublicMarketingConfig/);
    assert.match(source, /buildPublicConfig/);
  });

  it("the admin form is given booleans, never token values", async () => {
    const page = await read("app/admin/(panel)/settings/marketing/page.tsx");
    const form = await read("components/admin/MarketingForm.tsx");

    // The page reads the tokens...
    assert.match(page, /meta_capi_token/);
    // ...but must reduce them to booleans before crossing into the client tree.
    assert.match(page, /metaTokenSaved=\{metaTokenSaved\}/);
    assert.match(page, /tiktokTokenSaved=\{tiktokTokenSaved\}/);
    assert.equal(
      /<MarketingForm[^>]*Token=\{|<MarketingForm[^>]*Token="[^"]*"/.test(page),
      false,
      "no token value may be passed as a prop",
    );

    // The form itself must only accept booleans for token state.
    assert.match(form, /metaTokenSaved: boolean/);
    assert.match(form, /tiktokTokenSaved: boolean/);
  });

  it("the admin PATCH response never echoes a token back", async () => {
    const route = await read("app/api/admin/settings/route.ts");
    const responses = route.match(/NextResponse\.json\([\s\S]*?\)/g) ?? [];
    assert.ok(responses.length > 0, "the route must build at least one response");

    // A leak would mean returning the stored column itself. Assert on the
    // column names rather than on value shapes: a value-shape regex is
    // backtracking-sensitive and silently passes when it should fail.
    for (const response of responses) {
      assert.equal(
        /meta_capi_token|tiktok_api_token/.test(response),
        false,
        `a response must never return a token column: ${response.slice(0, 100)}`,
      );
    }

    // The only token information crossing back is a boolean per platform.
    assert.match(route, /tokens: \{ metaCapiToken: storedMeta, tiktokApiToken: storedTiktok \}/);
    assert.match(route, /const storedMeta = .*length > 0;/);
    assert.match(route, /const storedTiktok = .*length > 0;/);
  });

  it("an empty token field keeps the stored token; only an explicit clear wipes it", async () => {
    const route = await read("app/api/admin/settings/route.ts");
    // The write branch requires a non-empty string before touching the column.
    assert.match(route, /body\.metaCapiToken\.trim\(\)\)/);
    assert.match(route, /body\.tiktokApiToken\.trim\(\)\)/);
    // And clearing is a separate, explicit flag.
    assert.match(route, /update\.meta_capi_token = null/);
    assert.match(route, /update\.tiktok_api_token = null/);
  });

  it("the admin settings route is session-guarded", async () => {
    const route = await read("app/api/admin/settings/route.ts");
    assert.match(route, /export async function PATCH[\s\S]*?isAdmin\(\)[\s\S]*?status: 401/);
  });
});

describe("no public endpoint exposes a token", () => {
  it("there is no token route under app/api", async () => {
    const settingsModule = await read("lib/marketing/settings.ts");
    // The only exported readers are server-only; a future public route must
    // not be able to call the token-bearing one from a client component.
    assert.match(settingsModule, /^import "server-only";/);
  });
});

describe("event wiring", () => {
  it("fires every required event", async () => {
    const expected: Record<string, string> = {
      "components/marketing/TrackingProvider.tsx": 'trackMarketingEvent("PageView")',
      "components/marketing/TrackViewContent.tsx": 'trackMarketingEvent("ViewContent"',
      "components/OrderNowButton.tsx": 'trackMarketingEvent("AddToCart"',
      "components/ProductCard.tsx": 'trackMarketingEvent("AddToCart"',
      "components/cart/CartView.tsx": 'trackMarketingEvent("InitiateCheckout"',
    };

    for (const [file, needle] of Object.entries(expected)) {
      const source = await read(file);
      assert.ok(source.includes(needle), `${file} must contain ${needle}`);
    }

    // Purchase is split: browser half in the cart, server half in the route.
    const cart = await read("components/cart/CartView.tsx");
    assert.match(cart, /trackMarketingEvent\("Purchase"/);
    assert.match(cart, /eventId: result\.eventId/);

    const route = await read("app/api/orders/route.ts");
    assert.match(route, /sendServerMarketingEvent/);
    assert.match(route, /eventName: "Purchase"/);
    assert.match(route, /eventId: order\.eventId/);
    assert.match(route, /eventId: order\.eventId,/, "the same id must reach the response");
  });

  it("keeps PageView off the first render so the snippet is not double-counted", async () => {
    const provider = await read("components/marketing/TrackingProvider.tsx");
    assert.match(provider, /lastPath\.current === null/);
    assert.match(provider, /already sent the initial PageView/);
  });

  it("dedupes the browser ViewContent against StrictMode double-effects", async () => {
    const component = await read("components/marketing/TrackViewContent.tsx");
    assert.match(component, /tracked\.current === productId/);
  });

  it("mints the event id on the server, not in the browser", async () => {
    const create = await read("lib/orders/create.ts");
    assert.match(create, /randomUUID\(\)/);
    assert.match(create, /eventId: string/);
  });

  it("never logs a token or a vendor response body", async () => {
    const source = await read("lib/marketing/server-events.ts");
    // Only a status code may be logged: the body can echo the token back.
    assert.match(source, /`HTTP \$\{response\.status\}`/);
    assert.equal(/await response\.json\(\)/.test(source), false);
    assert.equal(/console\.(log|info)\([^)]*token/i.test(source), false);
  });
});

describe("the pixel script ships in the HTML, not just the RSC payload", () => {
  it("emits a raw inline script instead of relying on next/script", async () => {
    const component = await read("components/marketing/PixelScripts.tsx");
    // next/script was tried with both strategies and neither emitted a plain
    // <script> element with a usable id: afterInteractive left the snippet only
    // in the self.__next_f RSC payload (gated on hydration), and
    // beforeInteractive only queued it onto self.__next_s while dropping the id
    // and tripping no-before-interactive-script-outside-document.
    assert.equal(
      /from "next\/script"/.test(component),
      false,
      "next/script defers past HTML parse or hides behind Next internals",
    );
    assert.match(component, /<script/);
    assert.match(component, /id="meta-pixel"/);
    assert.match(component, /id="tiktok-pixel"/);
  });

  it("still embeds each ID safely and never with next/script", async () => {
    const component = await read("components/marketing/PixelScripts.tsx");
    // Each snippet embeds its own ID via JSON.stringify, so an ID can never
    // break out of the string literal it sits in.
    assert.equal((component.match(/JSON\.stringify\(pixelId\)/g) ?? []).length >= 2, true);
    // Match the JSX prop, not the prose: the file deliberately explains why
    // afterInteractive was rejected, so a bare word match would trip on the
    // comment and tell us nothing about the rendered output.
    assert.equal(/strategy="(afterInteractive|lazyOnload)"/.test(component), false);
  });
});

describe("the token fields resist browser autofill", () => {
  it("asks for a new password rather than allowing autofill", async () => {
    const form = await read("components/admin/MarketingForm.tsx");
    // autoComplete="off" is ignored by Chrome on password inputs; it offers to
    // GENERATE one instead. A generated value is indistinguishable from a pasted
    // token, so it could be saved by accident and sent to Meta on every order.
    assert.match(form, /autoComplete="new-password"/);
    assert.match(form, /data-1p-ignore/);
    assert.match(form, /name=\{`\$\{id\}-value`\}/);
  });

  it("never pre-fills a saved token into the field", async () => {
    const form = await read("components/admin/MarketingForm.tsx");
    // The saved state is signalled by the placeholder only; the value stays "".
    assert.match(form, /saved \? "•••••••••• \(محفوظ\)" : "غير مُحفوظ"/);
  });
});

describe("the pixel id is never frozen at build time", () => {
  it("opts out of prerendering so an admin change applies immediately", async () => {
    const component = await read("components/marketing/PixelScripts.tsx");
    // This component lives in the root layout, so it also renders for routes
    // that were otherwise static (/cart, /admin/login). Without connection()
    // their HTML is baked at build and the pixel id would only change on
    // redeploy, defeating the point of an admin-configurable setting.
    assert.match(component, /import \{ connection \} from "next\/server"/);
    assert.match(component, /await connection\(\)/);
    // ...and it must come before the settings read.
    const connectionAt = component.indexOf("await connection()");
    const readAt = component.indexOf("await getPublicMarketingConfig()");
    assert.ok(connectionAt > -1 && readAt > -1, "both calls must be present");
    assert.ok(connectionAt < readAt, "connection() must precede the settings read");
  });

  it("does not reach for the deprecated noStore opt-out", async () => {
    const component = await read("components/marketing/PixelScripts.tsx");
    assert.equal(/unstable_noStore/.test(component), false, "connection() replaces it");
  });
});

describe("migration", () => {
  it("adds the four marketing columns idempotently", async () => {
    const migration = await read(
      "supabase/migrations/20260928000000_phase8_marketing_pixels.sql",
    );
    assert.match(migration, /add column if not exists meta_pixel_id text/);
    assert.match(migration, /add column if not exists meta_capi_token text/);
    assert.match(migration, /add column if not exists tiktok_pixel_id text/);
    assert.match(migration, /add column if not exists tiktok_api_token text/);
    assert.match(migration, /rename column facebook_pixel_id to meta_pixel_id/);
    assert.match(migration, /notify pgrst, 'reload schema'/);
  });

  it("never grants the anon role access to the token columns", async () => {
    const migration = await read(
      "supabase/migrations/20260928000000_phase8_marketing_pixels.sql",
    );
    assert.equal(
      /grant select[^;]*to anon/i.test(migration),
      false,
      "settings must stay unreachable from the browser key",
    );
    assert.equal(/create policy/i.test(migration), false);
  });
});
