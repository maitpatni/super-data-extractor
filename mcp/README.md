# Super Data Extractor — MCP server

Drive your self-hosted Super Data Extractor instance from any AI assistant that speaks the [Model Context Protocol](https://modelcontextprotocol.io) — Claude Desktop, Claude Code, Cursor, Continue.dev, GitHub Copilot's MCP host, Aider, etc.

## What it gives the agent

Nine tools that map 1:1 to the SDE public REST API:

| Tool | What it does |
|---|---|
| `sde_maps_search` | Google Maps lead search with optional website enrichment |
| `sde_linkedin_search` | Apollo people search (≥1 filter required) |
| `sde_enrich` | CSV/JSON of websites in → emails + tech stack + socials out |
| `sde_email_validate` | DNS-only validation (MX/SPF/DMARC, role/free/disposable, typo) |
| `sde_bulk_maps_start` | Persisted, resumable bulk Maps job |
| `sde_job_status` | Poll a bulk job |
| `sde_extractions_list` | Browse the user's extraction history |
| `sde_extraction_get` | Fetch a full extraction by id |
| `sde_cost_estimate` | Pre-flight ₹/$ before spending |

## Install

You need:
1. A running SDE instance (`docker compose up -d` or `npm start`)
2. A public API key from **Settings → API keys → New** (copy it once — it's hashed at rest)

### Claude Desktop / Claude Code

```bash
claude mcp add super-data-extractor \
  -e SDE_BASE_URL=http://localhost:3000 \
  -e SDE_API_KEY=sde_live_xxx \
  -- npx -y sde-mcp
```

Or edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) /
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "super-data-extractor": {
      "command": "npx",
      "args": ["-y", "sde-mcp"],
      "env": {
        "SDE_BASE_URL": "http://localhost:3000",
        "SDE_API_KEY": "sde_live_xxx"
      }
    }
  }
}
```

### Cursor

`Settings → MCP → Add server`:
- Name: `super-data-extractor`
- Command: `npx`
- Args: `-y sde-mcp`
- Env: `SDE_BASE_URL=http://localhost:3000`, `SDE_API_KEY=sde_live_xxx`

### Continue.dev / Aider / generic stdio MCP host

Equivalent JSON config — `command: npx`, `args: ["-y", "sde-mcp"]`, env as above.

### From a clone instead of npm

```bash
git clone https://github.com/maitpatni/super-data-extractor
cd super-data-extractor
npm install
# Then point the MCP client at: command "node", args ["./bin/sde-mcp"]
```

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `SDE_BASE_URL` | `http://localhost:3000` | Your SDE server's base URL |
| `SDE_API_KEY` | _required_ | A `sde_live_…` key from Settings → API keys |
| `SDE_TIMEOUT_MS` | `60000` | Per-call HTTP timeout |

## How the agent should use this

See [`skills/super-data-extractor/SKILL.md`](../skills/super-data-extractor/SKILL.md) for the full agent playbook (when to reach for each tool, cost discipline, failure modes, output etiquette).

The TL;DR:

- Big spends → `sde_cost_estimate` first, surface the number, get user go-ahead.
- Apollo → ≥1 of name/company/role/location/industry. Otherwise the API refuses (it would otherwise return all of Apollo, which is a credit-burn vector).
- Long Maps runs → `sde_bulk_maps_start` and poll, don't block on a single sync call.
- After enrichment, filter on `verdict !== 'invalid'` before handing emails to the user.

## Troubleshooting

**`SDE_API_KEY is not configured.`**
Set the env via your MCP client config (see above). Don't put the key in `process.env` of a globally-installed npm package — every client has its own way to pass env.

**`UPSTREAM: Status 401` on every call.**
Your API key is wrong or the instance you're pointing at isn't yours. Generate a fresh key in Settings.

**`UPSTREAM: SPEND_LIMIT`.**
You've configured a daily INR ceiling and the run would exceed it. Either raise the ceiling in Settings or run fewer results.

**`UPSTREAM: CONFIG_REQUIRED`** on Maps or LinkedIn search.
You haven't configured a Google Places / Apollo key in Settings → API keys for that provider. Configure one (you can have multiple — they round-robin).

**No tools showing up in the client UI.**
Check the client's MCP logs (Claude: Developer → "Open MCP logs"). Most often it's a typo in the JSON config or the binary isn't on PATH. Try `npx -y sde-mcp` from a terminal — it should print `[sde-mcp] super-data-extractor v… ready.` to stderr.

## License

MIT.
