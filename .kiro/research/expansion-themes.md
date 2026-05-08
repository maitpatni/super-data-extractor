# Super Data Extractor v3–v5 Technical Roadmap

> North Star: Most-starred self-hosted lead extractor on GitHub.
> Bias: ship fast, no custom infra, no LinkedIn scraping, no paid-only deps.

---

## Theme 1: New Data Sources

| Idea | Complexity | Impact | External deps | Risks | Stargazer hook |
|------|-----------|--------|---------------|-------|----------------|
| **OpenStreetMap / Overpass API** — Query `[amenity=X][name~"keyword"]` within bbox. Fields: name, addr, phone, website, opening_hours, cuisine/specialty tags. Free, no key. Add as `source: "osm"` alongside Google results. | S | High | None (free public API, fair-use rate limit) | Data quality varies by region; no ratings/reviews; may duplicate Google results (dedup by name+coords). | "Free unlimited local business discovery with zero API cost — the only extractor that doesn't lock you into Google's pricing." |
| **Yelp Fusion API** — `/v3/businesses/search` with term+location+radius. Adds: Yelp rating, review count, price tier, categories, transactions (delivery/pickup). BYOK (free tier: 500 calls/day). | M | Med | Yelp Fusion API key (free tier available) | 500/day free cap is tight for bulk; US/EU-centric; TOS prohibits storing data >24h without refresh. | "Cross-reference Google ratings with Yelp scores to find businesses with review gaps — prime outreach targets." |
| **Bing Maps Local Search** — `GET /REST/v1/LocalSearch?query=X&userLocation=lat,lng`. Adds: Bing-specific phone/address that Google may miss. BYOK (free tier: 125K txn/yr). | S | Low | Bing Maps API key (generous free tier) | Low marginal value over Google; mostly redundant data; adds complexity for small coverage gain. | "Triangulate across Google + Bing + OSM for the most complete local business dataset possible." |
| **Crunchbase Basic API** — `/v4/entities/organizations?name=X`. Adds: funding rounds, employee count, founded year, categories, short description. BYOK ($29/mo basic). | L | Med | Crunchbase Basic API key (paid, $29/mo) | Paid dependency hurts "free" narrative; only useful for funded companies; rate limits tight. | "Instantly see which businesses on your list just raised funding — warm outreach timing." |
| **GitHub User/Org Search** — `GET /search/users?q=type:org+location:X` + org repos/members. Adds: org name, website, public repos, member count, tech signals. Free with PAT (5K req/hr). | M | Med | GitHub PAT (free, generous limits) | Only relevant for devtool ICPs; niche audience; org ≠ business in many cases. | "Find every dev agency and SaaS company in a city by their GitHub footprint — perfect for devtool sellers." |
| **ProductHunt** — Scrape `/posts?topic=X` or use unofficial GraphQL. Adds: product name, tagline, maker profiles, upvote count, launch date. No official API. | M | Med | None (public pages, scrape) | No official API; scraping may break; only early-stage SaaS; small dataset. | "Discover freshly-launched SaaS products before they hit CrunchBase — sell to founders on day one." |
| **Trustpilot / Google Reviews mining** — Google Places API already returns `reviews[]` with text. Parse review text for ICP signals (keywords like "small business", "enterprise", service mentions). | S | Med | None (data already in Places response) | Review text is noisy; NLP without LLM is keyword-matching only; privacy concerns with reviewer data. | "Mine review text for buying signals — find businesses whose customers complain about problems you solve." |
| **Yandex Maps** — `GET /1.x/?text=X&ll=lng,lat&type=biz`. Adds: Russia/CIS coverage, phone, hours, categories. Free tier: 1K/day. | M | Low | Yandex Maps API key (free tier) | Tiny addressable market for English-speaking stargazers; Cyrillic data handling; geopolitical risk. | "The only self-hosted extractor with Russia/CIS coverage via Yandex Maps." |
| **Brave Search API (SERP)** — `GET /res/v1/web/search?q=X+near+Y`. Scrape local pack from results. Adds: residual discovery of businesses not in Maps. BYOK (free: 2K/mo). | M | Med | Brave Search API key (free tier: 2K queries/mo) | Parsing SERP results is fragile; low volume on free tier; duplicates Maps data mostly. | "Catch businesses that don't have a Google listing but show up in web search — the long tail nobody else gets." |
| **Wellfound (AngelList)** — Scrape `/role/X/location/Y` job listings. Adds: company name, role, location, salary range, company stage. No API. | L | Low | None (scrape, fragile) | No official API; heavy anti-bot; job listings ≠ leads; legal gray area. Reject — too fragile. | N/A — **REJECTED: too fragile, no API, anti-bot measures.** |

