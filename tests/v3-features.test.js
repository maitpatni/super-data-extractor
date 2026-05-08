'use strict';

process.env.MASTER_KEY = process.env.MASTER_KEY || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const { canonicalEmail, EMAIL_RE } = require('../lib/email-validate');
const { detectFromHtml } = require('../lib/tech-detect');

describe('email-validate: canonicalization', () => {
  it('strips dots and tags from gmail', () => {
    expect(canonicalEmail('First.Last+work@gmail.com')).toBe('firstlast@gmail.com');
    expect(canonicalEmail('first.last@googlemail.com')).toBe('firstlast@gmail.com');
  });
  it('strips +tag for non-gmail', () => {
    expect(canonicalEmail('hello+team@acme.com')).toBe('hello@acme.com');
  });
  it('lowercases', () => {
    expect(canonicalEmail('Hi@Acme.com')).toBe('hi@acme.com');
  });
  it('returns empty for nonsense', () => {
    expect(canonicalEmail('not-an-email')).toBe('');
    expect(canonicalEmail('')).toBe('');
  });
});

describe('email-validate: syntax regex', () => {
  it('accepts ordinary addresses', () => {
    expect(EMAIL_RE.test('a@b.co')).toBe(true);
    expect(EMAIL_RE.test('first.last+team@acme.io')).toBe(true);
  });
  it('rejects obvious nonsense', () => {
    expect(EMAIL_RE.test('a@b')).toBe(false);
    expect(EMAIL_RE.test('@example.com')).toBe(false);
    expect(EMAIL_RE.test('foo@')).toBe(false);
  });
});

describe('tech-detect: pattern matching', () => {
  it('detects WordPress + Google Analytics 4 + Cloudflare', () => {
    const html = `
      <html><head>
        <meta name="generator" content="WordPress 6.4">
        <link rel="stylesheet" href="/wp-content/themes/x/style.css">
        <script src="https://www.googletagmanager.com/gtag/js?id=G-XYZ123"></script>
      </head><body>WP demo</body></html>`;
    const headers = { 'cf-ray': 'abc-DFW' };
    const hits = detectFromHtml({ html, headers });
    const names = hits.map((h) => h.name);
    expect(names).toContain('WordPress');
    expect(names).toContain('Google Analytics 4');
    expect(names).toContain('Cloudflare');
  });

  it('detects Shopify from cdn + store header', () => {
    const html = '<script>Shopify.theme={};</script><img src="https://cdn.shopify.com/x.png"/>';
    const headers = { 'x-shopify-stage': 'production' };
    const hits = detectFromHtml({ html, headers });
    expect(hits.map((h) => h.name)).toContain('Shopify');
  });

  it('detects Next.js + Vercel hosting', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{}</script>';
    const headers = { 'x-vercel-id': 'xyz' };
    const hits = detectFromHtml({ html, headers });
    expect(hits.map((h) => h.name)).toEqual(expect.arrayContaining(['Next.js', 'Vercel']));
  });

  it('returns empty array on uninteresting HTML', () => {
    expect(detectFromHtml({ html: '<html><body>plain</body></html>', headers: {} })).toHaveLength(0);
  });
});

describe('apollo: empty-filter guard prevents full-DB scrape', () => {
  it('throws ValidationError when all filters are empty', async () => {
    const apollo = require('../services/apollo');
    await expect(
      apollo.searchProfiles({ apiKey: 'fake', name: '', company: '', role: '', location: '', industry: '' }),
    ).rejects.toThrow(/at least one/i);
  });
});
