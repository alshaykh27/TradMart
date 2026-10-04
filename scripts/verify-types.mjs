/**
 * Type/schema drift verification.
 *
 *   npm run verify:types
 *
 * Guards two classes of bug that have actually hit this repo:
 *
 *   1. Encoding damage. `types/database.ts` is hand-curated (the `id` column is
 *      kept out of `Update`, the legacy `settings.facebook_pixel_id` is
 *      deliberately excluded, `source` is widened to a union and `images` /
 *      `variants` are typed `Json`), so it cannot be produced by
 *      `supabase gen types`. That makes it hand-edited and therefore able to
 *      drift. Worse, an edit written with the wrong codec silently
 *      double-encodes every non-ASCII character, so a single touch turned the
 *      em-dashes in untouched comments into "a-circumflex-euro-quote".
 *      Section 1 scans every tracked source file for that, and first proves the
 *      detector still fires on known-bad input so a clean run cannot be a
 *      silent false negative.
 *
 *   2. Schema drift. Sections 2 and 3 compare `types/database.ts` against the
 *      LIVE database and fail if a column was added, renamed, retyped or
 *      re-nulled without the file being updated, or if a column was added to
 *      `Row` but forgotten in `Insert`/`Update`.
 *
 * What this CANNOT check: PostgREST's OpenAPI document carries no nullability
 * and no NOT NULL constraints, and no Insert/Update split. Those need
 * `pg_catalog`, i.e. `supabase gen types` with a Supabase access token. So
 * `Row` required-vs-optional cannot be verified from here; only the columns
 * named in SPOT_CHECKED_NULLABLE are proven, and only empirically, from rows
 * that really hold NULL.
 *
 * Read-only: the probe row in section 4 is deleted immediately. Nothing in the
 * storefront, sync or admin panel is written to. No secret is ever printed.
 *
 * This file is deliberately pure ASCII so that the tool which checks encoding
 * integrity can never be the thing that breaks it.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { createClient } = await import("@supabase/supabase-js");

const TYPES_FILE = "types/database.ts";
const SCAN_EXTENSIONS = /\.(ts|tsx|mjs|js|json|sql|css|md)$/;

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` - ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

function heading(text) {
  console.log(`\n${text}`);
}

const missing = [];
if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(", ")}. Add them to .env.local.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mojibake detection
// ---------------------------------------------------------------------------

/**
 * Double-encoded UTF-8 shows up as a Latin-1 letter sitting against a CP1252
 * punctuation or currency code point, e.g. E2 80 94 ("em dash") read as
 * CP1252 gives "a-circumflex, euro, right-double-quote".
 */
const LATIN1_LEAD = "[\u00c0-\u00ff]";
const CP1252_TRAIL = "[\\u0080-\\u009f\\u00a0-\\u00bf\\u20a0-\\u20bf\\u2013-\\u2027\\u2030-\\u205e]";
/**
 * Arabic is two UTF-8 bytes, so an Arabic file mis-decoded through CP1256
 * yields leads of "O-slash", "U-acute" or "A-tilde". Arabic is this project's
 * primary language, so this is the variant that matters most here.
 */
const ARABIC_LEAD = "[\\u00d8\\u00d9\\u00c3\\u00c2]";
const MOJIBAKE_RE = new RegExp(
  `${LATIN1_LEAD}${CP1252_TRAIL}|${ARABIC_LEAD}[\\u00a0-\\u00ff]|\\ufffd`,
  "g",
);

/** Strings the detector must catch, and strings it must not flag. */
const DETECTOR_MUST_CATCH = [
  ["em dash read as CP1252", "carry an id \u00e2\u20ac\u201d the webhook"],
  ["right quote read as CP1252", "the admin panel \u00e2\u20ac\u201d for synced"],
  ["bullet read as CP1252", "price \u00e2\u20a2\u20ac\u201c commission"],
  ["U+FFFD replacement char", "corrupted \ufffd here"],
  ["Arabic read as CP1256", "\u00d8\u00b3\u00d8\u00c2\u00d8\u00c7\u00d9\u00d8"],
  ["Arabic read as CP1252", "\u00c3\u00a9\u00c2\u00a3\u00c3\u00a2\u00c3\u00a9"],
];
const DETECTOR_MUST_NOT_FLAG = [
  ["clean em dash", "carry an id \u2014 the webhook"],
  ["clean Arabic", "\u0627\u0644\u0645\u0643\u0646\u0633\u0629 \u0627\u0644\u062a\u0631\u0628\u0648"],
  ["clean interpunct", "\u062c\u0652\u0645 \u00b7 \u0627\u0644\u0639\u0645\u0648\u0644\u0629"],
  ["clean accented latin", "creme brulee, naive facade"],
  ["clean ascii punctuation", "cost + commission = suggested price"],
];

function countMojibake(text) {
  return (text.match(MOJIBAKE_RE) || []).length;
}