---

## Theme 2: Enrichment Signals

| Idea | Complexity | Impact | External deps | Risks | Stargazer hook |
|------|-----------|--------|---------------|-------|----------------|
| **Tech stack detection (Wappalyzer-style)** — During website enrichment, fingerprint: `X-Powered-By` header, `<script src>` patterns (Shopify, WordPress, HubSpot, Intercom, Stripe, GA4), `<meta name="generator">`. Store as `techStack: ["shopify","hubspot"]`. Ship 50 fingerprints. | M | High | None (runs during existing enrichment fetch) | False positives from CDN-hosted scripts; can't detect server-side-only tech; maintenance of fingerprint DB. | "Filter leads by tech stack — find every Shopify store or HubSpot user in your target area without paying BuiltWith." |
| **Email validation (local DNS)** — For each extracted email: MX lookup, SPF record check, catch-all detection (RCPT TO probe on port 25 is risky — skip it, just check MX+SPF+DMARC). Score: `{hasMx, hasSpf, hasDmarc, isCatchAll: null, isRoleAddress}`. Use Node `dns.resolveMx()`. | S | High | None (Node `dns` module) | Can't verify deliverability without SMTP probe; catch-all detection unreliable without sending; adds latency per email. | "Every exported email comes with a confidence score — stop bouncing and protect your sender reputation." |
| **Phone validation (libphonenumber-js)** — Parse with `libphonenumber-js`: validate format, extract country, determine type (mobile/landline/voip). Add `phoneValid`, `phoneType`, `phoneCountry` fields. | S | Med | `libphonenumber-js` (npm, free, 200KB) | Only validates format, not reachability; carrier lookup needs paid API (skip it). | "Automatically flag invalid phone numbers and identify mobile vs. landline before you dial." |
| **Domain age + WHOIS via RDAP** — Query `https://rdap.org/domain/{domain}`. Extract: registration date, registrar, expiry. Add `domainAgeDays`, `registrar` fields. Free, no key. | S | Med | None (RDAP is free public protocol) | RDAP coverage incomplete for some TLDs (.io, some ccTLDs); rate limits vary by registrar. | "Filter out fly-by-night businesses — domain age instantly tells you who's established vs. brand new." |
| **Hiring signals** — During Apollo enrichment, check `organization.current_job_openings` field (already in Apollo response). Also: for domains, fetch `{domain}/careers` or `jobs.lever.co/{company}` during enrichment. Flag `isHiring: true`, `openRolesCount`. | M | High | None (Apollo data + public career pages) | Career page scraping is fragile; Apollo field may be stale; adds enrichment time. | "Companies that are hiring are companies that are spending — the #1 intent signal for outbound." |
| **Social proof signals** — From Apollo response: `organization.estimated_num_employees`, `organization.linkedin_url`. From website enrichment: extract follower counts from embedded social widgets. Add `employeeCount`, `linkedinFollowers`. | S | Med | None (already in Apollo + website HTML) | Employee count from Apollo is estimated; social widgets vary wildly in markup. | "Instantly segment by company size — filter for the 10-50 employee sweet spot." |
| **Local SEO signals** — From Google Places response (already returned): `photos[].length`, `reviews[].length`, `regularOpeningHours` completeness, `websiteUri` presence. Score 0-100 for "GBP completeness". | S | Med | None (data already in Places response) | Only useful for agencies selling SEO services; niche signal. | "Find businesses with incomplete Google profiles — they're the ones who need your marketing agency." |
| **Funding/news signals** — If Crunchbase key present, enrich domain → org → last funding round. Otherwise, skip. Add `lastFundingDate`, `lastFundingAmount`, `totalFunding`. | M | Med | Crunchbase API key (optional, paid) | Paid dependency; only works for funded companies; adds API cost. | "Automatically tag recently-funded companies — they have budget and urgency." |


---

