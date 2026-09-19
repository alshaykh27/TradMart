<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TradeMart project rules

TradeMart is a customer-facing storefront integrated with the Safka API.
It is implemented **one phase at a time**. Never implement multiple phases at once.

- Phases: BUILD -> TEST -> FIX -> VERIFY -> NEXT PHASE.
- A phase is complete only after its tests pass and the result is verified.
- Arabic is the default and primary language (`ar`), and RTL is the default direction.
- English (`en`) must remain possible to add later; keep dictionaries typed.
- Keep API secrets server-side only. Never expose Safka or Supabase service-role keys to the browser.
- Avoid unnecessary dependencies and infrastructure.

## Structure

- `app/` — Next.js App Router routes (customer storefront, `admin/`, `api/`).
- `components/` — shared UI components.
- `i18n/` — locale config (`config.ts`), typed dictionaries (`ar.ts`, `en.ts`).
- `lib/` — server-side integrations (Supabase, Safka, orders, Meta).
- `types/` — shared TypeScript types.
