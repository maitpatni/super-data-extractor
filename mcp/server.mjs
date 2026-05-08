// Super Data Extractor — MCP (Model Context Protocol) server
//
// This is a thin adapter from MCP tool calls to the running SDE instance's
// public REST API. It runs as a stdio child process spawned by an MCP client
// (Claude Desktop, Claude Code, Cursor, Continue.dev, GitHub Copilot's MCP
// host, etc.).
//
// Quickstart:
//   1. Start your SDE instance:        `docker compose up -d`  (or `npm start`)
//   2. Generate a public API key in   Settings → API keys → New
//   3. Register this MCP server with your client:
//        Claude Desktop / Code:
//            claude mcp add super-data-extractor \
//              -e SDE_BASE_URL=http://localhost:3000 \
//              -e SDE_API_KEY=sde_live_xxx \
//              -- npx -y sde-mcp
//        Cursor / Continue.dev / generic MCP host: equivalent JSON config
//        with command "npx" and args ["-y", "sde-mcp"].
//
// Env:
//   SDE_BASE_URL   — your SDE instance, default http://localhost:3000
//   SDE_API_KEY    — sde_live_… (required)
//   SDE_TIMEOUT_MS — per-call HTTP timeout, default 60000

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const NAME = 'super-data-extractor';
const VERSION = '3.2.0';
const BASE_URL = (process.env.SDE_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API_KEY = process.env.SDE_API_KEY || '';
const TIMEOUT_MS = Number(process.env.SDE_TIMEOUT_MS || 60_000);

if (!API_KEY) {
  // We still start so the client gets a useful error on first call rather than
  // hanging at startup. But warn loudly to stderr (which MCP clients show in
  // their logs).
  // eslint-disable-next-line no-console
  console.error(
    '[sde-mcp] SDE_API_KEY not set. Set it via the client config (env), e.g. SDE_API_KEY=sde_live_…',
  );
}

function withQuery(path, params) {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function api(method, path, body) {
  if (!API_KEY) {
    throw new Error('SDE_API_KEY is not configured. Add it to your MCP client env.');
  }
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-api-key': API_KEY,
        'user-agent': `sde-mcp/${VERSION}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_e) {
      data = { error: { code: 'BAD_RESPONSE', message: text.slice(0, 400) } };
    }
    if (!r.ok) {
      const msg = data?.error?.message || `Status ${r.status}`;
      const code = data?.error?.code || 'UPSTREAM';
      throw new Error(`${code}: ${msg}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function ok(json) {
  return {
    content: [
      {
        type: 'text',
        text: typeof json === 'string' ? json : JSON.stringify(json, null, 2),
      },
    ],
  };
}

function fail(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: String(message) }],
  };
}