## Theme 3: AI/LLM Features (BYOK — OpenAI / Anthropic / Ollama / Groq)

Architecture: Abstract behind a `lib/llm.js` provider interface. Config: `LLM_PROVIDER=openai|anthropic|ollama|groq`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (for Ollama: `http://localhost:11434/v1`). All features degrade gracefully if no LLM configured.

| Idea | Complexity | Impact | External deps | Risks | Stargazer hook |
|------|-----------|--------|---------------|-------|----------------|
| **NL-query → search params** — User types "dentists in Mumbai with >4.5 stars doing Invisalign". LLM extracts: `{keyword:"dentist invisalign", location:"Mumbai", minRating:4.5}`. Single structured-output call. Fallback: manual form. | M | High | LLM API key OR local Ollama | Hallucinated params; latency on local models; prompt injection from user input (sanitize output). | "Just describe what you're looking for in plain English — AI translates it into the perfect search." |
| **Per-lead personalized outreach line** — For each result, send `{businessName, website snippet, Apollo headline}` → LLM returns 1-sentence personalized opener. Batch 10 at a time. Store in `outreachLine` field. | M | High | LLM API key OR local Ollama | Cost at scale (1 call per lead × 500 leads); quality varies; users may not trust AI copy. Mitigate: opt-in, batch, cache. | "Every lead comes with a ready-to-paste personalized first line — skip the 'I noticed your company...' templates." |
| **Lead scoring against ICP** — User provides ICP description (text). LLM scores each lead 0-100 with 1-sentence rationale. Batch 20 leads per call. Add `icpScore`, `icpRationale` fields. | M | High | LLM API key OR local Ollama | Subjective scoring; inconsistent across calls; expensive for large datasets. Mitigate: cache scores, allow re-score. | "Upload your ICP description and every lead gets an AI fit score — sort by likelihood to close." |
| **Auto-categorization / clustering** — Send batch of 50 lead names+categories → LLM returns cluster labels (e.g., "medical", "retail", "professional services"). Add `cluster` field. | S | Med | LLM API key OR local Ollama | Inconsistent labels across batches; limited value if Google category already exists. | "AI automatically groups your 500 results into meaningful segments — no manual tagging." |
| **LLM-driven dedup** — For pairs flagged by fuzzy name match (Levenshtein < 3), ask LLM: "Are these the same business? {A} vs {B}". Binary yes/no. Only called for ambiguous pairs. | S | Med | LLM API key OR local Ollama | Overkill for obvious dupes; adds cost; Levenshtein alone handles 90% of cases. | "AI resolves the tricky duplicates that string matching misses — 'Dr. Smith DDS' vs 'Smith Dental Clinic'." |
| **'Find similar' lookalike search** — User uploads CSV of existing customers. LLM extracts common traits → generates search params. Run searches automatically. | L | High | LLM API key OR local Ollama | Requires good customer data; multi-step workflow; complex UX. | "Upload your best customers, AI finds more like them — lookalike audiences without Facebook." |

---

## Theme 4: Workflow Integrations

