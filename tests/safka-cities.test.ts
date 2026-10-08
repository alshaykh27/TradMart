import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectSafkaCities,
  parseCityId,
  resolveOrderCity,
  selectCityId,
} from "../lib/safka/cities.ts";
import type { SafkaPriceListEntry } from "../types/safka.ts";

/**
 * Safka has no cities endpoint (all candidates 404), so the only source of
 * city ids is the `cities[]` nested in GET /api/v1/public/price-list. These
 * tests pin the rules that keep those ids safe to send: `city` reaches Safka
 * as a Number, so anything that is not a real price-list id must never get out.
 */

function entry(overrides: Partial<SafkaPriceListEntry> = {}): SafkaPriceListEntry {
  return {
    _id: "646640cae83c5603c3cb3c41",
    is_active: true,
    governorateNameAr: "القاهرة",
    governorateName: "Cairo",
    price: 60,
    cities: [],
    ...overrides,
  };
}

describe("parseCityId", () => {
  it("keeps a plain numeric id and trims padding", () => {
    assert.equal(parseCityId("336"), "336");
    assert.equal(parseCityId("  336  "), "336");
    assert.equal(parseCityId("1"), "1");
    assert.equal(parseCityId("423"), "423");
  });

  it("accepts a numeric id from the API as well as a string", () => {
    assert.equal(parseCityId(336), "336");
  });

  it("rejects anything Safka could not cast to a Number", () => {
    assert.equal(parseCityId("القاهرة"), null);
    assert.equal(parseCityId("12.5"), null);
    assert.equal(parseCityId("1e3"), null);
    assert.equal(parseCityId(""), null);
    assert.equal(parseCityId("   "), null);
    assert.equal(parseCityId("1234567"), null);
    assert.equal(parseCityId("-1"), null);
    assert.equal(parseCityId(null), null);
    assert.equal(parseCityId(undefined), null);
    assert.equal(parseCityId({ id: "1" }), null);
  });
});

describe("collectSafkaCities", () => {
  it("extracts ids, names and their governorate", () => {
    const rows = collectSafkaCities([
      entry({
        _id: "gov-cairo",
        cities: [
          { id: "1", city_name_ar: "القاهرة", city_name_en: "Cairo" },
          { id: "2", city_name_ar: "الجيزة", city_name_en: "Giza" },
        ],
      }),
    ]);

    assert.deepEqual(rows, [
      { city_id: "1", governorate_id: "gov-cairo", name_ar: "القاهرة", name_en: "Cairo" },
      { city_id: "2", governorate_id: "gov-cairo", name_ar: "الجيزة", name_en: "Giza" },
    ]);
  });

  it("normalises a numeric id and defaults a missing English name", () => {
    const rows = collectSafkaCities([
      entry({ cities: [{ id: 336 as unknown as string, city_name_ar: "دسوق" }] }),
    ]);

    assert.deepEqual(rows, [
      { city_id: "336", governorate_id: "646640cae83c5603c3cb3c41", name_ar: "دسوق", name_en: "" },
    ]);
  });

  it("drops cities without a usable id or an Arabic name", () => {
    const rows = collectSafkaCities([
      entry({
        cities: [
          { id: "", city_name_ar: "بدون" },
          { id: "abc", city_name_ar: "حريف" },
          { id: "336", city_name_ar: "" },
          { id: "336", city_name_ar: "دسوق" },
        ],
      }),
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].city_id, "336");
  });

  it("keeps the first occurrence of a duplicated id", () => {
    const rows = collectSafkaCities([
      entry({ _id: "gov-a", cities: [{ id: "7", city_name_ar: "أول" }] }),
      entry({ _id: "gov-b", cities: [{ id: "7", city_name_ar: "تاني" }] }),
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].governorate_id, "gov-a");
    assert.equal(rows[0].name_ar, "أول");
  });

  it("skips entries with no governorate id and entries with no cities", () => {
    assert.deepEqual(collectSafkaCities([entry({ cities: undefined })]), []);
    assert.deepEqual(collectSafkaCities([entry({ _id: "" })]), []);
    assert.deepEqual(collectSafkaCities([]), []);
  });
});

describe("selectCityId", () => {
  const available = collectSafkaCities([
    entry({ _id: "gov-cairo", cities: [{ id: "1", city_name_ar: "القاهرة" }] }),
    entry({ _id: "gov-desouk", cities: [{ id: "336", city_name_ar: "دسوق" }] }),
  ]);

  it("accepts a city of the governorate being shipped to", () => {
    assert.equal(selectCityId("336", "gov-desouk", available), "336");
  });

  it("refuses a city belonging to another governorate", () => {
    assert.equal(selectCityId("1", "gov-desouk", available), null);
  });

  it("refuses an id that is not in the price list at all", () => {
    assert.equal(selectCityId("999", "gov-desouk", available), null);
  });

  it("refuses free text and empty values", () => {
    assert.equal(selectCityId("دسوق", "gov-desouk", available), null);
    assert.equal(selectCityId("", "gov-desouk", available), null);
    assert.equal(selectCityId(null, "gov-desouk", available), null);
  });
});

describe("resolveOrderCity", () => {
  const rows: Record<string, { governorate_id: string; name_ar: string }> = {
    "336": { governorate_id: "gov-desouk", name_ar: "دسوق" },
    "1": { governorate_id: "gov-cairo", name_ar: "القاهرة" },
  };
  const lookup = async (cityId: string) => rows[cityId] ?? null;

  it("resolves a city of the shipped governorate", async () => {
    assert.deepEqual(await resolveOrderCity("336", "gov-desouk", lookup), {
      id: "336",
      name: "دسوق",
    });
  });

  it("treats a city from another governorate as no city", async () => {
    assert.deepEqual(await resolveOrderCity("336", "gov-cairo", lookup), {
      id: null,
      name: "",
    });
  });

  it("treats an unknown id as no city", async () => {
    assert.deepEqual(await resolveOrderCity("999", "gov-desouk", lookup), {
      id: null,
      name: "",
    });
  });

  it("never blocks checkout on an empty or malformed id", async () => {
    let called = 0;
    const counting = async (cityId: string) => {
      called += 1;
      return lookup(cityId);
    };

    assert.deepEqual(await resolveOrderCity("", "gov-desouk", counting), {
      id: null,
      name: "",
    });
    assert.deepEqual(await resolveOrderCity(null, "gov-desouk", counting), {
      id: null,
      name: "",
    });
    assert.deepEqual(await resolveOrderCity("دسوق", "gov-desouk", counting), {
      id: null,
      name: "",
    });
    assert.equal(called, 0, "a malformed id must not hit the database");
  });

  it("degrades to no city when the lookup itself fails", async () => {
    const boom = async () => {
      throw new Error("table missing");
    };
    assert.deepEqual(await resolveOrderCity("336", "gov-desouk", boom), {
      id: null,
      name: "",
    });
  });
});