// ---------------------------------------------------------------------------
// Tool list — kept aligned with the public REST API at /api/v1/*.
// We deliberately preview-shape large payloads so chat models don't choke on
// 500-row results: the MCP response always returns the full JSON for the model
// to inspect, but each tool description nudges the model toward summarizing.
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'sde_maps_search',
    description:
      'Search Google Maps for businesses by keyword and location. Returns rows with name, address, phone, website, rating, review count, hours, category, and (optionally) enriched email/tech-stack/socials. Uses density-aware grid search internally to bypass the 60-result page cap. Costs the user real Google Places API spend (visible in the response cost meta).',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: { type: 'string', description: 'What to search for, e.g. "dentist" or "coffee shop"' },
        location: { type: 'string', description: 'City / area, e.g. "Mumbai 400001" or "Brooklyn, NY"' },
        radius: { type: 'number', description: 'Search radius in meters, default 5000', default: 5000 },
        maxResults: { type: 'number', description: '1-500, default 60', default: 60 },
        includedType: {
          type: 'string',
          description: 'Optional Google place type (e.g. "dentist", "restaurant"). Only used if exact-match.',
        },
        filters: {
          type: 'object',
          description: 'Optional post-filter: hasPhone, hasWebsite, hasReviews, minRating, priceLevels',
          additionalProperties: true,
        },
        freshOnly: {
          type: 'boolean',
          description: 'If true, exclude places this user has already extracted (dedup vs full history)',
          default: false,
        },
        enrich: {
          type: 'boolean',
          description: 'Visit websites to extract email/tech/socials. Slower but much higher signal.',
          default: false,
        },
      },
      required: ['searchTerm', 'location'],
    },
  },
  {
    name: 'sde_linkedin_search',
    description:
      'Search Apollo.io for people by name / company / role / location / industry. At least one filter is required (refuses unbounded scrapes). Returns normalized profile rows.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        company: { type: 'string' },
        role: { type: 'string' },
        location: { type: 'string' },
        industry: { type: 'string' },
        maxResults: { type: 'number', description: '1-200, default 25', default: 25 },
      },
    },
  },
  {
    name: 'sde_enrich',
    description:
      'Given a list of rows that each have a website (or domain), enrich them with emails (DNS-validated), socials (Instagram/Facebook/X/LinkedIn/YouTube/TikTok), phones, and detected tech stack (CMS / framework / analytics / payments / hosting). Zero search cost — uses only your own egress + DNS.',
    inputSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          items: {
            type: 'object',
            properties: {
              website: { type: 'string' },
              domain: {
                type: 'string',
                description: 'Used if website is missing; auto-prefixed with https://',
              },
            },
            additionalProperties: true,
          },
        },
        includeTech: { type: 'boolean', default: true },
        validateEmails: { type: 'boolean', default: true },
      },
      required: ['rows'],
    },
  },
  {
    name: 'sde_email_validate',
    description:
      'DNS-only email validation: MX/SPF/DMARC, role-inbox, free-mail, disposable, typo correction. Returns a verdict ("valid" | "risky" | "invalid" | "unknown") and a 0-1 confidence score. Zero per-lookup cost.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Single email to validate' },
        emails: {
          type: 'array',
          maxItems: 500,
          items: { type: 'string' },
          description: 'Batch validate up to 500 emails',
        },
      },
    },
  },
  {
    name: 'sde_bulk_maps_start',
    description:
      'Start a persisted bulk Maps job. Provide an array of {searchTerm, location, …} queries. Returns a jobId; poll with sde_job_status. Resumes automatically on server restart and skips already-completed queries.',
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          items: {
            type: 'object',
            properties: {
              searchTerm: { type: 'string' },
              location: { type: 'string' },
              radius: { type: 'number' },
              includedType: { type: 'string' },
              filters: { type: 'object', additionalProperties: true },
            },
            required: ['location'],
          },
        },
        maxResultsPerQuery: { type: 'number', default: 60 },
        enrich: { type: 'boolean', default: true },
        includeHistoryDedup: { type: 'boolean', default: false },
      },
      required: ['queries'],
    },
  },
  {
    name: 'sde_job_status',
    description:
      'Get the status of a bulk job: progress, partialResults, costInr, and (when finished) resultExtractionId.',
    inputSchema: {
      type: 'object',
      properties: { jobId: { type: 'number' } },
      required: ['jobId'],
    },
  },
  {
    name: 'sde_extractions_list',
    description: "List the user's past extractions. Use sde_extraction_get to fetch a full result set.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 50 },
        offset: { type: 'number', default: 0 },
      },
    },
  },
  {
    name: 'sde_extraction_get',
    description: 'Fetch a full extraction by id (includes all rows + cost + summary).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    name: 'sde_cost_estimate',
    description:
      'Pre-flight cost estimate for a Maps search of N text-search calls. Use this before sde_maps_search when planning a bulk job to surface ₹/$ before spending.',
    inputSchema: {
      type: 'object',
      properties: {
        expectedTextSearches: { type: 'number', default: 1 },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

const server = new Server({ name: NAME, version: VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params || {};
  try {
    switch (name) {
      case 'sde_maps_search':
        return ok(await api('POST', '/api/v1/maps/search', args));
      case 'sde_linkedin_search':
        return ok(await api('POST', '/api/v1/linkedin/search', args));
      case 'sde_enrich':
        return ok(await api('POST', '/api/v1/enrich', args));
      case 'sde_email_validate':
        return ok(await api('POST', '/api/v1/email/validate', args));
      case 'sde_bulk_maps_start':
        return ok(await api('POST', '/api/v1/jobs/bulk-maps', args));
      case 'sde_job_status':
        return ok(await api('GET', `/api/v1/jobs/${encodeURIComponent(args.jobId)}`));
      case 'sde_extractions_list':
        return ok(
          await api(
            'GET',
            withQuery('/api/v1/extractions', {
              limit: args.limit,
              offset: args.offset,
            }),
          ),
        );
      case 'sde_extraction_get':
        return ok(await api('GET', `/api/v1/extractions/${encodeURIComponent(args.id)}`));
      case 'sde_cost_estimate':
        return ok(await api('POST', '/api/v1/maps/cost-estimate', args));
      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return fail(err?.message || String(err));
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

// Helpful banner on stderr (stdout is reserved for the JSON-RPC channel).
// eslint-disable-next-line no-console
console.error(
  `[sde-mcp] ${NAME} v${VERSION} ready. Base URL: ${BASE_URL}. ${TOOLS.length} tools registered.`,
);

// Export tool list for tests (when imported via dynamic import).
export { TOOLS, NAME, VERSION };
