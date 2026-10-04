import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  deriveSuggestedCommission,
  parseSafkaSuggestedPrice,
} from "../lib/safka/suggested-price.ts";
import { displayPrice, round2 } from "../lib/products/pricing.ts";

const repoFile = (relative: string) => readFile(join(process.cwd(), relative), "utf8");

/**
 * Every spelling of Safka's suggested-price sentence that actually occurs in the
 * live catalog. These were captured from the public API, not invented, so a
 * supplier rewording the sentence is visible here as a failing test rather than
 * as a product silently losing its button.
 */
const VARIANTS: Array<[note: string, price: number, commission: number, label: string]> = [
  ["سعر البيع المقترح 700 عمولتك 210", 700, 210, "canonical"],
  ["سعر البيع المقترح 150 عمولتك 60", 150, 60, "canonical, small numbers"],
  ["سعر بيع مقترح 150 عمولتك 80", 150, 80, "بيع without ال"],
  ["سعر البيع المقترح 350 جنيه عمولتك 170 جنيه", 350, 170, "جنيه after both figures"],
  ["سعر البيع المقترح 150 جنيه عمولتك 60", 150, 60, "جنيه after the price only"],
  ["سعر البيع المقترح 400 جنيه عمولتك 140 جنيه", 400, 140, "double spaces + جنيه"],
  ["سع البيع المقترح 1050 عمولتك 340", 1050, 340, "سع missing the ر"],
  ["سع البيع المقترح 450 عمولتك 190", 450, 190, "سع + بيع"],
  ["سعر بيع مقترح 400  عمولتك 190", 400, 190, "double space before عمولتك"],
  ["سعر البيع المقترح للقطعة 400 عمولتك 180", 400, 180, "للقطعة before the price"],
  ["سعر البيع المقترح للقطعه 250 عمولتك 120", 250, 120, "للقطعه before the price"],
  ["سعر البيع المقترح للقطعة 100 عمولتك 10", 100, 10, "two-digit commission"],
  ["سعر البيع المقترح للقطعه 300 عمولتك 150", 300, 150, "للقطعه with 3-digit price"],
  ["سعر البيع المقترح للقطعه 180 جنيه عمولتك 75 جنيه", 180, 75, "للقطعه + جنيه both"],
  ["سعر البيع المقترح للقطعة 140 عمولتك 70", 140, 70, "140/70"],
  ["سعر البيع المقترح للقطعه 200 عمولتك 95", 200, 95, "للقطعه with odd commission"],
  ["سعر البيع المقترح للقطعة 400 هتكون عمولتك 235 جنيه", 400, 235, "هتكون عمولتك + جنيه"],
  ["سعر البيع المقترح 900 هتكون عمولتك 325 جنيه", 900, 325, "هتكون عمولتك"],
  ["سعر البيع المقترح 130 هتبقي عمولتك 60", 130, 60, "هتبقي عمولتك"],
  ["سعر البيع المقترح 350 عموتتك 160", 350, 160, "عموتتك typo"],
  ["سعر البيع المقترح 400 عمولك 155", 400, 155, "عمولك short form"],
  ["سعر البيع 300 عمولتك 140", 300, 140, "المقترح omitted"],
  ["سعر البيع مقترح 350 عمولتك 145", 350, 145, "مقترح without ال"],
  ["سعر البيع المقترح 500 عمولتلك 130", 500, 130, "عمولتك with a doubled lam"],
  ["سعر البيع المقترح150 عمولتك 80", 150, 80, "no space after المقترح"],
  ["سعر البيع المقترح 800 عمولت,U290", 800, 290, "guard: this is not a real note"],
];

/**
 * Notes that must parse to null. Every one of these really occurs in the live
 * catalog; the parser has to refuse them rather than pick a number, because
 * there is no single correct answer to offer the merchant.
 */