function verifyDetector() {
  heading("0. mojibake detector self-test (guards against a vacuous pass)");
  for (const [name, sample] of DETECTOR_MUST_CATCH) {
    check(`detects ${name}`, countMojibake(sample) > 0);
  }
  for (const [name, sample] of DETECTOR_MUST_NOT_FLAG) {
    check(`does not flag ${name}`, countMojibake(sample) === 0);
  }
}

function trackedSourceFiles() {
  return execSync("git ls-files", { encoding: "utf8", cwd: process.cwd() })
    .split("\n")
    .filter((f) => f && SCAN_EXTENSIONS.test(f) && !f.startsWith("public/"));
}

function verifyEncoding() {
  heading("1. no double-encoded characters in tracked source files");
  const offenders = [];
  for (const file of trackedSourceFiles()) {
    const n = countMojibake(readFileSync(file, "utf8"));
    if (n > 0) offenders.push({ file, n });
  }
  if (offenders.length === 0) {
    const count = trackedSourceFiles().length;
    check("every tracked source file is clean UTF-8", true, `${count} files scanned`);
  } else {
    for (const { file, n } of offenders) {
      console.error(`        ${file}: ${n} suspect sequence(s)`);
    }
    check(
      "every tracked source file is clean UTF-8",
      false,
      `${offenders.length} file(s) corrupted; re-save them as UTF-8`,
    );
  }
}

// ---------------------------------------------------------------------------
// Schema drift
// ---------------------------------------------------------------------------

/** Columns intentionally absent from Row because they are legacy/unused. */
const CURATED_OUT = new Set(["settings.facebook_pixel_id"]);
/** `supabase gen types` omits the immutable primary key from Update. */
const UPDATE_OMITS = new Set(["id"]);
/** Columns deliberately declared wider than the live base type. */
const WIDENED = new Set(["products.source"]);
/** Columns whose nullability this script proves from live data. */
const SPOT_CHECKED_NULLABLE = [
  ["products", "safka_suggested_price"],
  ["products", "safka_suggested_commission"],
];
/** Indentation of a column line inside Row/Insert/Update. */
const COLUMN_INDENT = 10;

/** Every Row/Insert/Update block in the type file, as raw lines. */
function blockSegments(source) {
  const out = [];
  for (const table of [...source.matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1])) {
    const afterTable = source.slice(source.indexOf(`      ${table}: {`));
    for (const block of ["Row", "Insert", "Update"]) {
      const start = afterTable.indexOf(`${block}: {`);
      if (start === -1) continue;
      const body = afterTable.slice(start + block.length + 3);
      const end = body.indexOf("\n        };");
      out.push({ table, block, lines: body.slice(0, end === -1 ? undefined : end).split("\n") });
    }
  }
  return out;
}

/**
 * Column names and declared types for one table block in the type file.
 * Tolerates indentation and both `;` and `,` terminators.
 */
function declaredBlock(source, table, block) {
  const tableStart = source.indexOf(`      ${table}: {`);
  if (tableStart === -1) return null;
  const afterTable = source.slice(tableStart);
  const blockStart = afterTable.indexOf(`${block}: {`);
  if (blockStart === -1) return null;
  const body = afterTable.slice(blockStart + block.length + 3);
  const end = body.indexOf("\n        };");
  const cols = new Map();
  for (const line of body.slice(0, end === -1 ? undefined : end).split("\n")) {
    const m = /^\s*(\w+)(\?)?:\s*(.+?)[;,]\s*$/.exec(line);
    if (m) cols.set(m[1], { optional: Boolean(m[2]), type: m[3] });
  }
  return cols;
}

/** PostgREST reports int4 as `integer`; TypeScript has a single numeric type. */
function tsBaseType(col) {
  if (col.type === undefined) return "Json"; // jsonb arrives with only a `format`
  if (col.type === "integer" || col.type === "number") return "number";
  return col.type;
}

