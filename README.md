<div align="center">

# Super Data Extractor

**Self-hosted, open-source lead extractor for Google Maps and Apollo.io.**
**500+ results per query. Automatic email enrichment. Bulk jobs. REST API. Webhooks.**
**Bring your own API keys; nothing leaves your server.**

[![CI](https://github.com/maitpatni/super-data-extractor/actions/workflows/ci.yml/badge.svg)](https://github.com/maitpatni/super-data-extractor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](#docker)
![Stars](https://img.shields.io/github/stars/maitpatni/super-data-extractor?style=social)

</div>

---

## Why this exists

Every "leads tool" out there is either a $200/month SaaS that owns your data, or a Chrome extension one ToS-update away from breaking. Super Data Extractor is a single Node.js binary you run yourself. It uses Google's official Places API (New) for businesses and Apollo.io's official API for people. You bring the API keys; the data is yours; the bill is yours.

What it does that paid alternatives don't:

- **500+ results per query** via density-aware grid search, beating Google's per-page 60-result cap **without overspending on cells that don't need to be subdivided**.
- **Automatic website enrichment** — when Apollo doesn't have an email, Super Data Extractor visits the business's site (`/`, `/contact`, `/about`, …), through an SSRF-safe fetcher, and pulls `mailto:`, free-text emails, phone numbers, and social handles.
- **Real cost meter** that mirrors Google's actual SKU pricing (Essentials / Pro / Enterprise) keyed off your field mask, with per-row USD/INR breakdown.
- **Bulk job mode** — "all dentists across 50 zip codes" runs as a persisted, resumable job with per-cell retry. Survives server restarts.
- **REST API** at `/api/v1/*` with API-key auth, plus **HMAC-signed webhooks** so n8n / Zapier / Make can drive searches and react to completions.
- **Spend analytics**: ₹/result, ₹/day, top categories. See where your money goes.
- **Safe by default**: SSRF-blocked outbound URL fetching, encrypted API keys at rest (AES-256-GCM), per-route rate limits, helmet headers, scoped CORS, hashed bearer tokens, password hashing with bcrypt.

## Quick start (Docker)

```bash
git clone https://github.com/maitpatni/super-data-extractor
cd super-data-extractor
cp .env.example .env

# Generate a 32-byte master key and put it in .env as MASTER_KEY=
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d
# Open http://localhost:3000 → register → drop your Google + Apollo API keys
```

## Quick start (local Node)

```bash
git clone https://github.com/maitpatni/super-data-extractor
cd super-data-extractor
cp .env.example .env       # set MASTER_KEY (see above)
npm install
npm start                  # http://localhost:3000
```

Requires **Node ≥ 18.17**.

## Bring your own keys

| Provider | Used for | Where to get it |
|---|---|---|
| Google Cloud → Places API (New) | Business search, geocoding, autocomplete | https://console.cloud.google.com → APIs & Services → Library → "Places API (New)" → Credentials |
| Apollo.io | People search ("LinkedIn-style") | https://app.apollo.io → Settings → API |

Both keys are stored encrypted in your local SQLite (`AES-256-GCM` keyed by your `MASTER_KEY`). They never leave the server except to call the two whitelisted hosts: `places.googleapis.com` and `api.apollo.io` (plus your own users' websites for enrichment, through an SSRF guard).

## Features

### Search

- **Maps**: keyword + location + radius + category, with filters (open now, min rating, price level, has phone/website/reviews).
- **People**: name + company + role + location + industry, all combinable, all server-side filtered (no more silently-dropped industry filter).
- **Live progress** via SSE, bound to your user ID. Two users on the same instance can't see each other's progress.

### Grid that doesn't waste money

- Starts with **one cell** covering the whole radius. Only **subdivides cells that hit Google's per-page cap**, up to 3 levels deep. On dense queries this can cut API calls by 30–60% vs. a blind N×N grid.
- Uses `locationRestriction` (a hard rectangle), never the soft `locationBias` — so dedup waste stays low.
- Per-cell errors are isolated. One failed cell is logged in the run summary; it never aborts a 500-result run.

### Enrichment that fills the gaps

When an Apollo lookup misses or a Maps result has only a website, Super Data Extractor:

- Honors `robots.txt`.
- Visits the homepage and `/contact` / `/about` family of paths.
- Extracts `mailto:`, free-text emails (with noise filters for `noreply@`, etc.), `tel:`, and Instagram / Facebook / X / LinkedIn / YouTube / TikTok handles.
- Routes every fetch through the SSRF guard (no probing localhost or `169.254.169.254`).
- Per-domain serialized + delayed; doesn't hammer anyone.

### Bulk jobs

```http
POST /api/jobs/bulk-maps
Authorization: Bearer <token>      # or X-Api-Key: <api_key>

{
  "queries": [
    { "searchTerm": "dentist", "location": "Mumbai 400001" },
    { "searchTerm": "dentist", "location": "Mumbai 400002" }
  ],
  "maxResultsPerQuery": 100,
  "enrich": true,
  "includeHistoryDedup": true
}
```

Returns `{ jobId }`. Poll `GET /api/jobs/:id`. Cancel with `POST /api/jobs/:id/cancel`. Jobs are persisted in SQLite and **resume automatically** after a server restart.

### Public REST API

Make an API key in **Settings → API keys**, then:

```bash
curl -X POST https://your-host/api/v1/maps/search \
  -H "X-Api-Key: sde_live_xxx" -H "Content-Type: application/json" \
  -d '{"searchTerm":"coffee shop","location":"Brooklyn, NY","maxResults":120,"enrich":true}'
```

Endpoints:

- `POST /api/v1/maps/search` — synchronous Maps search
- `POST /api/v1/maps/cost-estimate` — pre-flight cost
- `POST /api/v1/linkedin/search` — Apollo people search
- `POST /api/v1/jobs/bulk-maps` — kick off a bulk job
- `GET  /api/v1/jobs/:id` — job status
- `GET  /api/v1/extractions` / `GET /api/v1/extractions/:id` — list & fetch results
- `GET  /api/v1/me` — verify auth

Per-key rate limit: 60/minute (configurable).

### Webhooks

Register a webhook URL in **Settings → Webhooks**. We POST every event with a body of `{event, payload, deliveredAt}` and a signature header:

```http
X-SDE-Event: job.completed
X-SDE-Signature: sha256=<hex-hmac>
```

Verify with:

```js
const ok = crypto.createHmac('sha256', secret).update(rawBody).digest('hex') === sig;
```

Supported events: `job.completed`. (More on the way.)

### Spend analytics

`GET /api/analytics/spend?days=30` returns daily cost, results, runs, and top categories — the data behind the dashboard. Numbers come straight from your `extractions` table; no third party sees them.

## Architecture

```
super-data-extractor/
├── server.js              # ~130-line bootstrap
├── database.js            # SQLite (better-sqlite3) — schema, migrations, all queries
├── routes/                # HTTP routers (auth, maps, linkedin, history, settings, export, jobs, …)
├── services/              # External API clients + business logic (places, apollo, enrichment, jobs, webhooks, exports)
├── middleware/            # auth, rate-limit, errors, request-id
├── lib/                   # Pure helpers: config, crypto (AES-256-GCM), ssrf, cost (SKU-aware), grid, progress, cache, …
├── public/                # Vanilla JS frontend (no build step)
├── tests/                 # Vitest: cost, grid, ssrf, crypto, csv-injection, email-extract, auth integration
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/ci.yml
```

No build step on the frontend. No bundler. Open the file, read the code.

## Configuration

See [`.env.example`](.env.example) for the full list. The most important ones:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `MASTER_KEY` | _(required)_ | 32-byte base64/hex key used to encrypt API keys at rest |
| `ALLOWED_ORIGIN` | _(none)_ | Comma-separated CORS allowlist. Must be set in production. |
| `USD_TO_INR` | `84` | FX rate for the cost meter; override or it will lie to you |
| `DEFAULT_DAILY_INR_CEILING` | `0` (off) | Per-user daily INR limit; search refuses if estimate exceeds remaining headroom |
| `RL_*` | _(see file)_ | Rate-limit knobs |
| `ENRICHMENT_ENABLED` | `1` | Turn off the website scraper if you only want raw Google + Apollo |
| `SSRF_ALLOW_PRIVATE` | `0` | Dev-only escape hatch for private intranets — do **not** flip in prod |

If `MASTER_KEY` is missing, the server **refuses to start in production** (and warns loudly in dev). This is intentional.

## Security

- **SSRF**: every user-supplied URL goes through `lib/ssrf.js`, which DNS-resolves and rejects loopback / RFC1918 / link-local (incl. `169.254.169.254`) / ULA / CGNAT / multicast / non-`http(s)` / non-`80,443` ports. Redirects are followed manually and re-validated at every hop.
- **Cross-user isolation**: progress sessions are bound to `userId` and indexed by server-generated UUIDs. Trying to subscribe to someone else's session returns `403`.
- **API keys at rest**: AES-256-GCM with per-row IVs and auth tags. Existing plaintext keys are migrated on first start.
- **Bearer tokens**: stored hashed (SHA-256) in SQLite. A DB read does not grant impersonation.
- **CSV / XLSX injection**: every cell starting with `=`, `+`, `-`, `@`, or other dangerous chars is prefixed with `'` before export.
- **Rate limits**: login (5 / 15min / IP), register (3 / hour / IP), search (30 / hour / user), validate-key (60 / hour / user), v1 API (60 / min / key). All configurable.
- **CORS**: deny by default; opt-in via `ALLOWED_ORIGIN`.
- **helmet**: CSP (`'self'`-only scripts), HSTS in prod-with-HTTPS, frame-ancestors `'none'`.
- **No telemetry. No analytics pixels.** The only outbound destinations from the server are `places.googleapis.com`, `api.apollo.io`, and (with enrichment on) the websites your search results pointed to.

For a deeper rundown of policy and threat model, see [`.kiro/steering/security.md`](.kiro/steering/security.md).

## Tests

```bash
npm test          # one-shot
npm run test:watch
```

Suites: cost (SKU tiers, no doubled details), grid (rectangle math, density-aware subdivision), SSRF (every rejection class), crypto (encrypt/decrypt round-trip + ciphertext detection), CSV injection defang, email extraction, and an `auth integration` test exercising register → me → logout against the real Express app.

CI (GitHub Actions) runs lint + format check + tests on Node 18, 20, 22, plus a Docker build. PRs are blocked on red.

## Roadmap

Tier-by-tier in [`.kiro/steering/roadmap.md`](.kiro/steering/roadmap.md). Highlights of what's already in v2.0:

- ✅ Tier 1 — cost & correctness (no more doubled API calls, real SKU-aware meter, density-aware grid, per-cell error isolation, persisted geocode cache, "fresh results only" toggle, fixed Apollo industry filter)
- ✅ Tier 2 — security (SSRF guard, user-bound sessions, helmet, rate limits, AES-256-GCM key encryption, dotenv wired, exceljs replaces vulnerable xlsx, CSV/XLSX injection defang)
- ✅ Tier 3 — differentiators (email/contact enrichment, bulk jobs with resume-on-restart, public REST API, HMAC-signed webhooks, spend analytics)
- ✅ Tier 4 — DX (modular layout, Vitest, Docker + compose, ESLint + Prettier, GitHub Actions CI, schema_migrations system, structured logging via pino + pino-http with request IDs)

Open: scheduled saved searches with email diff, team workspaces with roles, persistent column mapping, argon2id rolling rehash.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

PRs welcome. Read [`.kiro/steering/conventions.md`](.kiro/steering/conventions.md) and the rest of the steering docs first — they describe the rules of the road (route shape, error handling, logging, testing, dependency policy).

If you're filing a bug:

1. Tell us your Node version, OS, and whether you're running via Docker or `npm start`.
2. Include the request ID from the response (every error response carries one).
3. If it's a security report, please email instead of opening a public issue.
