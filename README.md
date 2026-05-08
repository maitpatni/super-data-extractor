<div align="center">

# Super Data Extractor

**Self-hosted lead extractor. Google Maps + Apollo + DNS-validated email + tech stack.**
**Bring your own keys. No credits. No cloud lock-in.**

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
- **DNS-based email validation** — every extracted email is checked for MX/SPF/DMARC, role-inbox, free-mail, disposable provider, and common typos. Zero per-lookup cost, runs locally, no third-party verifier needed.
- **Wappalyzer-style tech detection** — for every business with a website, we report the CMS, framework, ecommerce platform, analytics, payments, and CDN they use. ~60 fingerprints, no external API.
- **Enrichment-only mode** — `POST /api/v1/enrich` accepts a CSV/JSON list of websites and returns enriched rows (emails + validation + tech + socials). Perfect for "I already have a list, just add the missing data."
- **Real cost meter** that mirrors Google's actual SKU pricing (Essentials / Pro / Enterprise) keyed off your field mask, with per-row USD/INR breakdown.
- **Multi-key load balancing** — register multiple Google or Apollo keys, traffic round-robins across them with per-key daily INR ceilings and automatic 429 cooldown. Per-key spend visible in `/api/analytics/spend?byKey=1`. _A structural moat no SaaS can offer because they own the keys._
- **Bulk job mode** — "all dentists across 50 zip codes" runs as a persisted, resumable job. Restarts skip already-completed queries; you never double-pay.
- **REST API** at `/api/v1/*` with API-key auth, plus **HMAC-signed webhooks** so n8n / Zapier / Make can drive searches and react to completions.
- **Spend analytics**: ₹/result, ₹/day, top categories. See where your money goes.
- **Safe by default**: SSRF guard with **DNS-pinned outbound fetches** (no rebinding bypass), encrypted API keys at rest (AES-256-GCM), per-route rate limits, helmet headers, scoped CORS, hashed bearer tokens, password hashing with bcrypt + dummy-hash on missing-user paths.

## How it compares

| Feature | **Super Data Extractor** | gosom (3.9k ⭐) | omkarcloud (2.6k ⭐) | Apify | Outscraper | Phantombuster | Apollo SaaS |
|---|---|---|---|---|---|---|---|
| Self-hosted | ✅ Docker one-liner | ✅ | ✅ desktop | ❌ cloud | ❌ cloud | ❌ cloud | ❌ cloud |
| BYOK (own API keys) | ✅ | ❌ scrapes | ❌ scrapes | ❌ | ❌ | ❌ | N/A |
| Maps + people in one pipeline | ✅ | ❌ Maps only | ❌ Maps only | separate actors | partial | separate phantoms | ❌ people only |
| Email validation (DNS) | ✅ built-in | ❌ | paid add-on | extra cost | extra cost | extra credits | partial |
| Tech-stack detection | ✅ built-in | ❌ | ❌ | extra actor | ❌ | ❌ | ❌ |
| Bulk jobs with resume | ✅ | partial | ❌ | ✅ | ✅ | ✅ | N/A |
| Public REST API + webhooks | ✅ | ✅ | paid ($16/mo) | ✅ | ✅ | ✅ | ✅ |
| 120-result Maps cap | bypassed | bypassed | bypassed | depends | bypassed | ❌ 120 cap | N/A |
| Per-result fee | $0 (your Google bill) | $0 | $0 | $1.40+/1k | $2.85+/1k | $0.42+/exec-min | $0.10+/credit |
| Account-ban risk | none (official API) | scraper risk | scraper risk | none | none | yes (LinkedIn) | none |
| Data ownership | local SQLite | local | local | cloud | cloud | cloud | cloud |
| License | MIT | MIT | freemium | commercial | commercial | commercial | commercial |

## Use it from Claude / Cursor / Copilot (MCP)

Super Data Extractor ships an [MCP](https://modelcontextprotocol.io) server so Claude Desktop, Claude Code, Cursor, Continue.dev, GitHub Copilot's MCP host, and any other MCP-aware AI client can drive it directly. Nine tools — `sde_maps_search`, `sde_linkedin_search`, `sde_enrich`, `sde_email_validate`, `sde_bulk_maps_start`, `sde_job_status`, `sde_extractions_list`, `sde_extraction_get`, `sde_cost_estimate`.

```bash
# 1. Run an SDE instance and grab a public API key from Settings → API keys.
# 2. Register the MCP server with your client:
claude mcp add super-data-extractor \
  -e SDE_BASE_URL=http://localhost:3000 \
  -e SDE_API_KEY=sde_live_xxx \
  -- npx -y sde-mcp
```

Or as an [Agent Skill](https://github.com/anthropics/agent-skills) (one-line install for clients that support it):

```bash
npx skills add maitpatni/super-data-extractor
```

After that, ask the assistant in plain English:

> "Find me 100 dentists in Mumbai 400001 with a website and a phone number, enrich their contact emails, and give me a CSV."

It calls `sde_cost_estimate` → asks you to confirm spend → `sde_maps_search` with enrichment → filters out invalid emails → returns the CSV. Detailed setup and per-tool docs in [`mcp/README.md`](mcp/README.md); the agent playbook (when to use which tool, cost discipline, failure modes) is in [`skills/super-data-extractor/SKILL.md`](skills/super-data-extractor/SKILL.md).

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

**Enrichment-only** — already have a list of websites? Skip the search:

```bash
curl -X POST https://your-host/api/v1/enrich \
  -H "X-Api-Key: sde_live_xxx" -H "Content-Type: application/json" \
  -d '{"rows":[{"website":"https://acme.example"},{"domain":"foo.example"}]}'
```

Returns each row enriched with `emails` + `emailsScored` (verdict + confidence) + `bestEmail` + `phones` + `socials` + `tech` (CMS/framework/analytics/payments/CDN).

**Validate emails** without enrichment — pure DNS, zero per-lookup cost:

```bash
curl -X POST https://your-host/api/v1/email/validate \
  -H "X-Api-Key: sde_live_xxx" -H "Content-Type: application/json" \
  -d '{"emails":["hello@acme.com","info@example.com","ceo@gmail.com"]}'
```

Endpoints:

- `POST /api/v1/maps/search` — synchronous Maps search
- `POST /api/v1/maps/cost-estimate` — pre-flight cost
- `POST /api/v1/linkedin/search` — Apollo people search (requires ≥1 filter; refuses unbounded scrapes)
- `POST /api/v1/enrich` — CSV/JSON of websites in → enriched rows out
- `POST /api/v1/email/validate` — single-email or batch DNS validation
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
