# v3 roadmap — make this the most-starred self-hosted lead extractor on GitHub

This is the synthesis of four research streams (adversarial code review, competitive landscape, user-needs research, technical expansion brainstorm). Stage transcripts are preserved under `.kiro/research/`.

## v3.0 thesis

**Super Data Extractor is the only self-hosted, BYOK tool that turns a single keyword + city into a deliverable, deduped contact list — Google Maps + Apollo + DNS-validated email + tech stack — with no per-credit billing, no cloud lock-in, and no scraper that breaks every Google UI change.**

This thesis is anchored in three cross-stage signals:

1. _"Self-hosted itch"_ is a validated, growing market — DenchClaw (YC S24), Beton, YALC, n8n's 181k stars all aimed at it (user-needs-research).
2. The two top OSS competitors (gosom 3.9k, omkarcloud 2.6k) cover Maps **only**. Nobody owns Maps + Apollo + email + tech in a single self-hosted pipeline (competitive_landscape).
3. The 2026 user complaint pattern is overwhelmingly about credits, deliverability, and lock-in — all things our architecture structurally avoids (user-needs-research).

## Where we beat each competitor

| Tool | Their pitch | Their fail | Our wedge |
|---|---|---|---|
| Apollo | 275M-contact DB + sequencer | 65% data accuracy, 15–35% bounce, opaque billing, monthly credits | We use them as one data source via BYOK; we don't repackage their data, and our DNS-validated email layer fixes the bounce-rate problem |
| ZoomInfo | Enterprise breadth | Custom-quote opacity, unlistenable to small teams | We're $0/seat, fully transparent |
| Apify | Marketplace of actors | Per-result + platform fee, cloud-only, "credits escalate quickly" | Self-hosted, no markup over Google's published rates |
| Outscraper | Maps + email enrichment | "Painfully slow", "deceptive billing", cloud lock-in | Same combo done locally with grid + density-aware subdivision; user owns the SQLite |
| Hunter | Email finder + verifier | Email only, no Maps, credits per failed lookup | DNS-only validation has zero per-lookup cost; we cover the Maps→email leg natively |
| Phantombuster | Multi-platform Phantoms | 120-result Maps cap, account-ban risk, "execution-time" pricing | Official APIs only (no bans), no caps beyond Google's |
| gosom (3.9k OSS) | Best-in-class Go scraper | Maps-only, no people, no enrichment | We add Apollo + email validation + tech detection in the same pipeline |
| omkarcloud (2.6k OSS) | Sales-playbook desktop app | $28 lifetime locks features behind a paywall, no API server | We're 100% free + a real public REST API + webhooks |

## Critical fixes (Tier 5.0) — must land before any v3 push

These came from `adversarial_review`. All are in this commit batch:

- [x] SSRF DNS-pinning to defeat rebinding (`lib/ssrf.js`) — undici Agent forces connect to the pre-validated IP.
- [x] IPv6 normalization: zone IDs, brackets, hex IPv4-mapped (`::ffff:7f00:1`) all blocked via Node `BlockList` + custom mapped-V4 extractor.
- [x] Apollo `searchProfiles` requires ≥1 non-empty filter (`services/apollo.js`) — prevents full-DB scrape that would burn credits and abuse the upstream.
- [x] Login timing oracle fixed — dummy bcrypt against a random hash on the missing-user path (`routes/auth.js`).
- [x] Cost meter: geocode billed at PRO tier (matches the actual field mask) (`lib/cost.js`).
- [x] `MASTER_KEY` rotation works — dropped the cached key in `lib/crypto.js`.
- [x] Bulk job resume tracks `completedIndices` so restarts don't double-charge (`services/jobs.js`).
- [x] Density-aware grid `capped` semantics — subdivide when `nextPageToken` was still pending at `MAX_PAGES_PER_CELL` (`services/places.js`).
- [x] Mid-run spend ceiling abort, not just pre-flight (`services/places.js` + `routes/maps.js`).
- [x] Apollo 429 handling with Retry-After + exponential backoff (`services/apollo.js`).

## Tier 5 — the unfair-advantage tier (in flight in this commit)

Theme: features competitors can't easily match because they're not self-hosted, BYOK, or open.

