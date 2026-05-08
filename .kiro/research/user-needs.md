# User-needs research — May 2026

Source: subagent stage `user_needs_research`, mining Reddit (r/sales, r/coldemail, r/SaaS, r/gtmengineering, r/selfhosted), G2/Capterra/AppSumo/Trustpilot/PissedConsumer, HN, Indie Hackers, Skool, Substack.

## Top 10 unmet needs (with attributed quotes)

1. **Waterfall enrichment without credit burn.** "Apollo as the raw mine and the verifier as the refinery" — u/suddatsh389, r/coldemail. 78% match rate via waterfall vs 52–61% single-provider per Agent Finder test.
2. **Real-time email verification at point-of-use.** "Apollo essentially mirrors LinkedIn's outdated, poorly verified garbage data" — u/Anon, r/coldemail.
3. **No-credit / flat-rate pricing.** "I used to use Clay, but it was way too expensive. So we built our own. A $120 Clay list now only costs us $8–12" — u/nqdl7kd, r/gtmengineering.
4. **Maps → website → verified email** end-to-end pipeline. "There's a thread on Reddit r/SEO called 'Failing to Find Google Maps Scraper (that does everything).' The comments are basically a support group." — Scrap.io, 2026.
5. **LinkedIn data without ban risk.** Apollo has manual LinkedIn steps; full automation = ban risk. Users want rate-limited, session-rotation paths.
6. **AI-powered ICP from natural language.** Exa AI Websets validated the demand: "describe your ideal customer in plain English."
7. **Job-change signals without UserGems' $30k+ price.** "Came across UserGems, but after a call the quote came back at $30k+. That's hard to justify" — u/noobCoder00101, r/SaaS.
8. **Tech-stack filtering.** "Apollo's filters won't give you the precision you need [for tech stack]" — Alex Berman.
9. **Export without lock-in.** "Clay tables are stored on Clay's servers. If you pause your subscription, your enrichment tables and workflow history are inaccessible" — Dench.
10. **Multi-source scraping in one tool.** Skool build log: "Maps + Apollo + Hunter + Snov + Apify + Serper" — six tools to do one job.

## Top 10 deal-breaker bugs

1. Email bounce 15–35% (IconPolls Apollo review).
2. Credits charged for failed lookups (Clay, ~20–30% waste at scale).
3. Account suspensions mid-campaign.
4. No credit rollover.
5. Phone numbers mostly wrong despite 8-credit cost.
6. Stale job-title data (changes within 6–12 months still showing old role).
7. Auto-renewal billing surprises.
8. Weak EMEA/APAC coverage.
9. Maps scrapers break on every Google UI change ("weeks-to-months cadence" — Thunderbit).
10. Slow customer support.

## Most-asked integrations

HubSpot (#1) > Salesforce > Google Sheets > Instantly/Smartlead > n8n/Make/Zapier > Clay > Lemlist > Slack > Airtable/Notion > OpenAI/Claude.

## Pricing pain themes

- Per-credit feels like ripoff at scale.
- Credits for failed lookups.
- No rollover.
- Hidden enrichment fees (phone = 8× email).
- Mid-year price hikes on annual plans.
- Opaque enterprise quotes.
- Apollo's real cost 60–80% higher than listed.

## Self-hosted demand: STRONG and GROWING

- DenchClaw (YC S24) — open source local Clay alternative.
- Beton — AGPLv3 self-hostable Clay alternative.
- YALC / BlackMagic AI — "AI-native GTM operating system, CLI-first."
- n8n — 181k stars, the infrastructure backbone.
- Firecrawl — self-hostable scraping infra.
- Reddit r/gtmengineering has _multiple_ "I built my own" threads.

## AI in lead gen 2026: working vs hype

| Working | Mid | Hype |
|---|---|---|
| AI-personalized email from real enrichment data (4% → 12% reply lift) | Intent data | Fully autonomous AI SDR |
| AI for waterfall orchestration | LLM-driven dedup | "AI agents" auto-sending |
| AI for CRM hygiene (dedup, normalization) | Generic AI personalization (now spam signal) | |
| AI lead scoring from structured data | | |

## Compliance themes

GDPR Legitimate Interest documentation, DSAR / right-to-delete, DNC list scrubbing, California DELETE Act (Aug 2026), suppression-list management, configurable data retention.

## Strategic implication for Super Data Extractor

There is **no well-known self-hosted tool** that does Maps + Apollo + email enrichment + verification + tech detection in one pipeline with BYOK keys. That's the gap.
