import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_PREFIX,
  type AllowedImageType,
} from "@/lib/products/manual";

/**
 * POST /api/admin/products/manual/upload — one image per request.
 *
 * The stored object name is `<uuid>.<ext>` where the extension comes from the
 * ALLOWED_IMAGE_TYPES table, never from the submitted filename, so a crafted
 * name cannot steer the object path or the content type we claim.
 *
 * The bucket is public, so the returned URL is the public object endpoint —
 * same shape as any other product image the storefront already renders.
 */
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const file = form.get("file");
  // A plain text field arrives as a string; only a real File may be uploaded.
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "اختر صورة للرفع" }, { status: 422 });
  }

  if (!isAllowedImageType(file.type)) {
    const allowed = Object.keys(ALLOWED_IMAGE_TYPES).join("، ");
    return NextResponse.json(
      { ok: false, error: `صيغة غير مدعومة — المسموح: ${allowed}` },
      { status: 415 },
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "حجم الصورة أكبر من 5 ميجابايت" },
      { status: 413 },
    );
  }

  const extension = ALLOWED_IMAGE_TYPES[file.type as AllowedImageType];

  const path = `${PRODUCT_IMAGE_PREFIX}${crypto.randomUUID()}.${extension}`;
  const bucket = createAdminClient().storage.from(PRODUCT_IMAGE_BUCKET);

  const { error } = await bucket.upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "تعذّر رفع الصورة" },
      { status: 502 },
    );
  }

  const { data } = bucket.getPublicUrl(path);

  return NextResponse.json({ ok: true, url: data.publicUrl }, { status: 201 });
}