const REFUSALS: Array<[note: string | null | undefined, label: string]> = [
  [null, "absent note"],
  [undefined, "undefined note"],
  ["", "empty note"],
  ["   ", "whitespace-only note"],
  ["سعر بيع مقترح للقطعه 250 والقطعتين 400", "two tiers, no commission at all"],
  ["سعر البيع المقترح القطعه 170 وعرض القطعتين ب 300", "two tiers with an offer"],
  ["سعر البيع المقترح للقطعه 200 القطعتين 350", "two tiers, no commission"],
  ["سعر البيع المقترح للقطعه 200 قطعتين 180", "two tiers, no commission"],
  [
    "سعر البيع المقترح للقطعه 200 عمولتك 100 وللقطعتين 350 عمولتك 200",
    "two tiers with two different commissions",
  ],
  ["سعر البيع المقترح القطعتين 600 عمولتك 220", "priced for the pair, not the piece"],
  ["سعر البيع المقترح 300 120", "bare numbers with no commission keyword"],
  ["سعر البيع المقترح 350 170", "bare numbers with no commission keyword"],
  ["منتج جديد بدون أي ملاحظة سعرية", "unrelated prose"],
  ["سعر البيع المقترح", "no numbers at all"],
];

describe("reading Safka's suggested price out of the note", () => {
  for (const [note, price, commission, label] of VARIANTS.slice(0, -1)) {
    it(`parses the ${label} variant`, () => {
      const result = parseSafkaSuggestedPrice(note);
      assert.deepEqual(result, { suggestedPrice: price, statedCommission: commission });
    });
  }

  for (const [note, label] of REFUSALS) {
    it(`refuses ${label}`, () => {
      assert.equal(parseSafkaSuggestedPrice(note), null);
    });
  }

  it("never returns a suggested price at or below the cost", () => {
    // A suggestion under cost cannot be applied as a markup, and the admin route
    // rejects a negative commission, so deriving one would be a broken button.
    assert.equal(deriveSuggestedCommission(100, 100), null);
    assert.equal(deriveSuggestedCommission(90, 100), null);
  });

  it("returns null rather than 0 when there is nothing to derive from", () => {
    assert.equal(deriveSuggestedCommission(null, 100), null);
    assert.equal(deriveSuggestedCommission(700, null), null);
    assert.equal(deriveSuggestedCommission(undefined, undefined), null);
  });

  it("accepts Arabic-Indic digits", () => {
    assert.deepEqual(parseSafkaSuggestedPrice("سعر البيع المقترح ٧٠٠ عمولتك ٢١٠"), {
      suggestedPrice: 700,
      statedCommission: 210,
    });
  });

  it("ignores thousands separators", () => {
    assert.deepEqual(parseSafkaSuggestedPrice("سعر البيع المقترح 1,050 عمولتك 340"), {
      suggestedPrice: 1050,
      statedCommission: 340,
    });
  });
});

/**
 * The real corpus. tests/fixtures/safka-suggested-notes.json holds the live
 * `note` and `sale_price` of all 451 products as captured from Safka, plus the
 * parser's verdict at capture time. Re-parsing it here turns any future drift
 * between the parser and production data into a failing test.
 */
interface CorpusRow {
  safka_id: string;
  note: string | null;
  live_cost: number;
  parser_price: number | null;
  parser_stated_commission: number | null;
  derived_commission: number | null;
}

const corpus = JSON.parse(
  await repoFile("tests/fixtures/safka-suggested-notes.json"),
) as { total: number; items: CorpusRow[] };

const parsedRows = corpus.items.filter((row) => row.derived_commission !== null);
/** Notes whose own figures no longer reconcile with the live cost. */
const staleRows = parsedRows.filter(
  (row) =>
    Math.abs(
      Number(row.parser_price) -
        Number(row.live_cost) -
        Number(row.parser_stated_commission),
    ) >= 0.005,
);

