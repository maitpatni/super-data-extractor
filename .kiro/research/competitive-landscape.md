# Competitive landscape — May 2026

Source: subagent stage `competitive_landscape`. Star counts and prices verified via web fetch on the date above.

## OSS competitors (the actual stars race)

| Project | Stars | Lang | Niche | Why it gets stars |
|---|---|---|---|---|
| `gosom/google-maps-scraper` | 3,900 ⭐ | Go | Maps (CLI + Web UI + REST + K8s + AI Agent Skills) | Docker one-liner, clean technical README, 66 releases, sponsor ecosystem, active 2026 maintenance, MCP / AI Agent Skill support |
| `omkarcloud/google-maps-scraper` | 2,600 ⭐ | Python (Botasaurus) | Maps desktop app (Win/Mac/Linux) | Sales-playbook README, $28 lifetime Pro, "1000+ customers" social proof, WhatsApp support, 90-day refund |
| `omkarcloud/botasaurus` | 3,700 ⭐ | Python | Scraping framework | Powers the Maps scraper above; broader audience |
| Misc smaller | 50–500 each | mixed | Chrome extensions, Apollo bypass, AI scrapers | Niche-specific; thin docs |

## Commercial competitors (what Reddit complains about)

| Tool | Pricing | Killer feature | Recurring complaints |
|---|---|---|---|
| Apollo.io | $0–$119/seat/mo | 275M-contact DB + sequencer | 65% data accuracy, 15–35% bounce, opaque billing, monthly credits |
| ZoomInfo | Custom quote (≥$15k/yr) | Enterprise breadth | Pricing opacity, intent-data quality "utter nonsense" per practitioners |
| Outscraper | $2.85–$14/1k results + base | Maps + email, no-code | "Deceptive billing" (AppSumo), "painfully slow", credits don't roll |
| Apify | $49/mo + $1.40–$7/1k | Marketplace, anti-blocking | Credit costs escalate; community actor quality varies |
| Scrap.io | $35–$499/mo | Pre-indexed instant exports | Maps-only (no people), credits expire monthly |
| Phantombuster | $69–$439/mo | 130+ Phantoms across platforms | "Too expensive", confusing execution-hour pricing, 120-result Maps cap, account-ban risk |
| Hunter.io | $34–$244/mo | Domain-search + verifier | No phones; per-credit cost 3–5× listed |
| RocketReach | $33–$207/mo | 700M profiles + phones | Phone numbers often wrong |
| Snov.io | $30–$277/mo | All-in-one budget | Mid-tier accuracy |
| Findymail | $49/1k credits | Charges only for verified | LinkedIn-first workflow only |
| BuiltWith | $295–$995/mo | Tech stack DB | Expensive, not self-hostable |
| Wappalyzer | $250+/mo (paid plans) | Tech detection | Free extension limited; OSS engine but data is paid |

## Things to steal

| Feature | Source |
|---|---|
| **AI Agent Skills / MCP** quick-add | gosom — `npx skills add gosom/google-maps-scraper` is the 2025–2026 growth vector |
| **Docker one-liner quick start** | gosom — single `docker run` to results |
| **Sponsor ecosystem on README** | gosom — 10+ sponsors, sustainable funding without paywall |
| **Sales-playbook README** | omkarcloud — teach users _how_ to make money with the data |
| **Comparison page** | Most tools fail to do this clearly; we should win the SEO + decision-time |
| **AI-ranked best email** | omkarcloud paid enrichment |

## Our structural wins

| Their pain | Our structural fix |
|---|---|
| "Billing confusing / costs escalate" | BYOK = user pays Google/Apollo direct, no markup |
| "Data stays in their cloud" | Local SQLite, exportable forever |
| "Execution-time / credit caps" | Unlimited; only API limits apply |
| "120-result Maps cap" | Density-aware grid bypasses it |
| "No self-host option" | Self-hosted is the core identity |
| "Account suspensions mid-campaign" | Official Places API; no scraping bans |
| "Per-seat tax" | One deployment, unlimited users |
| "Need 5 tools in a stack" | Maps + Apollo + email + tech in one pipeline |
