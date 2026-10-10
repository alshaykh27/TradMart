import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SETTINGS_ID } from "@/lib/settings";
import type { TablesUpdate } from "@/types/database";
import {
  isMissingFoldColumns,
  withFoldFallback,
  withoutFoldKeys,
} from "@/lib/products/fold-columns";
import {
  cleanPixelId,
  isValidAccessToken,
  isValidMetaPixelId,
  isValidTikTokPixelId,
} from "@/lib/marketing/config";
import {
  cleanFacebookUrl,
  cleanWhatsAppNumber,
  isMissingSocialColumns,
  normaliseSocialLinks,
} from "@/lib/social/links";

/**
 * PATCH /api/admin/settings
 *
 * Three independent concerns share this route because they share one row:
 *   - shipping_markup        (order totals)
 *   - the four marketing fields (pixels)
 *   - facebook_url / whatsapp_number (public contact links, Phase 13)
 *
 * TOKEN SEMANTICS — this is the security-critical part.
 *
 * Access tokens are write-only. The response never contains one, and the admin
 * form never receives one (see components/admin/MarketingForm): a value passed
 * from a Server Component to a Client Component is serialised into the RSC
 * payload, i.e. visible in devtools. The form is therefore told only *whether*
 * a token is stored, and this route interprets the payload as:
 *
 *   field absent, or an empty string  -> keep whatever is stored
 *   field non-empty                    -> replace the stored token
 *   clear<Field>Token === true         -> set the stored token to NULL
 *
 * So an empty field can never silently wipe a working token, and clearing one
 * is always an explicit act.
 */

type MarketingBody = {
  metaPixelId?: unknown;
  metaCapiToken?: unknown;
  clearMetaCapiToken?: unknown;
  tiktokPixelId?: unknown;
  tiktokApiToken?: unknown;
  clearTiktokApiToken?: unknown;
  facebookUrl?: unknown;
  whatsappNumber?: unknown;
};

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  let body: MarketingBody & { shippingMarkup?: unknown; shippingFoldDefault?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const update: TablesUpdate<"settings"> = {};

  // --- shipping markup (unchanged contract) --------------------------------
  if (body?.shippingMarkup !== undefined) {
    const value = body.shippingMarkup;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return NextResponse.json({ ok: false, error: "القيمة غير صالحة" }, { status: 422 });
    }
    if (value < 0 || value > 1000) {
      return NextResponse.json({ ok: false, error: "الزيادة خارج النطاق" }, { status: 422 });
    }
    update.shipping_markup = Math.round(value * 100) / 100;
  }

  // --- flat fold default (prefills the per-product "شحن مجاني" control) ----
  if (body?.shippingFoldDefault !== undefined) {
    const value = body.shippingFoldDefault;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return NextResponse.json({ ok: false, error: "القيمة غير صالحة" }, { status: 422 });
    }
    if (value < 0 || value > 100_000) {
      return NextResponse.json({ ok: false, error: "القيمة خارج النطاق" }, { status: 422 });
    }
    update.shipping_fold_default = Math.round(value * 100) / 100;
  }

  // --- marketing ----------------------------------------------------------
  const has = (key: keyof MarketingBody) => Object.prototype.hasOwnProperty.call(body, key);
  const wantsClear = (key: "clearMetaCapiToken" | "clearTiktokApiToken") =>
    has(key) && body[key] === true;

  if (has("metaPixelId")) {
    const pixelId = cleanPixelId(body.metaPixelId);
    // An empty Pixel ID is a legitimate "turn Meta off" action.
    if (pixelId !== null && !isValidMetaPixelId(pixelId)) {
      return NextResponse.json(
        { ok: false, error: "معرّف بكسل ميتا غير صالح — أرقام فقط" },
        { status: 422 },
      );
    }
    update.meta_pixel_id = pixelId;
  }

  if (has("tiktokPixelId")) {
    const pixelId = cleanPixelId(body.tiktokPixelId);
    if (pixelId !== null && !isValidTikTokPixelId(pixelId)) {
      return NextResponse.json(
        { ok: false, error: "معرّف بكسل تيك توك غير صالح" },
        { status: 422 },
      );
    }
    update.tiktok_pixel_id = pixelId;
  }

  if (wantsClear("clearMetaCapiToken")) {
    update.meta_capi_token = null;
  } else if (has("metaCapiToken") && typeof body.metaCapiToken === "string" && body.metaCapiToken.trim()) {
    const token = body.metaCapiToken.trim();
    if (!isValidAccessToken(token)) {
      return NextResponse.json(
        { ok: false, error: "رمز الوصول غير صالح" },
        { status: 422 },
      );
    }
    update.meta_capi_token = token;
  }

  if (wantsClear("clearTiktokApiToken")) {
    update.tiktok_api_token = null;
  } else if (has("tiktokApiToken") && typeof body.tiktokApiToken === "string" && body.tiktokApiToken.trim()) {
    const token = body.tiktokApiToken.trim();
    if (!isValidAccessToken(token)) {
      return NextResponse.json(
        { ok: false, error: "رمز الوصول غير صالح" },
        { status: 422 },
      );
    }
    update.tiktok_api_token = token;
  }

  // --- social / contact links (Phase 13) ----------------------------------
  // Unlike the tokens these are public values, so an empty field legitimately
  // means "clear the link": the cleaned result (including null) is written.
  if (has("facebookUrl")) {
    const raw = body.facebookUrl;
    const cleaned = cleanFacebookUrl(raw);
    if (raw !== null && raw !== undefined && String(raw).trim() !== "" && cleaned === null) {
      return NextResponse.json(
        { ok: false, error: "رابط فيسبوك غير صالح — استخدم رابطًا من facebook.com" },
        { status: 422 },
      );
    }
    update.facebook_url = cleaned;
  }

  if (has("whatsappNumber")) {
    const raw = body.whatsappNumber;
    const cleaned = cleanWhatsAppNumber(raw);
    if (raw !== null && raw !== undefined && String(raw).trim() !== "" && cleaned === null) {
      return NextResponse.json(
        { ok: false, error: "رقم واتساب غير صالح" },
        { status: 422 },
      );
    }
    update.whatsapp_number = cleaned;
  }

