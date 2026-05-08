# Product

## What it is

Super Data Extractor is a self-hosted web app that turns "find me all the {business type} in {area}" and "find {role} at {company}" into clean, exportable lead lists.

Two data sources today:
- **Google Maps / Places API (New)** — businesses with name, phone, website, rating, address, hours, place_id.
- **Apollo.io** — people with name, headline, company, title, location, LinkedIn URL.

One shape on the way out: deduped rows + Excel/CSV export, plus history.

## Who it's for

- Sales SDRs building outbound lists
- Marketers building local-business audiences
- Recruiters finding candidates
- Solo founders who don't want to pay $200+/month for SaaS scrapers

The user is technical enough to bring their own Google Places + Apollo API keys and run `node server.js`.

## Operating model

- **Self-hosted, single-binary feel.** `node server.js` and you're up. SQLite on disk. No external services beyond Google + Apollo.
- **Per-user accounts** (multi-user single-instance). Each user supplies their own API keys. Keys never leave the server except to `places.googleapis.com` and `api.apollo.io`.
- **No telemetry. No third-party trackers. No vendor lock-in on the data** — it's the user's CSV/XLSX.

## North-star differentiators (what "best at what it does" means here)

1. **Cheaper per result than competitors.** Every Google API call must be necessary. The cost meter must reflect reality, not a hardcoded number.
2. **More results per query than the 60-cap.** Grid search done right (`locationRestriction`, density-aware subdivision, dedup against full history).
3. **More complete records.** When Apollo doesn't have an email, fall back to polite website scraping for `mailto:`/contact pages. This is the moat.
4. **Trustworthy.** No SSRF, no cross-user leakage, no plaintext API keys. A self-hosted tool people exposing to the internet must be safe by default.
5. **Automatable.** API + webhooks so n8n/Zapier/Make can drive it. Scheduled saved searches with diff-only delivery.
6. **Resumable bulk jobs.** "All dentists across 50 zip codes" should not lose progress when the box reboots.

## Out of scope (for now)

- Direct LinkedIn scraping (ToS risk; we proxy through Apollo).
- Mobile native apps.
- Hosted multi-tenant SaaS billing (the project stays self-host-first; SaaS is a possible future, not the default).
- AI-generated outreach copy (we produce data; sequencing tools handle outreach).

## Success signals

- Can pull 500 unique businesses from one query for under the cost ceiling configured in cost settings.
- A `/api/check-url` or grid-cell failure never aborts the run.
- Two users on the same instance cannot see each other's progress, history, or keys.
- Time from `git clone` → first export ≤ 5 minutes.
