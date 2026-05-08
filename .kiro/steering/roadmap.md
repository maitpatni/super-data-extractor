# Roadmap

This is the **execution plan**, in priority order. Each tier should ship as a single PR (or a small handful of related PRs) with tests before moving to the next.

The North Star: be the cheapest, most accurate, most automatable self-hosted lead extractor. Every item below maps to one of those three.

## Tier 1 — Correctness & cost (biggest user ROI, ~1–2 days)

Goal: a 500-result run costs roughly half what it does today and never silently loses a cell.

- [ ] **Remove the redundant `fetchPlaceDetails` call.** The `searchText` response already has every field. Delete the per-result detail fetch in `processPlacesPage`. Verify that exported rows are unchanged. *Cuts Google bill ~50% on big runs.*
- [ ] **Switch grid cells to `locationRestriction`** (rectangle bounds), removing `locationBias`. Verify dedup waste drops on a known query.
- [ ] **Real cost meter:**
  - Move pricing into `services/cost.js`, keyed by SKU tier.
  - Read USD→INR from env (`USD_INR_OVERRIDE`) or a daily-cached live rate.
  - Show estimated and actual on every search; persist both in `extractions`.
- [ ] **Per-cell error isolation.** Replace `Promise.all` with `Promise.allSettled` in the worker pool. Capture failed cells in the run summary. One bad geocode never aborts a 500-result run.
- [ ] **Apollo industry fix.** Pass `industry` to Apollo even when `name` is set. Map to the correct field (`organization_industry_tag_ids` or keyword equivalent).
- [ ] **Persist geocode cache** in SQLite with 30-day TTL. New `geocode_cache` table.
- [ ] **"Fresh results only" toggle.** Optional dedup against the user's full `extraction_results` history (default off; preserves current behavior).

Acceptance: A test run of a known query (e.g. "dentist near Andheri, 5 km, max 200") returns the same row count as before, with a measurably lower API call count and a cost number that matches Google's billing console within 5%.

## Tier 2 — Security hardening (~1 day)

Goal: this app is safe to expose on the open internet.

- [ ] **`lib/ssrf.js`** — DNS resolve + RFC1918/loopback/metadata reject. Apply to `/api/check-url` and any future enrichment fetcher. Tests for each rejection class.
- [ ] **Bind progress + seen sessions to userId.** Server-generated UUIDs only. SSE endpoint enforces user match.
- [ ] **`helmet` + tightened CORS.** `ALLOWED_ORIGIN` env var; default deny cross-origin.
- [ ] **`express-rate-limit`** on auth + search + key-validate endpoints (limits in security.md).
- [ ] **Encrypt API keys at rest** with AES-256-GCM. `MASTER_KEY` from env. First-run migration re-encrypts existing rows. Server refuses to start if `MASTER_KEY` missing.
- [ ] **Wire up `dotenv`.** Read `PORT`, `MASTER_KEY`, `ALLOWED_ORIGIN`, `USD_INR_OVERRIDE`, rate-limit knobs. Add `.env.example`.
- [ ] **Replace `xlsx@0.18.5`** with `exceljs`. Migrate the export module. Bonus: better default styling.
- [ ] **CSV/XLSX injection defang** — prefix `=`, `+`, `-`, `@` cells with `'`.

Acceptance: `npm audit` shows zero high/critical. Manual test: `/api/check-url` rejects `http://169.254.169.254` and `http://localhost:22`. Two users can't see each other's progress streams.

## Tier 3 — Best-in-class features (~3–5 days)

Goal: leave paid competitors behind.