- [x] **Enrichment-only endpoint** `POST /api/v1/enrich` — CSV/JSON of websites in → emails + tech stack + socials out. Doubles addressable audience (anyone with an existing list, not just fresh searchers). Source: user-needs #1, technical-expansion top-12. **(S, H impact)**
- [x] **DNS-based email validation** (`lib/email-validate.js`, `POST /api/v1/email/validate`) — MX/SPF/DMARC, role-inbox, free-mail, disposable, typo correction. Zero per-lookup cost. **(S, H impact)** Source: user-needs #2 + #4.
- [x] **Wappalyzer-style tech detection** (`lib/tech-detect.js`) — runs on the homepage we already fetch, ~60 fingerprints across CMS / framework / analytics / payments / hosting. Fully local, no Wappalyzer API. **(S, M impact)** Source: user-needs #8 + technical-expansion theme 2.
- [ ] **Multi-key load-balancing** for Google + Apollo — round-robin with per-key cost tracking. Critical at scale. **(M, H)** Source: technical-expansion theme 6.
- [ ] **Plugin/hook system** — `plugins/*.js` with declared lifecycle hooks (`onResult`, `onEnrich`, `onExport`). Enables a plugin marketplace without forking. **(L, H)** Source: technical-expansion theme 6.
- [ ] **OpenStreetMap** as a fallback Maps source — Overpass API, free, unlimited. Massive cost cut for non-business-info queries. **(M, H)** Source: technical-expansion theme 1.
- [ ] **AI Agent Skill / MCP integration** (`npx skills add ...`) — gosom proved this drives stars in 2026. **(S, H)** Source: competitive_landscape gosom case study.

Exit criteria for v3.0 ship: enrichment-only endpoint runs end-to-end, multi-key + OSM + plugin scaffolding done, MCP skill published.

## Tier 6 — workflow stickiness

Theme: native CRM / email-tool integrations so the data has somewhere to go without a stitch-tool.

- [ ] **HubSpot push** — first-class. Most-mentioned CRM across the research. **(M, H)**
- [ ] **Slack / Discord notifications** on job completion + scheduled-search diff. **(S, M)**
- [ ] **Google Sheets live sync** — append rows on each run. The "universal poor-man's CRM". **(M, H)**
- [ ] **Lemlist / Smartlead / Instantly** push targets — append directly to a sequence list. **(M, H)**
- [ ] **n8n native node** + sample workflows (we have webhooks; ship a node so users find us via the n8n UI). **(M, H)** Source: user-needs #3 + #10.
- [ ] **Suppression / DNC list ingest** — upload `.csv`, exclude from all future searches. **(S, H)** Source: user-needs trust/safety section.

Exit criteria: a user can take "search → export → push to HubSpot" in two clicks, and a CSV upload of a do-not-contact list automatically excludes those domains forever.

## Tier 7 — the AI lever (BYOK + local-model)

Theme: AI features done right — strictly grounded in real data, BYOK against OpenAI/Anthropic/Ollama. No autonomous-SDR meme.

- [ ] **Natural-language → search params** ("dentists in Mumbai with > 4.5 doing invisalign" → `category=dentist`, `location=Mumbai`, `filters.minRating=4.5`, post-filter on Apollo headline). **(S, H)**
- [ ] **AI lead scoring vs operator-supplied ICP** description. Deterministic (high impact, low risk). **(M, H)**
- [ ] **Per-lead personalized opener** generated from website + Apollo headline. Strictly grounded in fetched content. **(M, H)** Source: user-needs AI section "what's working".
- [ ] **Local Ollama support** — every AI feature ships with an Ollama URL alternative so paranoid orgs can run end-to-end on-prem. **(S, H)**
- [ ] **AI-driven cross-source dedup** — "these two records are the same business" using LLM tie-breaks. **(M, M)**

Exit criteria: every AI feature works against `OLLAMA_BASE_URL` with zero outbound to OpenAI/Anthropic.

## The "first 1000 stars" launch plan

1. **Hero demo GIF** (15s loop, in README): a single CLI / curl call against `POST /api/v1/enrich` with 5 websites in, 5 enriched rows out (emails, validated, tech stack visible). One frame, one feature, one moment of "oh".
2. **README headline** — three candidates; pick #1:
   - **"Self-hosted lead extractor. Google Maps + Apollo + DNS-validated email + tech stack. Bring your own keys. No credits."**
   - "The self-hosted Clay alternative for Maps + Apollo lead gen"
   - "Maps → website → verified email — in one self-hosted Docker container"
