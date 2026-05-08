'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

let mcpModule;

beforeAll(async () => {
  // Make API_KEY non-empty so the server doesn't print its warning during tests.
  process.env.SDE_API_KEY = process.env.SDE_API_KEY || 'sde_live_test';
  // Importing the server connects the StdioTransport. Vitest runs in-process
  // so connecting to stdio is fine — it just ties to test stdio. We import for
  // its TOOLS export only.
  const url = pathToFileURL(path.resolve(__dirname, '..', 'mcp', 'server.mjs')).href;
  mcpModule = await import(url);
});

describe('mcp: tool list', () => {
  it('exports the expected tool names', () => {
    const names = mcpModule.TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'sde_bulk_maps_start',
        'sde_cost_estimate',
        'sde_email_validate',
        'sde_enrich',
        'sde_extraction_get',
        'sde_extractions_list',
        'sde_job_status',
        'sde_linkedin_search',
        'sde_maps_search',
      ].sort(),
    );
  });

  it('every tool has a non-trivial description and an inputSchema with type=object', () => {
    for (const t of mcpModule.TOOLS) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema?.type).toBe('object');
    }
  });

  it('sde_maps_search requires searchTerm + location', () => {
    const tool = mcpModule.TOOLS.find((t) => t.name === 'sde_maps_search');
    expect(tool.inputSchema.required).toEqual(expect.arrayContaining(['searchTerm', 'location']));
  });

  it('sde_enrich requires a rows array', () => {
    const tool = mcpModule.TOOLS.find((t) => t.name === 'sde_enrich');
    expect(tool.inputSchema.required).toContain('rows');
    expect(tool.inputSchema.properties.rows.type).toBe('array');
    expect(tool.inputSchema.properties.rows.maxItems).toBeGreaterThan(0);
  });

  it('exposes correct package metadata', () => {
    expect(mcpModule.NAME).toBe('super-data-extractor');
    expect(mcpModule.VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
