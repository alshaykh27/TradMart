import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanFacebookUrl,
  cleanWhatsAppNumber,
  isMissingSocialColumns,
  normaliseSocialLinks,
  whatsappChatLink,
} from "../lib/social/links.ts";

const read = (relative: string) => readFile(join(process.cwd(), relative), "utf8");

describe("cleanFacebookUrl", () => {
  it("accepts the real page link", () => {
    assert.equal(
      cleanFacebookUrl("https://www.facebook.com/share/19yXFHuacs/"),
      "https://www.facebook.com/share/19yXFHuacs/",
    );
  });

  it("adds a missing scheme and upgrades http to https", () => {
    assert.equal(
      cleanFacebookUrl("facebook.com/share/19yXFHuacs/"),
      "https://facebook.com/share/19yXFHuacs/",
    );
    assert.equal(
      cleanFacebookUrl("http://www.facebook.com/tradmart"),
      "https://www.facebook.com/tradmart",
    );
  });

  it("rejects anything that is not a facebook host", () => {
    assert.equal(cleanFacebookUrl("https://example.com/page"), null);
    assert.equal(cleanFacebookUrl("https://facebook.com.evil.example/page"), null);
    assert.equal(cleanFacebookUrl("https://evilfacebook.com/page"), null);
  });

  it("rejects blank, non-string, oversized and non-http input", () => {
    assert.equal(cleanFacebookUrl(""), null);
    assert.equal(cleanFacebookUrl("   "), null);
    assert.equal(cleanFacebookUrl(null), null);
    assert.equal(cleanFacebookUrl(42), null);
    assert.equal(cleanFacebookUrl("javascript:alert(1)"), null);
    assert.equal(cleanFacebookUrl(`https://facebook.com/${"a".repeat(300)}`), null);
  });
});

describe("cleanWhatsAppNumber", () => {
  it("keeps the owner's formatting but enforces the shape", () => {
    assert.equal(cleanWhatsAppNumber("01094606102"), "01094606102");
    assert.equal(cleanWhatsAppNumber("+201094606102"), "+201094606102");
    assert.equal(cleanWhatsAppNumber(" 010 946 06102 "), "010 946 06102");
    assert.equal(cleanWhatsAppNumber("010-946-06102"), "010-946-06102");
  });

  it("treats blank input as unset", () => {
    assert.equal(cleanWhatsAppNumber(""), null);
    assert.equal(cleanWhatsAppNumber("   "), null);
    assert.equal(cleanWhatsAppNumber(null), null);
    assert.equal(cleanWhatsAppNumber(undefined), null);
  });

  it("rejects letters and implausible lengths", () => {
    assert.equal(cleanWhatsAppNumber("call-me-maybe"), null);
    assert.equal(cleanWhatsAppNumber("<script>alert(1)</script>"), null);
    assert.equal(cleanWhatsAppNumber("01094"), null, "too short");
    assert.equal(cleanWhatsAppNumber("0".repeat(30)), null, "too long");
  });
});

describe("whatsappChatLink", () => {
  it("converts the local Egyptian number to the international wa.me form", () => {
    // The Phase 13 seed value: 01094606102 -> 201094606102 (drop the 0, add 20).
    assert.equal(whatsappChatLink("01094606102"), "https://wa.me/201094606102");
  });

  it("accepts every common way of writing the same number", () => {
    assert.equal(whatsappChatLink("+201094606102"), "https://wa.me/201094606102");
    assert.equal(whatsappChatLink("00201094606102"), "https://wa.me/201094606102");
    assert.equal(whatsappChatLink("201094606102"), "https://wa.me/201094606102");
    assert.equal(whatsappChatLink("010 946 06102"), "https://wa.me/201094606102");
  });

  it("returns null instead of a broken link", () => {
    assert.equal(whatsappChatLink(null), null);
    assert.equal(whatsappChatLink(undefined), null);
    assert.equal(whatsappChatLink(""), null);
    assert.equal(whatsappChatLink("not-a-number"), null);
    assert.equal(whatsappChatLink("12345"), null, "too short for E.164");
  });
});

describe("normaliseSocialLinks", () => {
  it("drops invalid stored values rather than propagating them", () => {
    const result = normaliseSocialLinks({
      facebook_url: "javascript:alert(1)",
      whatsapp_number: "call-me",
    });
    assert.equal(result.facebookUrl, null);
    assert.equal(result.whatsappNumber, null);
  });

  it("normalises a valid row", () => {
    const result = normaliseSocialLinks({
      facebook_url: "https://www.facebook.com/share/19yXFHuacs/",
      whatsapp_number: "01094606102",
    });
    assert.equal(result.facebookUrl, "https://www.facebook.com/share/19yXFHuacs/");
    assert.equal(result.whatsappNumber, "01094606102");
    assert.equal(whatsappChatLink(result.whatsappNumber), "https://wa.me/201094606102");
  });

  it("treats a missing row as no links", () => {
    assert.deepEqual(normaliseSocialLinks(null), { facebookUrl: null, whatsappNumber: null });
    assert.deepEqual(normaliseSocialLinks(undefined), { facebookUrl: null, whatsappNumber: null });
  });
});