describe("the live Safka note corpus", () => {
  it("parses every row the same way it did when captured", () => {
    for (const row of corpus.items) {
      const result = parseSafkaSuggestedPrice(row.note);
      assert.equal(result?.suggestedPrice ?? null, row.parser_price, `price for ${row.safka_id}`);
      assert.equal(
        result?.statedCommission ?? null,
        row.parser_stated_commission,
        `stated commission for ${row.safka_id}`,
      );
      assert.equal(
        deriveSuggestedCommission(result?.suggestedPrice, row.live_cost),
        row.derived_commission,
        `derived commission for ${row.safka_id}`,
      );
    }
  });

  it("applies to most of the catalog and refuses the rest without guessing", () => {
    // Exact counts, so a parser change that silently widens or narrows coverage
    // has to be a deliberate edit to this test.
    assert.equal(corpus.items.length, 451);
    assert.equal(parsedRows.length, 422);
    assert.equal(corpus.items.length - parsedRows.length, 29);
  });

  it("leaves every unparseable product with null columns rather than a default", () => {
    const refused = corpus.items.filter((row) => row.derived_commission === null);
    assert.equal(refused.length, 29);
    for (const row of refused) {
      assert.equal(row.parser_price, null, `${row.safka_id} must have no suggested price`);
      assert.equal(
        row.parser_stated_commission,
        null,
        `${row.safka_id} must have no stated commission`,
      );
    }
    // 21 of the 29 are simply products with no note at all.
    assert.equal(refused.filter((row) => !row.note || row.note.trim() === "").length, 21);
  });

  it("derives a commission that lands exactly on the suggested price, for every product", () => {
    for (const row of parsedRows) {
      assert.equal(
        round2(Number(row.live_cost) + Number(row.derived_commission)),
        Number(row.parser_price),
        `cost + derived commission must equal the suggested price for ${row.safka_id}`,
      );
    }
  });

  it("goes through the same displayPrice formula manual entry uses", () => {
    for (const row of parsedRows) {
      assert.equal(
        displayPrice(Number(row.live_cost), Number(row.derived_commission)),
        Number(row.parser_price),
        `displayPrice must produce the suggested price for ${row.safka_id}`,
      );
    }
  });

  it("proves derivation matters: the note's own commission is stale on these rows", () => {
    // This is the whole reason the commission is derived rather than read. If
    // Safka's note commission were used, these products would be priced away
    // from the figure the merchant was shown.
    assert.ok(
      staleRows.length >= 30,
      `expected a meaningful set of stale notes, found ${staleRows.length}`,
    );

    for (const row of staleRows) {
      const derived = Number(row.derived_commission);
      const stated = Number(row.parser_stated_commission);

      assert.notEqual(
        derived,
        stated,
        `${row.safka_id} should differ from its stale stated commission`,
      );

      // The derived value is the one that hits the suggested price...
      assert.equal(
        displayPrice(Number(row.live_cost), derived),
        Number(row.parser_price),
        `${row.safka_id} must land on the suggested price`,
      );

      // ...whereas the stale figure would not, missing by exactly the drift that
      // was recorded when the fixture was captured.
      const miss = round2(Number(row.live_cost) + stated - Number(row.parser_price));
      const recorded = round2(
        Number(row.parser_price) - Number(row.live_cost) - stated,
      );
      assert.equal(miss, -recorded, `${row.safka_id} drift bookkeeping`);
    }
  });

  it("caps how far the note can be stale", () => {
    const drifts = staleRows.map(
      (row) =>
        Number(row.parser_price) - Number(row.live_cost) - Number(row.parser_stated_commission),
    );
    const worst = Math.max(...drifts.map(Math.abs));
    assert.ok(worst <= 100, `drift of ${worst} exceeds the documented 100 EGP`);
    assert.ok(worst >= 50, `expected drift up to ~100 EGP, worst was ${worst}`);
  });
});

