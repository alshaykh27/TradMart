/**
 * Resilience helpers for the Phase 12 shipping-fold columns.
 *
 * shipping_included / shipping_fold on products (and settings.shipping_fold_default)
 * only exist on a project that has actually applied the Phase 12 migration.
 * Until then, every SELECT or write that names them fails with Postgres error
 * 42703 ("column ... does not exist"), and because every product query since the
 * fold commit carries them, the whole storefront and admin panel render empty —
 * the exact incident these helpers guard against.
 *
 * The pattern is "progressive": run a query that selects the fold columns and,
 * when those columns are not in the schema yet, re-run the same query against
 * the exact base column list used before Phase 12. The storefront, cart and
 * admin panel keep working (base prices, no badge) and the fold feature
 * activates automatically the moment the migration lands. Only fold-column
 * errors trigger the fallback, so genuine schema errors for other columns still
 * surface.
 *
 * `withFoldFallback` takes two thunks rather than a column string so each
 * Supabase query can keep its literal column list and therefore its inferred
 * row type (`select()` only returns a typed row for a string literal).
 * Dependency-free so Server Components, Route Handlers and Client Components
 * can all import it.
 */

type QueryError = { code?: string; message?: string };

/** Shape every Supabase query result carries: the PostgrestError or null. */
type WithError = { error: QueryError | null };

const FOLD_COLUMNS = new Set([
  "shipping_included",
  "shipping_fold",
  "shipping_fold_default",
]);

/**
 * True when the error is Postgres "column ... does not exist" for one of the
 * Phase 12 fold columns. A 42703 code alone is not enough: this must not mask
 * a genuinely missing other column.
 */
export function isMissingFoldColumns(error: QueryError | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code === "42703") return /shipping_(included|fold|fold_default)/.test(message);
  return /column "?(products\.)?shipping_(included|fold|fold_default)"? does not exist/.test(
    message,
  );
}

/** The base SELECT list: `columns` with the fold columns removed. */
export function withoutFoldColumns(columns: string): string {
  return columns
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column !== "" && !FOLD_COLUMNS.has(column))
    .join(", ");
}

/** A copy of `row` with the fold columns removed (for insert/update payloads). */
export function withoutFoldKeys<T extends object>(row: T): T {
  const copy = { ...row } as T & Record<string, unknown>;
  for (const key of FOLD_COLUMNS) {
    delete copy[key];
  }
  return copy;
}

/**
 * Runs `buildFull` (which selects the fold columns). If those columns are not
 * yet in the schema, re-runs `buildBase` — the same query without them. The
 * full query's literal column list defines the result type, so callers keep
 * their typed rows either way.
 */
export async function withFoldFallback<T extends WithError>(
  buildFull: () => PromiseLike<T>,
  buildBase: () => PromiseLike<unknown>,
): Promise<T> {
  const full = await buildFull();
  if (!isMissingFoldColumns(full.error)) return full;
  return (await buildBase()) as T;
}