import type { SafkaPriceListEntry } from "@/types/safka";

/**
 * Safka city ids for the create-order payload.
 *
 * Safka has NO cities endpoint: GET /api/v1/public/cities and every other
 * candidate return 404, and the docs sidebar lists only 8 endpoints (no city
 * or area lookup). The ids arrive nested inside GET /api/v1/public/price-list,
 * which the docs describe as returning "cities (cities belonging to that
 * governorate)".
 *
 * `POST /api/v1/public/orders` casts `city` to a Number, so free text becomes
 * NaN and the whole order 400s. Only a price-list city id is ever safe to send.
 *
 * Everything here is pure so it is unit-testable without network or database.
 */

export type SafkaCityRow = {
  city_id: string;
  governorate_id: string;
  name_ar: string;
  name_en: string;
};

/** Safka ids are a dense numeric string range (1..423, 418 present). */
const CITY_ID_RE = /^\d{1,6}$/;

/**
 * Normalises a caller-supplied city id to the form Safka expects, or null when
 * it cannot be a real price-list id. Accepts the number form the API sometimes
 * uses and re-serialises it as digits. This is a SHAPE check only — existence
 * is verified against the `safka_cities` table before anything is stored or
 * sent.
 */
export function parseCityId(raw: unknown): string | null {
  const value = typeof raw === "number" ? String(raw) : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!CITY_ID_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Pulls city rows out of already-active price-list entries.
 *
 * Takes the entries rather than a single one so the caller can apply the same
 * "only active governorates" filter it uses for `governorate_pricing`, keeping
 * the two tables consistent: a city is never listed under a governorate that
 * checkout cannot select.
 *
 * Cities are dropped when they have no usable id or no Arabic name, since the
 * checkout renders Arabic labels only. Duplicate ids (none observed, but the
 * id space is global) keep the first occurrence so an upsert never flips
 * governorates underneath a customer mid-checkout.
 */
export function collectSafkaCities(entries: SafkaPriceListEntry[]): SafkaCityRow[] {
  const seen = new Set<string>();
  const rows: SafkaCityRow[] = [];

  for (const entry of entries) {
    const governorateId = String(entry._id ?? "").trim();
    if (!governorateId) continue;

    for (const city of entry.cities ?? []) {
      // The docs declare `id` as a string, but the ids are numeric and the
      // API has been observed returning either form; both normalise to the
      // digit string Safka casts to a Number.
      const rawId: unknown = typeof city.id === "number" ? String(city.id) : city.id;
      const cityId = parseCityId(rawId);
      if (!cityId || seen.has(cityId)) continue;

      const nameAr = String(city.city_name_ar ?? "").trim();
      if (!nameAr) continue;

      seen.add(cityId);
      rows.push({
        city_id: cityId,
        governorate_id: governorateId,
        name_ar: nameAr,
        name_en: String(city.city_name_en ?? "").trim(),
      });
    }
  }

  return rows;
}

/**
 * The client picks a city from a dropdown, but the request is untrusted: it
 * may carry a stale id, or a city belonging to a different governorate. Both
 * must resolve to "no city" rather than to a wrong-but-plausible id, because
 * Safka would happily accept a valid id from the wrong governorate and ship the
 * order somewhere unintended.
 *
 * Returns the id to store and send, or null meaning "omit `city` entirely".
 */
export function selectCityId(
  requestedCityId: unknown,
  shippingGovernorateId: string,
  available: SafkaCityRow[],
): string | null {
  const cityId = parseCityId(requestedCityId);
  if (!cityId) return null;

  const match = available.find(
    (row) => row.city_id === cityId && row.governorate_id === shippingGovernorateId,
  );
  return match ? match.city_id : null;
}

export type ResolvedCity = {
  /** Id to store and to forward to Safka, or null meaning "omit `city`". */
  id: string | null;
  /** Authoritative Arabic name from `safka_cities.name_ar`, never client text. */
  name: string;
};

/**
 * Server-side resolution of the client's claimed city id.
 *
 * The browser only supplies a HINT (`cityId`). It is kept only when it exists
 * in `safka_cities` AND belongs to the governorate being shipped to — a city
 * from any other governorate is treated as no city at all, because Safka would
 * accept a valid foreign id and ship the order somewhere unintended.
 *
 * `lookup` is injected so this stays unit-testable; `create()` passes a
 * Supabase query. Any lookup failure (network, table missing before the
 * migration runs, thrown error) resolves to "no city" so checkout is never
 * blocked by an optional field.
 */
export async function resolveOrderCity(
  requestedCityId: string | null | undefined,
  governorateId: string,
  lookup: (
    cityId: string,
  ) => Promise<{ governorate_id?: string | null; name_ar?: string | null } | null>,
): Promise<ResolvedCity> {
  const cityId = parseCityId(requestedCityId);
  if (!cityId || !governorateId) return { id: null, name: "" };

  let row: { governorate_id?: string | null; name_ar?: string | null } | null = null;
  try {
    row = await lookup(cityId);
  } catch {
    row = null;
  }
  if (!row) return { id: null, name: "" };
  if (String(row.governorate_id ?? "") !== governorateId) return { id: null, name: "" };

  return { id: cityId, name: String(row.name_ar ?? "").trim() };
}
