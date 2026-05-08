---
name: super-data-extractor
description: Self-hosted lead extractor. Search Google Maps + Apollo for leads, enrich websites with DNS-validated emails, detect tech stack. BYOK keys, no credits.
version: 3.2.0
homepage: https://github.com/maitpatni/super-data-extractor
license: MIT
mcp:
  command: npx
  args: ['-y', 'sde-mcp']
  env:
    SDE_BASE_URL: http://localhost:3000
    SDE_API_KEY: ''
tools:
  - sde_maps_search
  - sde_linkedin_search
  - sde_enrich
  - sde_email_validate
  - sde_bulk_maps_start
  - sde_job_status
  - sde_extractions_list
  - sde_extraction_get
  - sde_cost_estimate
---

# Super Data Extractor — Agent Skill

This skill gives an AI assistant (Claude Code, Cursor, Copilot, Continue.dev, etc.) the ability to drive a self-hosted Super Data Extractor instance via MCP. The user must have an SDE server running and an API key configured.

## When to use this skill

Reach for this skill when the user asks to:

- "Find me all the {business type} in {area}" → `sde_maps_search`
- "Get me the email for everyone at {company}" or "find decision-makers at X" → `sde_linkedin_search`
- "Enrich this list of websites with emails / tech stack / socials" → `sde_enrich`
- "Validate these emails" or "is this email deliverable?" → `sde_email_validate`
- "Run this query across these 50 zip codes" → `sde_bulk_maps_start` then `sde_job_status`
- "What did I extract last week?" → `sde_extractions_list` then `sde_extraction_get`
- "How much will it cost to pull 500 results?" → `sde_cost_estimate` first

Do **not** reach for this skill for: cold email sending, CRM updates, generating outreach copy. It's a data extractor, not an outreach tool.

## Setup the user must do once

```bash
# 1. Start a Super Data Extractor instance
git clone https://github.com/maitpatni/super-data-extractor && cd super-data-extractor
cp .env.example .env
# Edit .env: set MASTER_KEY (32-byte base64) and your Google + Apollo keys
docker compose up -d

# 2. Generate an API key for this skill
# Open http://localhost:3000, register, go to Settings → API keys → New
# Copy the sde_live_… key (shown once).

# 3. Tell your AI client about the skill
npx skills add maitpatni/super-data-extractor

# When prompted, set:
#   SDE_BASE_URL=http://localhost:3000
#   SDE_API_KEY=sde_live_...
```

## Cost discipline

Every Maps search costs the user real money at Google's published rates. Before running a search the agent should:

1. Call `sde_cost_estimate` with `expectedTextSearches = ceil(maxResults / 20)` — for grid searches multiply by 1.5–2.
2. State the estimated INR/USD to the user.
3. For anything > $0.50, get explicit user confirmation before invoking `sde_maps_search`.
4. Apollo searches cost credits, not USD; the response carries the credit-bucket info.

## Workflow patterns the agent should know

### Pattern A — local-business outbound list

```
1. sde_maps_search { searchTerm: "dentist", location: "Mumbai 400001", maxResults: 100, enrich: true }
2. Filter the returned rows where row.bestEmail is non-empty AND row.email.verdict !== 'invalid'.
3. Hand the filtered list to the user as CSV / markdown table.
```

### Pattern B — enrich a list the user already has

```
1. sde_enrich { rows: [{website: ...}, ...] }   // up to 1000 rows per call
2. Summarize: "X of Y rows enriched, top tech-stacks detected, role-inbox warning for Z."
```

### Pattern C — bulk run across many cities

```
1. sde_cost_estimate to get per-query cost; multiply by N queries.
2. Present the total to the user; ask for go/no-go.
3. sde_bulk_maps_start with the full queries array. Save the jobId.
4. Loop sde_job_status every ~30s until status === 'completed' or 'failed'.
5. sde_extraction_get { id: result.resultExtractionId } for the final rows.
```

### Pattern D — find decision-makers for a list of businesses

```
1. sde_maps_search to get businesses (with website fields).
2. For each row's company name, sde_linkedin_search { company: row.name, role: "founder|CEO|owner" }.
   (Run sequentially, not in parallel — Apollo is rate-limited per key.)
3. Merge profiles back onto rows.
```

## Output etiquette

- Default to **markdown tables** when showing < 25 rows.
- Default to **CSV blocks** for 25–500 rows.
- For > 500 rows or full extractions, save via `sde_extraction_get` and return a one-paragraph summary plus a "the full results are in extraction #N" pointer.
- Always include the cost line ("Spent ₹X / $Y across N API calls") when a `sde_maps_search` returns.

## Failure modes the agent must handle

- `CONFIG_REQUIRED` from a search → user hasn't put the relevant API key in their SDE settings. Tell them to open Settings and configure it; do **not** retry.
- `RATE_LIMIT` 429 → SDE itself rate-limited the user. Wait the requested number of seconds and retry once; if it fails again, stop.
- `SPEND_LIMIT` 402 → user has a daily INR ceiling and the run would exceed it. Surface the numbers; ask the user whether to raise the ceiling or shrink the request.
- `VALIDATION` 400 with the Apollo "no filter set" hint → the agent forgot to provide at least one of name/company/role/location/industry. Add one and retry.
- Network timeouts → just retry once with a small backoff, then surface the error.

## What's available

The skill registers an MCP server exposing these tools (see the manifest above for full schemas):

| Tool                   | When                              |
| ---------------------- | --------------------------------- |
| `sde_maps_search`      | Local business search             |
| `sde_linkedin_search`  | People search via Apollo          |
| `sde_enrich`           | CSV in → enriched rows out        |
| `sde_email_validate`   | DNS-only verification             |
| `sde_bulk_maps_start`  | "All dentists across N zip codes" |
| `sde_job_status`       | Poll a bulk job                   |
| `sde_extractions_list` | Browse history                    |
| `sde_extraction_get`   | Fetch one full extraction         |
| `sde_cost_estimate`    | Pre-flight ₹/$                    |

## License

MIT — see [LICENSE](https://github.com/maitpatni/super-data-extractor/blob/master/LICENSE).
