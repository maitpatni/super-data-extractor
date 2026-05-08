# Cost & APIs

This file is the source of truth for **how we spend the user's money** at Google and Apollo. Every change here moves a real dollar/rupee figure on real bills.

## Google Places API (New) — house rules

### Field masks are billing decisions

Google Places (New) bills per request **per SKU tier**, where the tier is determined by which fields the request asks for. Asking for `displayName` only is Essentials. Asking for `rating`, `userRatingCount`, `regularOpeningHours`, `priceLevel`, `websiteUri` puts you in Pro/Enterprise.

Rules:
- Centralize the field mask in `services/places.js`. **One** constant per tier.
- The cost calculator (`services/cost.js`) reads the same constant and infers the SKU. If the field mask grows, the cost meter updates automatically.
- Adding a field to the mask is a billing change. It needs a one-line note in the PR description and a sanity check in the cost UI.

### Don't double-pay (this is the #1 critical bug from the review)

- A `places:searchText` response with the right `X-Goog-FieldMask` already returns every field we display.
- Do **not** call `places/{id}` afterward. The current `processPlacesPage` → `fetchPlaceDetails` chain roughly doubles the bill on a 500-result run.
- The only legitimate reason to call Place Details is enrichment fields the search response doesn't include (e.g. `editorialSummary`, photos). If a future feature needs that, make it opt-in per search and surface its cost separately.

### Grid search

- Use `locationRestriction` (hard bound), never `locationBias` (soft hint). Bias defeats the entire point of the grid because Google can return points outside the cell, inflating dedup waste and cost.
- **Density-aware subdivision** (Tier 3): start with 1 cell. Only subdivide cells whose response hits the 60-result page cap. Track the recursion depth (cap at e.g. 4 levels) to avoid pathological subdivision.
- Dedup against `place.id` across the whole run, persisted via `mapsSeenSessions`. After Tier 3, dedup against the user's full `extraction_results` history when "fresh results only" is on.

### Worker pool & errors

- Concurrency 3. Don't change without measuring quota impact.
- `Promise.allSettled` for the cell pool. One bad cell never aborts the run. Failed cells are counted in the run summary with their error code.
- Backoff: on `429` or `503`, exponential backoff with jitter, max 3 retries per cell. After that, mark the cell failed and move on.

### Cost meter (must reflect reality)

- USD→INR: read live (cached daily) or from a user-set override `USD_INR_OVERRIDE`. Never hardcode 84.
- Per-call cost: derived from the SKU tier of the field mask in use. Surface a per-tier line in the cost UI.
- Show **estimated** cost before the run starts (cells × pages × per-call). Show **actual** cost after, computed from request count.
- A `/api/maps/search` response includes `costInr.estimated` and `costInr.actual`. Persist both in `extractions`.

### Quotas & limits

- `MAX_GOOGLE_RESULTS = 500` and `MAX_GOOGLE_PAGES = 3` are hard caps. The frontend must clamp before sending. Don't raise these without explicit user request — they're a safety rail against a runaway query bankrupting someone's API account.
- `GOOGLE_PAGE_DELAY_MS = 2000` between pages of the same cell. Don't lower without measuring.

### Geocode cache

- TTL: 1 hour in memory today (`GEOCODE_CACHE_TTL_MS`). Move to SQLite-backed with a 30-day TTL (Tier 1). Key = lowercased trimmed address string.
- Always check cache before calling. Geocoding is rare but billable.

## Apollo.io — house rules

### Industry filter

The current code drops `industry` when both `name` and `industry` are provided (`if (industry && !name)`). This is wrong. Apollo's `mixed_people/search` accepts `organization_industry_tag_ids` (or the legacy `q_organization_industry_keywords`) **alongside** name. Pass both. Don't filter post-hoc client-side except as a final pass for additional refinement.

### Pagination

- `per_page` capped at 100 (Apollo's max). Page through with `page=N` until `pagination.total_entries` is reached or `MAX_APOLLO_RESULTS` is hit.
- One in-flight request at a time per user. Apollo rate limits are tight and per-key; a parallel pool will get you 429'd fast.
- Health check via `auth/health_check` before a real search to fail fast on bad keys.

### Cost / credits

- Apollo bills in **credits**, not dollars per call. Each people search consumes credits proportional to results returned (and certain enriched fields cost more).
- Surface a credit estimate before searching (rows × per-row credits) and an actual after. Pull the credit balance from `/api/v1/auth/health_check` when it's exposed.

### Field expansion

- Today we pull a fixed set of fields. If a future feature needs `email`, that's an enriched field — gate it behind a per-search toggle and show the credit delta.

## Spend ceiling

- Per-user daily INR ceiling configurable in settings, defaults to ₹100 if not set.
- Before each search starts, sum `extractions.costInr` for the user since 00:00 IST. If `current + estimated > ceiling`, refuse with a clear error (`code: 'SPEND_LIMIT'`). Surface a button to raise the ceiling.

## Things never to do

- Hardcode an FX rate.
- Hardcode a per-call price.
- Make an API call you don't bill the user for in the cost meter.
- Add a field to the mask without updating `services/cost.js`.
- Catch a quota / 429 and retry forever. Always with a cap.
- Log full API responses. Log counts and aggregates only.