describe("the admin row only offers the button when it is meaningful", () => {
  it("renders it from safka_suggested_commission, not from the note text", async () => {
    const source = await repoFile("components/admin/ProductRow.tsx");
    const gate = source.slice(
      source.indexOf("const suggestedCommission = useMemo"),
      source.indexOf("async function applySuggestedCommission"),
    );
    // A Safka row with both figures; anything else leaves it null.
    assert.match(gate, /if \(isManual\) return null;/);
    assert.match(gate, /if \(product\.cost_price == null\) return null;/);
    assert.match(gate, /if \(product\.safka_suggested_price == null\) return null;/);
    assert.match(gate, /derived > 0 \? derived : null/);
  });

  it("absent rather than disabled, so there is no dead button to click", async () => {
    const source = await repoFile("components/admin/ProductRow.tsx");
    const block = source.slice(source.indexOf("{suggestedCommission !== null && ("));
    const button = block.slice(block.indexOf("<button"), block.indexOf("</button>"));
    // Its only disabled condition is the in-flight save. If there were no
    // suggestion the whole block would not exist, so there is deliberately no
    // "disabled because unavailable" state to render.
    assert.match(button, /disabled=\{saving === "commission"\}/);
    assert.doesNotMatch(button, /suggestedCommission === null|!suggestedCommission/);
  });

  it("saves through the same commission request as the manual input", async () => {
    const source = await repoFile("components/admin/ProductRow.tsx");
    // One request builder, one server endpoint: no second pricing path.
    assert.equal(
      (source.match(/method: "PATCH"/g) ?? []).length >= 2,
      true,
    );
    assert.equal((source.match(/JSON\.stringify\(\{ commission: value \}\)/g) ?? []).length, 1);
    assert.match(
      source,
      /async function applySuggestedCommission\(\) \{[\s\S]{0,200}await saveCommission\(suggestedCommission\);/,
    );
    // The button sets the visible input too, so the merchant sees the value.
    assert.match(source, /setCommission\(String\(suggestedCommission\)\);/);
  });

  it("shows both figures before anything is applied", async () => {
    const source = await repoFile("components/admin/ProductRow.tsx");
    const block = source.slice(source.indexOf("سعر البيع المقترح"));
    assert.match(block, /سعر البيع المقترح/);
    assert.match(block, /العمولة/);
    assert.match(block, /formatMoney\(Number\(product\.safka_suggested_price\)\)/);
    assert.match(block, /formatMoney\(suggestedCommission\)/);
  });

  it("keeps the server authoritative: the columns are never client-writable", async () => {
    const route = await repoFile("app/api/admin/products/[id]/route.ts");
    assert.doesNotMatch(route, /safka_suggested_(price|commission)/);
    // commission still re-derives price server-side.
    assert.match(route, /deriveSyncedPrice\(current\.cost_price, update\.commission\)/);
  });
});

describe("the sync records the suggestion without applying it", () => {
  it("writes both columns on insert and on refresh", async () => {
    const source = await repoFile("scripts/sync-safka-products.ts");
    assert.match(source, /parseSafkaSuggestedPrice\(item\.note\)/);
    assert.match(
      source,
      /deriveSuggestedCommission\(\s*suggested\?\.suggestedPrice,\s*cost,\s*\)/,
    );
    assert.match(source, /safka_suggested_price: suggested\?\.suggestedPrice \?\? null/);
  });

  it("derives the refresh against the cost it is about to write", async () => {
    const source = await repoFile("scripts/sync-safka-products.ts");
    assert.match(
      source,
      /deriveSuggestedCommission\(suggestedPrice, newCost\)/,
    );
  });

  it("still never writes commission or is_published", async () => {
    const source = await repoFile("scripts/sync-safka-products.ts");
    const payload = source.slice(
      source.indexOf("function refreshPayload"),
      source.indexOf("function admin()"),
    );
    assert.doesNotMatch(payload, /commission: row\.commission/);
    assert.doesNotMatch(payload, /is_published/);
    // The derived suggestion must not be confused with the merchant's column.
    assert.doesNotMatch(payload, /^\s*commission:/m);
  });

  it("keeps one row per request", async () => {
    const source = await repoFile("scripts/sync-safka-products.ts");
    assert.doesNotMatch(source, /\.update\(\w+\)\s*\.in\("id"/);
    assert.match(source, /\.update\(refreshPayload\(row\)\)\s*\.eq\("id", row\.id\)/);
  });
});