describe("isMissingSocialColumns", () => {
  it("recognises the Phase 13 columns being absent", () => {
    assert.equal(
      isMissingSocialColumns({
        code: "42703",
        message: 'column settings.facebook_url of relation "settings" does not exist',
      }),
      true,
    );
    assert.equal(
      isMissingSocialColumns({
        code: "PGRST204",
        message: "Could not find the 'facebook_url' column",
      }),
      true,
    );
  });

  it("does not mask other schema errors", () => {
    assert.equal(
      isMissingSocialColumns({
        code: "42703",
        message: 'column settings.shipping_fold_default does not exist',
      }),
      false,
      "the Phase 12 fold fallback owns that error",
    );
    assert.equal(isMissingSocialColumns({ code: "401", message: "unauthorized" }), false);
    assert.equal(isMissingSocialColumns(null), false);
  });
});

describe("storefront wiring", () => {
  it("the footer reads the links from settings instead of hardcoding anchors", async () => {
    const source = await read("components/Footer.tsx");
    assert.equal(/href="#social"/.test(source), false, "no placeholder social anchors");
    assert.equal(/href="#whatsapp"/.test(source), false, "no placeholder whatsapp anchors");
    assert.match(source, /import \{ connection \} from "next\/server"/);
    assert.match(source, /await connection\(\)/);
    assert.match(source, /await getSocialSettings\(\)/);
    // connection() must come before the read, or the links freeze at build.
    const connectionAt = source.indexOf("await connection()");
    const readAt = source.indexOf("await getSocialSettings()");
    assert.ok(connectionAt > -1 && readAt > -1 && connectionAt < readAt);
  });

  it("the settings reader is server-only and fails open", async () => {
    const source = await read("lib/settings.ts");
    assert.match(source, /^import "server-only";/);
    assert.match(source, /export async function getSocialSettings/);
    // A failure must degrade to no links, never throw into the page render.
    assert.match(source, /if \(error\) return \{ facebookUrl: null, whatsappNumber: null \}/);
  });

  it("renders no floating button and no visible phone number text", async () => {
    const source = await read("components/Footer.tsx");
    assert.equal(/WhatsAppFab/.test(source), false, "the floating button must be gone");
    assert.equal(/fixed bottom-/.test(source), false, "no fixed sticker in the footer tree");
    assert.equal(
      /\{social\.whatsappNumber\}/.test(source),
      false,
      "the raw number must never be rendered as text",
    );
    // The component itself is removed from the codebase, not merely unused.
    await assert.rejects(read("components/WhatsAppFab.tsx"));
  });

  it("the footer links open in a new tab with the derived urls", async () => {
    const source = await read("components/Footer.tsx");
    assert.match(source, /whatsappChatLink\(social\.whatsappNumber\)/);
    assert.match(source, /href=\{whatsappHref\}/);
    assert.match(source, /href=\{link\.href\}/);
    assert.match(source, /target="_blank"/);
    assert.match(source, /rel="noopener noreferrer"/);
  });
});

describe("admin wiring", () => {
  it("the PATCH route validates both fields and never loses the fold fallback", async () => {
    const route = await read("app/api/admin/settings/route.ts");
    assert.match(route, /cleanFacebookUrl\(/);
    assert.match(route, /cleanWhatsAppNumber\(/);
    assert.match(route, /update\.facebook_url = cleaned/);
    assert.match(route, /update\.whatsapp_number = cleaned/);
    assert.match(route, /isMissingSocialColumns\(writeError\)/);
  });

  it("the admin nav exposes the social settings page", async () => {
    const nav = await read("components/admin/AdminNav.tsx");
    assert.match(nav, /\/admin\/settings\/social/);
  });

  it("the form validates with the same helpers it previews with", async () => {
    const form = await read("components/admin/SocialForm.tsx");
    assert.match(form, /whatsappChatLink\(/);
    assert.match(form, /cleanFacebookUrl\(/);
    assert.match(form, /cleanWhatsAppNumber\(/);
  });
});

describe("migration", () => {
  it("adds the two social columns idempotently and seeds the current links", async () => {
    const migration = await read(
      "supabase/migrations/20261010000100_phase13_social_links.sql",
    );
    assert.match(migration, /add column if not exists facebook_url text/);
    assert.match(migration, /add column if not exists whatsapp_number text/);
    assert.match(migration, /facebook\.com\/share\/19yXFHuacs/);
    assert.match(migration, /01094606102/);
    assert.match(migration, /notify pgrst, 'reload schema'/);
  });

  it("never grants the anon role access or creates a policy", async () => {
    const migration = await read(
      "supabase/migrations/20261010000100_phase13_social_links.sql",
    );
    assert.equal(/grant select[^;]*to anon/i.test(migration), false);
    assert.equal(/create policy/i.test(migration), false);
  });
});