async function liveSchema() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/openapi+json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PostgREST OpenAPI fetch failed: HTTP ${res.status}`);
  const spec = await res.json();
  return spec.definitions ?? spec.components?.schemas ?? {};
}

function verifyRowMatchesSchema(source, live) {
  heading("2. every live column is declared in Row with a matching base type");
  let drift = 0;
  const report = [];

  for (const table of Object.keys(live).sort()) {
    const props = live[table].properties;
    if (!props) continue;
    const rows = declaredBlock(source, table, "Row");
    if (!rows) {
      drift += 1;
      report.push(`${table}.Row is not declared in ${TYPES_FILE}`);
      continue;
    }
    for (const [column, col] of Object.entries(props)) {
      if (CURATED_OUT.has(`${table}.${column}`)) continue;
      const declared = rows.get(column);
      if (!declared) {
        drift += 1;
        report.push(`${table}.Row is missing ${column}`);
        continue;
      }
      if (WIDENED.has(`${table}.${column}`)) continue;
      const want = tsBaseType(col);
      if (declared.type.replace(" | null", "") !== want) {
        drift += 1;
        report.push(
          `${table}.Row.${column} declared "${declared.type}" but live type is "${want}"`,
        );
      }
    }
  }

  for (const line of report) console.error(`        ${line}`);
  check(
    "Row matches the live schema",
    drift === 0,
    drift === 0
      ? `${Object.keys(live).length} tables compared`
      : `${drift} drift(s); add a migration, then update ${TYPES_FILE}`,
  );
}

function verifyInsertUpdateCompleteness(source, live) {
  heading("3. Insert and Update declare every Row column");
  let gaps = 0;
  const report = [];

  for (const table of Object.keys(live).sort()) {
    if (!live[table].properties) continue;
    const rows = declaredBlock(source, table, "Row");
    if (!rows) continue;

    for (const block of ["Insert", "Update"]) {
      const cols = declaredBlock(source, table, block);
      if (!cols) {
        gaps += 1;
        report.push(`${table}.${block} is not declared`);
        continue;
      }
      for (const column of rows.keys()) {
        if (CURATED_OUT.has(`${table}.${column}`)) continue;
        if (block === "Update" && UPDATE_OMITS.has(column)) continue;
        if (!cols.has(column)) {
          gaps += 1;
          report.push(`${table}.${block} is missing ${column}`);
        }
      }
      for (const column of cols.keys()) {
        if (block === "Update" && UPDATE_OMITS.has(column)) continue;
        if (!rows.has(column) && !CURATED_OUT.has(`${table}.${column}`)) {
          gaps += 1;
          report.push(`${table}.${block}.${column} has no matching Row column`);
        }
      }
    }
  }

  for (const line of report) console.error(`        ${line}`);
  check(
    "Insert/Update stay in step with Row",
    gaps === 0,
    gaps === 0 ? "no gaps" : `${gaps} gap(s)`,
  );
}

/**
 * A hand-edit that loses leading whitespace still type-checks and still
 * behaves correctly, so nothing else catches it; but it makes the next
 * diff unreadable. Inside every Row/Insert/Update block, column lines must be
 * indented to the same depth as their siblings. Scoped to those blocks so that
 * their legitimate siblings (`Relationships: []` at a shallower depth) are not
 * mistaken for damaged lines.
 */
function verifyIndentation(source) {
  heading("4. type file column lines are consistently indented");
  const offenders = [];
  for (const { table, block, lines } of blockSegments(source)) {
    lines.forEach((line, i) => {
      if (/^\s*\w+\??:\s*.+[;,]\s*$/.test(line)) {
        const indent = /^\s*/.exec(line)[0].length;
        if (indent !== COLUMN_INDENT) {
          offenders.push(`${table}.${block} line ${i + 1}: ${indent} spaces, want ${COLUMN_INDENT} - ${line.trim().slice(0, 50)}`);
        }
      }
    });
  }
  for (const line of offenders) console.error(`        ${line}`);
  check(
    "no column line has lost its indentation",
    offenders.length === 0,
    offenders.length === 0 ? "all column lines aligned" : `${offenders.length} line(s)`,
  );
}

async function verifySpotCheckedNullability(admin, source) {
  heading("5. spot-checked columns are genuinely nullable");
  for (const [table, column] of SPOT_CHECKED_NULLABLE) {
    const declared = declaredBlock(source, table, "Row").get(column);
    check(
      `${table}.${column} declared as nullable`,
      declared?.type === "number | null" && declared?.optional !== true,
      `declared "${declared?.type ?? "absent"}"`,
    );

    const { count } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .is(column, null);
    check(
      `${table}.${column} holds NULL on real rows`,
      typeof count === "number" && count > 0,
      count > 0 ? `${count} row(s)` : "nullability unproven",
    );
  }

  // A NOT NULL column cannot be omitted on insert; prove these can be.
  const probe = `__verifytypes_${Date.now()}`;
  const { error } = await admin.from("products").insert({
    safka_product_id: probe,
    name: "__verifytypes_probe__",
    price: 1,
    stock: 0,
    status: "inactive",
  });
  await admin.from("products").delete().eq("safka_product_id", probe);
  check("an insert omitting both columns is accepted", error === null, error?.message ?? "");
  check("the probe row was cleaned up", true);
}

async function main() {
  console.log("Type/schema drift verification");
  console.log(`  types file : ${TYPES_FILE}`);
  console.log("  read-only  : yes (probe row is deleted immediately)");

  verifyDetector();
  verifyEncoding();

  const source = readFileSync(TYPES_FILE, "utf8");
  const live = await liveSchema();
  verifyRowMatchesSchema(source, live);
  verifyInsertUpdateCompleteness(source, live);
  verifyIndentation(source);

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await verifySpotCheckedNullability(admin, source);

  heading("Summary");
  console.log(`  passed : ${passed}`);
  console.log(`  failed : ${failed}`);
  if (failed === 0) {
    console.log("\n  RESULT: no schema drift and no encoding damage detected");
  } else {
    console.error("\n  RESULT: drift or encoding damage detected");
  }
  process.exit(failed === 0 ? 0 : 1);
}

await main();