| Idea | Complexity | Impact | External deps | Risks | Stargazer hook |
|------|-----------|--------|---------------|-------|----------------|
| **HubSpot CRM push** — `POST /crm/v3/objects/contacts` + `/companies`. Map fields: name→firstname/lastname, email, phone, company→company association. BYOK (free HubSpot CRM + private app token). | M | High | HubSpot private app token (free CRM tier) | Field mapping complexity; rate limits (100/10s); duplicate handling (search before create). | "One click pushes your leads straight into HubSpot — no CSV import, no manual entry." |
| **Pipedrive CRM push** — `POST /v1/persons` + `/organizations`. Similar field mapping. BYOK API token. | S | Med | Pipedrive API token | Simpler API than HubSpot; smaller user base. | "Direct Pipedrive sync — leads flow from extraction to your pipeline in seconds." |
| **Google Sheets live sync** — OAuth2 flow or service account. Append rows to a named sheet. Use `googleapis` npm package. | L | High | Google OAuth2 credentials or service account JSON | OAuth flow is complex for self-hosted; token refresh; sheet size limits (10M cells). | "Results auto-append to your Google Sheet — share with your team in real-time." |
| **Slack/Discord notifications** — On job complete, POST to webhook URL. Payload: job summary, result count, link to download. Already have webhook infra — just add Slack/Discord formatters. | S | High | Slack incoming webhook URL or Discord webhook URL (free) | Minimal risk; trivial implementation on top of existing webhook system. | "Get pinged in Slack the moment your bulk extraction finishes — never miss a batch." |
| **Instantly / Smartlead / Lemlist push** — Each has a REST API for adding leads to campaigns. `POST /api/v1/lead/add` (Instantly), similar for others. Map: email, firstName, lastName, companyName, custom vars. | M | High | Respective API keys (all have free tiers or trials) | Each tool has different API shape; maintenance burden of 3+ integrations; API changes. | "Extract leads and push them directly into your cold email sequence — zero manual steps." |
| **n8n native node** — Publish an npm package `n8n-nodes-super-data-extractor` that wraps our REST API. Trigger node (webhook) + action node (start search, get results). | M | High | None (wraps our existing API) | n8n node publishing process; version maintenance; testing across n8n versions. | "First-class n8n integration — build any automation workflow on top of your lead data." |
| **Browser extension** — Chrome MV3 extension. Right-click on Google Maps listing → "Send to Super Data Extractor". Calls our REST API `/api/v1/leads` POST. | L | Med | None (calls our API) | Chrome Web Store review process; MV3 limitations; maintaining separate codebase. | "Right-click any business on Google Maps and it lands in your extraction database instantly." |
| **Notion database push** — `POST /v1/pages` with database_id. Map fields to Notion properties. BYOK integration token. | M | Med | Notion integration token (free) | Notion API is slow; property type mapping is fiddly; page limits. | "Push leads directly into your Notion CRM — perfect for solo founders who live in Notion." |


---

## Theme 5: Product/UX Expansions

| Idea | Complexity | Impact | External deps | Risks | Stargazer hook |
|------|-----------|--------|---------------|-------|----------------|
| **Enrichment-only mode (CSV in → enriched CSV out)** — New endpoint `POST /api/v1/enrich` accepts CSV upload. For each row with a website/domain, run enrichment pipeline (email, phone, tech stack, socials). Return enriched CSV. No search step. | M | Critical | None | Large CSVs need streaming; memory pressure; user expects fast turnaround but enrichment is slow. | "Already have a list? Upload any CSV and get it enriched with emails, phones, and tech stack — no search needed." |
| **Diff mode ('only new since last run')** — Store hash of `placeId+source` per extraction. On re-run of same query, flag results as `new`, `existing`, or `gone`. Filter to show only new. | M | High | None | Hash collisions unlikely but possible; "same query" definition is fuzzy (radius changes?). | "Run the same search weekly and only see what's new — never waste time on leads you already contacted." |
| **Maps→Apollo cross-pollination** — After Maps extraction, auto-query Apollo for each business domain: find decision-makers (CEO, CMO, etc.). Add `contacts[]` array to each result. | M | Critical | Apollo API key (already required) | Multiplies Apollo API calls (1 per business × 500 = 500 calls); cost concern; rate limits. Mitigate: opt-in toggle, batch. | "For every business found on Maps, automatically find the decision-maker's email via Apollo — complete lead in one step." |
| **Saved ICPs (named segment+filter combos)** — CRUD for saved filter presets: name, keyword, location, radius, minRating, categories, enrichment toggles. Store in `saved_icps` SQLite table. | S | Med | None | Simple CRUD; low risk; high UX value for repeat users. | "Save your ideal customer profile once, run it anytime — one-click extraction for your best segments." |
| **Coverage map (heatmap)** — Frontend: render a simple SVG/canvas heatmap showing lat/lng density of all past extractions. Data from `extraction_results` table. | M | Med | None (frontend-only visualization) | Performance with large datasets; map rendering without Google Maps JS API (use Leaflet + OSM tiles, free). | "See exactly where you've already extracted — spot gaps in your coverage at a glance." |
| **Audit log UI** — Surface existing `activity_logs` table in frontend. Filterable by user, action, date range. Paginated table. | S | Med | None (data already exists) | Simple frontend work; low risk. | "Full audit trail of every action — know exactly who extracted what and when." |
| **In-app cost dashboard** — Frontend page showing: ₹/result over time, daily spend, top queries by cost, projected monthly spend. Data from existing `extractions` table cost fields. | S | High | None (data already exists) | Requires cost tracking to be accurate (already implemented in v2). | "Real-time cost dashboard — see exactly what you're spending on Google and Apollo per lead." |
| **Workspace/teams with RBAC** — `workspaces` table, `workspace_members` with roles (owner/member/viewer). Shared API keys, shared history. Invite by email. | L | Med | None | Significant schema change; auth complexity; migration path for existing single-user installs. | "Share your extraction setup with your team — role-based access so interns can't burn your API budget." |
| **'Find similar to' (lookalike)** — User selects 5-10 results → system extracts common traits (category, location pattern, rating range, size) → generates new search params → runs search. Works without LLM (rule-based). | M | Med | None | Rule-based similarity is crude; may just replicate the original search; LLM version (Theme 3) is better. | "Select your best leads and find more like them — pattern-matching without AI." |