3. **Show HN draft** (200 words):
   > Title: _Show HN: Super Data Extractor — self-hosted lead extractor (Maps + Apollo + email enrichment), MIT_
   >
   > I got tired of stitching Apify + Hunter + a CSV verifier every time a friend asked me to find "all dentists in Mumbai with verified emails." So I built one tool that does all of it locally.
   >
   > Self-hosted Node.js + SQLite. You bring your own Google Places + Apollo keys (so the data and the bill are yours, no markup). Density-aware grid bypasses Google's 60-result cap. After scraping, it visits each business's site through an SSRF-guarded fetcher and pulls `mailto:` + free-text emails, validates them via DNS (MX/SPF/DMARC, role-inbox, disposable, typo correction), and detects the tech stack (Wappalyzer-style, ~60 fingerprints, no external API). Public REST API + HMAC-signed webhooks for n8n / Make / Zapier.
   >
   > Notable: zero high-or-critical npm audit, AES-256-GCM at rest for API keys, helmet+CSP, undici Agent that DNS-pins outbound fetches to defeat rebinding (the demo at `superextractor.broodle.in` was an SSRF risk before this fix).
   >
   > Roadmap: HubSpot push, OSM fallback, Ollama-backed lead scoring. Open to PRs.
4. **r/selfhosted post**: lead with the GIF + a one-liner ("free alternative to a $200/mo SaaS, runs on a $5 VPS"). Link to the Docker one-liner.
5. **Awesome-list submissions**: `awesome-selfhosted`, `awesome-business-tools`, `awesome-ai-agents` (for the MCP skill once shipped), `awesome-go` (mention via comparison page).
6. **Comparison page** (`docs/comparison.md`): the matrix from `competitive_landscape` rendered as a single GitHub-flavored markdown table.
7. **The wow demo** (90s YouTube): "I had a CSV of 50 dentist websites. I ran one curl. I got 50 verified emails + tech stack + IG handles. The whole thing took 38 seconds and cost $0."

## The single feature to ship next (post-Tier-5.0)

**Multi-key Google + Apollo load balancing.** This is the highest-impact unshipped feature because:

- It removes the most common ceiling (one user, one key, one billing account) without changing the BYOK story.
- It maps cleanly to the existing settings table (one row → many).
- It's a feature **no SaaS competitor can offer** by definition (they own the keys).
- Implementation is pure Node — no new dependencies, no new external services.

**File-level plan:**

- New `api_keys_external` table (per-user, per-provider, with cost-bucket counters).
- `lib/key-pool.js` — round-robin selector with per-key dailyInr counters and cool-off on 429.
- `services/places.js` and `services/apollo.js` accept a `keyPool` object instead of a single string.
- Settings UI: list existing keys, add/remove, see per-key spend.
- Acceptance: 3 keys configured, 100-result run, traffic distributed roughly 33/33/33 with per-key cost visible in `/api/analytics/spend?byKey=1`.
- Commit title: `feat: multi-key load balancing for Google Places + Apollo with per-key cost tracking`.

## Anti-roadmap — things we will not do

1. **Direct LinkedIn scraping.** TOS, ban risk, and the user-needs research shows the pain point is real but the consequences are worse. Use Apollo as a bounded alias.
2. **Per-seat SaaS pricing of any kind.** Kills our positioning; user-needs research shows pricing is the #1 churn driver across every competitor.
3. **A bundled CRM.** HubSpot/Pipedrive own this. We push data into them, we don't replace them.
4. **AI agents that auto-send email.** Deliverability suicide and brand risk; AI-section research shows fatigue is real.
5. **Custom anti-bot / proxy rotation.** Google Places API is official. Adding scraping mode invites ban-risk that contradicts our "no scraping bans" pitch.
6. **Yandex / Naver / Wellfound / AngelList.** Either tiny audience, no API, or anti-bot fragility (rejected in technical-expansion).
7. **Browser extension.** Separate codebase burden, doesn't drive stars in this niche (only one OSS competitor in our space ships a successful one).
8. **A hosted SaaS edition before the OSS hits 5k stars.** Premature monetization, dilutes the "self-hosted-first" identity.
9. **Switching to TypeScript or a frontend framework.** Vanilla JS auditability is a feature; user-needs research showed "trust the source" is real for self-hosted.
10. **A DSL for queries.** "Natural language → params" via LLM beats a custom DSL.

## Cross-cutting policies (continued from v2)

- Every cost-affecting change updates `lib/cost.js` and `cost-and-apis.md` in the same PR.
- Every security-relevant change updates `security.md` in the same PR.
- One concern per commit. PR titles use `feat:`/`fix:`/`refactor:`/`security:` prefixes.
- Don't introduce a new dependency to fix a one-liner.
- Every new external destination requires the SSRF guard and an entry in the operator-visible egress list.

## Definition of "best at what it does"

When the next 30 days have shipped:

- Tier 5 (multi-key, plugins, OSM, MCP skill) is in `main`.
- The README is rewritten with the demo GIF, comparison table, and AI-Agent-Skill quick-start.
- The Show HN + r/selfhosted launch is done.
- The OSS Maps-extraction comparison page lives at `docs/comparison.md`.
- 1k stars is in the rear-view; 5k is plausible within 90 days based on gosom's growth curve.

That's the target.