// --- nothing to do ------------------------------------------------------
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, tokens: { metaCapiToken: false, tiktokApiToken: false } });
  }

  const admin = createAdminClient();

  // The write and the read are separate on purpose: an `update().select()` with
  // the fold column still errors 42703 when the column is absent, so the write
  // runs bare (its fold entry stripped on that error) and the typed read-back
  // uses withFoldFallback.
  let payload = update;
  let writeError = (await admin.from("settings").update(payload).eq("id", SETTINGS_ID)).error;

  if (isMissingFoldColumns(writeError)) {
    // The flat fold default column is not in the schema yet: persist the rest
    // (markup + pixels) without it so the settings form keeps working.
    payload = withoutFoldKeys(payload);
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: true, tokens: { metaCapiToken: false, tiktokApiToken: false } });
    }
    writeError = (await admin.from("settings").update(payload).eq("id", SETTINGS_ID)).error;
  }

  // The Phase 13 social columns are not in the schema yet: say so plainly
  // instead of the generic 502, otherwise the admin would save "successfully"
  // into a table that never received the value.
  if (isMissingSocialColumns(writeError)) {
    return NextResponse.json(
      {
        ok: false,
        error: "أعمدة التواصل غير موجودة في قاعدة البيانات — طبّق ترحيل phase13_social_links أولًا",
      },
      { status: 409 },
    );
  }

  if (writeError) {
    return NextResponse.json({ ok: false, error: "تعذّر الحفظ" }, { status: 502 });
  }

  const { data } = await withFoldFallback(
    () =>
      admin
        .from("settings")
        .select("shipping_markup, shipping_fold_default, meta_pixel_id, tiktok_pixel_id")
        .eq("id", SETTINGS_ID)
        .maybeSingle(),
    () =>
      admin
        .from("settings")
        .select("shipping_markup, meta_pixel_id, tiktok_pixel_id")
        .eq("id", SETTINGS_ID)
        .maybeSingle(),
  );

  if (!data) {
    return NextResponse.json({ ok: false, error: "تعذّر الحفظ" }, { status: 502 });
  }

  // Report whether each token is now stored, so the form can update its state.
  // Only the BOOLEAN crosses back — the value itself never does.
  const stored = await admin
    .from("settings")
    .select("meta_capi_token, tiktok_api_token")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  const storedMeta = typeof stored?.data?.meta_capi_token === "string" && stored.data.meta_capi_token.length > 0;
  const storedTiktok = typeof stored?.data?.tiktok_api_token === "string" && stored.data.tiktok_api_token.length > 0;

  // Read back the social links through the same normalisation the storefront
  // uses, so the form can swap its state for what was actually stored (a
  // rejected URL comes back as null rather than echoing the bad input).
  const socialRow = await admin
    .from("settings")
    .select("facebook_url, whatsapp_number")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  const social = normaliseSocialLinks(socialRow.error ? null : socialRow.data);

  return NextResponse.json({
    ok: true,
    shippingMarkup: Number(data.shipping_markup),
    shippingFoldDefault: data.shipping_fold_default == null ? 85 : Number(data.shipping_fold_default),
    saved: {
      metaPixelId: data.meta_pixel_id ?? null,
      tiktokPixelId: data.tiktok_pixel_id ?? null,
    },
    social: {
      facebookUrl: social.facebookUrl,
      whatsappNumber: social.whatsappNumber,
    },
    tokens: { metaCapiToken: storedMeta, tiktokApiToken: storedTiktok },
  });
}