---

## Theme 6: Self-Host Moat — Features Paid SaaS Can't Match

| Idea | Complexity | Impact | External deps | Risks | Stargazer hook |
|------|-----------|--------|---------------|-------|----------------|
| **Plugin/hook system** — Define lifecycle hooks: `beforeSearch`, `afterSearch`, `beforeEnrich`, `afterEnrich`, `beforeExport`. Plugins are JS files in `./plugins/` dir. Each exports `{name, hooks}`. Loaded at startup. Example plugin: "add custom column from internal CRM lookup". | M | Critical | None | Plugin security (sandboxing?); API stability promise; documentation burden. Mitigate: no sandboxing (trust your plugins), semver the hook interface. | "Add any custom enrichment or transformation without forking — drop a JS file in /plugins and restart." |
| **Multi-key load balancing** — `api_keys` table supports multiple Google/Apollo keys per user. Round-robin with per-key daily cost tracking. Auto-skip exhausted keys. UI shows per-key spend. | M | High | None | Key rotation logic complexity; race conditions on concurrent requests; cost tracking accuracy. | "Spread your API calls across multiple keys — 10 free-tier keys = 10x the quota, automatically balanced." |
| **Custom outbound proxy** — `OUTBOUND_PROXY` env var (HTTP/SOCKS5). All external requests (Google, Apollo, enrichment) route through it. Support per-source proxy config. Use `undici` ProxyAgent. | S | High | None (user provides their own proxy) | Proxy failures need graceful fallback; SOCKS5 support adds complexity; debugging is harder. | "Route all requests through your own proxy — residential IPs, corporate VPN, or Tor. Your traffic, your rules." |
| **Local-only LLM (Ollama)** — LLM provider interface with Ollama backend. All AI features work with `mistral:7b` or `llama3:8b` running locally. Zero data leaves the server. | S | Critical | Ollama installed locally (free, open-source) | Local models are slower and less capable; 7B models struggle with complex extraction; RAM requirements (8GB+). | "Every AI feature works with a local model — your data never leaves your server, not even to OpenAI." |
| **GDPR right-to-delete + data export** — Single endpoint `DELETE /api/v1/me` wipes all user data. `GET /api/v1/me/export` returns full JSON dump of all user data (extractions, settings, logs). | S | High | None | Must cascade delete across all tables; export can be large; need to handle gracefully. | "One-button GDPR compliance — export or delete all your data instantly. Try asking Apollo for that." |
| **On-prem auditability (signed request log)** — Every outbound API call logged with: timestamp, endpoint, response status, cost, HMAC signature (using MASTER_KEY). Tamper-evident audit trail. | M | Med | None | Storage growth (mitigate: rotation/TTL); HMAC computation overhead (negligible); log format design. | "Cryptographically signed audit log of every API call — prove to compliance exactly what data left your server." |


---

## Theme 7: Quality Bar Features