- [ ] **Email/contact enrichment fallback.** For Maps results with a website but no Apollo hit, server-side polite scraper hits `/`, `/contact`, `/about`. Extracts `mailto:` links, `tel:`, plain-text emails, social handles. Respects `robots.txt`. Goes through the SSRF guard. Per-domain concurrency = 1, per-domain rate limit, queue with backoff. **Differentiator #1.**
- [ ] **Bulk job mode.** "All dentists across 50 zip codes" persisted as a job in SQLite. Resumable across restarts. Per-cell retry with state. Status/cancel API.
- [ ] **Public REST API at `/api/v1/...`** with API-key auth (separate from session bearer). Documented endpoints for: start search, get status, fetch results, list history. Enables n8n / Zapier / Make.
- [ ] **Webhooks.** Per-user webhook URL fired on job complete. Signed with HMAC-SHA256.
- [ ] **Scheduled saved searches.** Daily/weekly cadence. Email a CSV of the **diff** (new places only since last run).
- [ ] **Density-aware grid.** Start with 1 cell; subdivide only when a cell hits the 60-result cap. Cap recursion depth at 4. Cuts API calls 30–60% on dense queries vs. blind N×N.
- [ ] **Per-search enrichment toggles.** Tech detection (Wappalyzer-style), email-pattern guessing for known company domains, Instagram/Facebook handle extraction.
- [ ] **WebSocket progress** (replaces SSE, optional). Server-side `AbortController` wired to client-initiated cancel.
- [ ] **Team workspaces.** Multiple users share API keys + history under one workspace, with roles (`owner`, `member`, `viewer`). Surface the existing `activity_logs` audit trail.
- [ ] **Spend analytics dashboard.** ₹/result, ₹/day, top categories, sourced from `extractions` + `activity_logs`.
- [ ] **Persistent column mapping** per user for exports (which fields, in which order, with which header labels).

Acceptance: A scheduled saved search runs nightly and emails a CSV diff. A bulk job survives a server restart. A 500-result query costs ≥ 30% less than the same blind-grid query did at end of Tier 1.

## Tier 4 — DX / Ops (parallelizable with Tier 3)

Goal: contributors can land changes confidently.

- [ ] **Split `server.js`** into the layout in `structure.md`. One PR per top-level directory; behavior-preserving.
- [ ] **`.env.example`, `Dockerfile`, `docker-compose.yml`, `ecosystem.config.js`** (PM2).
- [ ] **Vitest** with integration tests for: auth flow, grid math, dedupe, cost calc, SSRF guard. Smoke test for export.
- [ ] **ESLint + Prettier + lint-staged + Husky** pre-commit.
- [ ] **Migration system** (`umzug` or hand-rolled with `schema_migrations`). Backfill an initial migration matching the current schema.
- [ ] **GitHub Actions CI:** install → lint → test → `npm audit` → build. PRs blocked on red.
- [ ] **`bcryptjs` → `argon2id`** with rolling rehash on next login.
- [ ] **`pino` + `pino-http`** structured logging with request IDs.

Acceptance: a fresh clone is `npm install && npm test && docker compose up` to a running app, and `gh pr create` opens a PR that runs CI.

## Cross-cutting policies during execution

- **Don't combine tiers in one PR.** Each PR cites a checkbox above.
- **Don't introduce a new dependency to fix a one-liner.**
- **Every PR must keep the existing public API stable** (URL paths, request bodies, response shapes) unless it's explicitly a breaking change called out in the PR title with `!`.
- **Every cost-affecting change** (new API call, new field in mask, new retry strategy) updates `services/cost.js` and `cost-and-apis.md` in the same PR.
- **Every security-relevant change** updates `security.md` in the same PR.

## Definition of "best at what it does"

Once Tier 1, Tier 2, Tier 3 (at least: enrichment fallback, bulk jobs, REST API, density-aware grid), and a viable subset of Tier 4 (tests, Docker, CI) are landed, this project is, on the merits:

- The cheapest per result among self-hosted Maps + Apollo extractors.
- The only one that fills email gaps via website fallback in the same run.
- Safe to expose on a hostname.
- Automatable by anyone with an HTTP client.
- Maintainable by anyone who can read JavaScript.

That's the target.