| Idea | Complexity | Impact | External deps | Risks | Stargazer hook |
|------|-----------|--------|---------------|-------|----------------|
| **Smart radius auto-tuning** — Start with small radius (1km). If results < target/cells, expand to 2km, then 5km. Stop when target met or max radius hit. Saves API calls on sparse areas, gets density on dense ones. | M | High | None | May overshoot on dense areas; interaction with grid subdivision logic; needs careful testing. | "Never guess the right radius again — the system automatically expands until it finds enough results." |
| **Email canonicalization** — Lowercase all emails. Gmail: remove dots, strip `+suffix`. Configurable toggle for plus-removal. Dedup after canonicalization. | S | Med | None | Plus-addressing is sometimes intentional; aggressive canonicalization may merge distinct contacts. Toggle mitigates. | "Automatic email dedup catches 'john.doe@gmail.com' and 'johndoe@gmail.com' as the same person." |
| **Phone canonicalization (libphonenumber-js)** — Parse all phones to E.164 format. Dedup by canonical number. Add `phoneFormatted` (national) and `phoneE164` fields. | S | Med | `libphonenumber-js` (npm, free) | Some numbers unparseable (missing country code); adds small dep. | "Every phone number normalized to international format — no more '+1 (555) 123-4567' vs '5551234567' duplicates." |
| **Address normalization + cross-source dedup** — Normalize: trim, title-case, expand abbreviations (St→Street, Ave→Avenue). Dedup across sources by normalized address + name similarity. | M | High | None | Address parsing is hard; international formats vary wildly; false positive merges. | "Results from Google + OSM + Yelp automatically merged — one clean row per business, not three." |
| **Multi-language Maps queries** — Accept `language` param. Pass to Google Places `languageCode` field. Store original + English name. | S | Med | None (Google Places supports it natively) | Translation quality varies; dedup harder across languages; UI needs to display both. | "Search in any language — find businesses by their local name, get results in your preferred language." |
| **Contact verification scoreboard** — Composite score (0-1) per contact: email has MX (0.3) + not role address (0.2) + phone valid (0.2) + website live (0.2) + Apollo match (0.1). Display as confidence badge. | S | High | None (combines existing signals) | Score is heuristic, not deliverability guarantee; users may over-trust it. Clear labeling mitigates. | "Every contact gets a confidence score — sort by quality and only reach out to verified leads." |

---

## Theme 8: GitHub Stars Optimization

| Idea | Complexity | Impact | External deps | Risks | Stargazer hook |
|------|-----------|--------|---------------|-------|----------------|
| **Killer demo GIFs (15s loops)** — Record 3 GIFs: (1) search→results in 15s, (2) bulk job completing, (3) CSV enrichment. Embed in README above the fold. Use ScreenToGif or asciinema. | S | Critical | None | GIFs get stale as UI changes; large file size (optimize with gifsicle). | "A 15-second GIF is worth 1000 words in a README — instant understanding of what this does." |
| **Comparison table vs competitors** — Markdown table in README: Super Data Extractor vs Apollo vs ZoomInfo vs Outscraper vs PhantomBuster. Columns: self-hosted, price, sources, enrichment, API, bulk. | S | Critical | None | Must stay accurate and fair; competitors may change; could attract negative attention. | "One glance at the comparison table and developers know this is the best free alternative." |
| **Show HN launch** — Write a compelling Show HN post. Timing: Tuesday/Wednesday 9am ET. Title: "Show HN: Self-hosted lead extractor (Google Maps + Apollo + email enrichment)". | S | Critical | None | One shot; if it flops, can't easily re-launch; need the product to be polished first. | "A successful Show HN can deliver 500+ stars in 48 hours — the single highest-leverage growth event." |
| **Reddit r/selfhosted post** — Post with screenshots, docker-compose one-liner, feature list. Follow community rules (no spam). | S | High | None | Must provide genuine value; community is skeptical of self-promotion; need existing engagement. | "r/selfhosted is 500K+ subscribers who actively star self-hosted tools they like." |
| **YouTube walkthrough (5-10 min)** — Screen recording: install → configure → first search → export → API usage. Publish on YouTube, embed in README. | M | High | None | Production quality takes time; gets outdated; need to re-record on major UI changes. | "Video tutorials dramatically lower the barrier to first use — people star what they successfully try." |
| **'Awesome lead-gen' list inclusion** — Find/create an awesome-list for lead generation tools. Submit PR to add Super Data Extractor. | S | Med | None | List maintainers may reject; need to meet quality bar; one-time effort. | "Awesome-list inclusion drives steady passive discovery from developers browsing curated lists." |
| **First-class TypeScript + Python clients** — `super-data-extractor-ts` and `super-data-extractor-py` packages wrapping the REST API. Auto-generated from OpenAPI spec. | M | High | None | Maintenance burden of 2 extra packages; version sync; testing across languages. | "Official SDK in your language means you can integrate in 5 lines of code — lowers friction to star + use." |
| **Plugin marketplace seed** — Ship 3-5 example plugins: (1) Slack notifier, (2) Google Sheets append, (3) tech-stack enricher, (4) email validator, (5) custom CSV column. Document in `/plugins/README.md`. | M | High | None | Plugins need stable hook API first (Theme 6); maintenance of examples. | "A plugin ecosystem signals maturity and extensibility — developers star platforms, not just tools." |

---

## Top 12 Picks by Impact-Per-Week

Ranked by `(impact on stars × breadth of appeal) / implementation weeks`. Biased toward shipping.

| # | Pick | Theme | Complexity | Est. Weeks | Why This First |
|---|------|-------|-----------|-----------|----------------|
| 1 | **Killer demo GIFs + comparison table** | 8 | S | 0.5 | Zero code. Immediate README upgrade. Every visitor converts better. Do this before any feature work. |
| 2 | **Enrichment-only mode (CSV in → enriched out)** | 5 | M | 1 | Doubles the addressable audience — people who already have lists but need enrichment. Massive differentiator vs. competitors that only do search. |
| 3 | **Plugin/hook system** | 6 | M | 1.5 | Creates a platform, not just a tool. Every plugin is a reason to star. Unlocks community contributions without PRs to core. |
| 4 | **OpenStreetMap / Overpass integration** | 1 | S | 1 | Free data source with zero API cost. "Unlimited free local business search" is a headline feature. Proves multi-source architecture. |
| 5 | **Tech stack detection (Wappalyzer-style)** | 2 | M | 1 | No external deps, runs on existing enrichment infra. "Filter by tech stack" is a feature people pay $300/mo for on BuiltWith. |
| 6 | **Email validation (local DNS)** | 2 | S | 0.5 | Trivial to implement with Node `dns` module. Adds confidence scores to every email. Directly improves data quality perception. |
| 7 | **NL-query → search params (LLM)** | 3 | M | 1 | The "wow" demo moment. Works with Ollama (free local). Makes the tool feel 10x more modern than any competitor. |
| 8 | **Multi-key load balancing** | 6 | M | 1 | Unique self-host advantage. "Use 5 free-tier keys for 5x quota" is a concrete money-saving pitch that no SaaS can offer. |
| 9 | **Slack/Discord notifications** | 4 | S | 0.3 | Trivial (webhook POST with formatting). Immediate workflow value. Shows the tool is automation-ready. |
| 10 | **Diff mode ('only new since last run')** | 5 | M | 1 | Turns one-time extraction into ongoing monitoring. Retention feature — users come back weekly. |
| 11 | **Show HN launch** | 8 | S | 0.5 | Time it after items 1-6 are shipped. Single highest-leverage growth event. Needs polished product to succeed. |
| 12 | **Maps→Apollo cross-pollination** | 5 | M | 1 | "Find the business AND the decision-maker in one click" is the complete lead gen workflow. No competitor does this in a self-hosted tool. |

### Sequencing Rationale

**Week 1-2 (v3.0-alpha):** Items 1, 4, 6, 9 — quick wins that make the product look and feel dramatically better with minimal code.

**Week 3-5 (v3.0):** Items 2, 3, 5 — the three features that create a platform (enrichment-only, plugins, tech detection). Ship together as the v3 launch.

**Week 6-8 (v3.1):** Items 7, 8, 10 — AI features + multi-key + diff mode. The "power user" release.

**Week 9-10 (v4.0 launch):** Items 11, 12 — Show HN timing after the product is polished. Maps→Apollo cross-pollination is the headline feature for the launch post.

### What NOT to build (and why)

- **Wellfound/AngelList scraping** — No API, heavy anti-bot, fragile. Rejected.
- **Yandex Maps** — Tiny English-speaking audience. Low ROI.
- **Salesforce integration** — XL complexity, enterprise-only audience, doesn't drive stars.
- **Workspace/teams RBAC** — Important but doesn't drive stars. Defer to v5.
- **Browser extension** — Separate codebase, Chrome Store review, maintenance burden. Defer to v5.
- **Full Zapier app** — Requires partner program approval, ongoing maintenance. Webhooks + n8n node cover 90% of use cases.
