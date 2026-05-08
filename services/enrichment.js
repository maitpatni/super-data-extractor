'use strict';

const { config } = require('../lib/config');
const { logger } = require('../lib/logger');
const { safeFetch } = require('../lib/ssrf');
const { extractFromHtml } = require('../lib/email-extract');
const { detectFromHtml } = require('../lib/tech-detect');
const { validateEmail, canonicalEmail } = require('../lib/email-validate');

// Per-domain queue: serialize requests to the same host with a delay.
const domainQueues = new Map();

function domainOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch (_e) {
    return '';
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withDomainSlot(host, fn) {
  const prev = domainQueues.get(host) || Promise.resolve();
  let release;
  const next = new Promise((r) => {
    release = r;
  });
  domainQueues.set(
    host,
    prev.then(() => next),
  );
  try {
    await prev;
    if (config.enrichment.perDomainDelayMs > 0) await delay(config.enrichment.perDomainDelayMs);
    return await fn();
  } finally {
    release();
    if (domainQueues.get(host) === next) domainQueues.delete(host);
  }
}

const robotsCache = new Map();
async function isAllowedByRobots(host) {
  // Conservative: if robots.txt explicitly disallows /, skip. Otherwise allow
  // since we only fetch a handful of well-known pages.
  if (robotsCache.has(host)) return robotsCache.get(host);
  try {
    const url = `https://${host}/robots.txt`;
    const r = await safeFetch(url, { timeoutMs: 4000, maxBytes: 64 * 1024, maxRedirects: 2 });
    const txt = r.text();
    const lines = txt.split(/\r?\n/);
    let mineUA = false;
    let allowed = true;
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      const key = (k || '').trim().toLowerCase();
      if (key === 'user-agent') mineUA = v === '*' || v.toLowerCase().includes('superdataextractor');
      else if (mineUA && key === 'disallow' && (v === '/' || v === '')) allowed = v === '';
    }
    robotsCache.set(host, allowed);
    return allowed;
  } catch (err) {
    // robots.txt failure → assume allowed but rate-limit anyway
    robotsCache.set(host, true);
    return true;
  }
}

/**
 * Enrich a website by visiting `/`, `/contact`, etc., extracting emails/phones/socials.
 */
async function enrichWebsite(websiteUrl) {
  if (!config.enrichment.enabled) return { enrichmentStatus: 'disabled' };
  if (!websiteUrl) return { enrichmentStatus: 'no-website' };
  const host = domainOf(websiteUrl);
  if (!host) return { enrichmentStatus: 'invalid-url' };

  return withDomainSlot(host, async () => {
    try {
      const allowed = await isAllowedByRobots(host);
      if (!allowed) return { enrichmentStatus: 'blocked-by-robots' };

      const result = { emails: new Set(), phones: new Set(), socials: {} };
      const techNames = new Map(); // name -> {category, evidence}
      let visited = 0;
      for (const p of config.enrichment.paths) {
        if (visited >= 3 && (result.emails.size || Object.keys(result.socials).length)) break;
        const url = new URL(p, websiteUrl).toString();
        try {
          const r = await safeFetch(url, {
            timeoutMs: config.enrichment.timeoutMs,
            maxBytes: config.enrichment.maxBytes,
            maxRedirects: 3,
            headers: { 'user-agent': config.enrichment.userAgent, accept: 'text/html,*/*;q=0.8' },
          });
          if (!r.ok || !r.body || r.body.length < 50) continue;
          visited += 1;
          const html = r.text();
          const ext = extractFromHtml(html, r.url);
          ext.emails.forEach((e) => result.emails.add(e));
          ext.phones.forEach((p2) => result.phones.add(p2));
          for (const [k, v] of Object.entries(ext.socials)) {
            if (!result.socials[k]) result.socials[k] = v;
          }
          // Tech stack — only run on the homepage to keep cost down
          if (p === '/' || p === '') {
            const techHits = detectFromHtml({ html, headers: r.headers });
            for (const t of techHits) {
              if (!techNames.has(t.name)) techNames.set(t.name, t);
            }
          }
        } catch (err) {
          // SSRF rejection or per-page failure: continue with next path
          logger.debug({ err: err.message, url }, 'enrichment path failed');
        }
      }
      const emails = Array.from(result.emails).slice(0, 5);
      const phones = Array.from(result.phones).slice(0, 5);

      // Validate emails (DNS-only). Cheap and parallel.
      const emailValidations = await Promise.all(emails.map((e) => validateEmail(e).catch(() => null)));
      const emailsScored = emails.map((e, i) => ({
        email: e,
        canonical: canonicalEmail(e),
        ...(emailValidations[i] || { verdict: 'unknown', confidence: 0 }),
      }));
      // Pick the best email by (verdict rank, confidence, !role, !free)
      const VERDICT_RANK = { valid: 3, risky: 2, unknown: 1, invalid: 0 };
      const bestEmail =
        emailsScored.slice().sort((a, b) => {
          const v = (VERDICT_RANK[b.verdict] || 0) - (VERDICT_RANK[a.verdict] || 0);
          if (v !== 0) return v;
          const r = (a.role ? 1 : 0) - (b.role ? 1 : 0);
          if (r !== 0) return r;
          const f = (a.free ? 1 : 0) - (b.free ? 1 : 0);
          if (f !== 0) return f;
          return (b.confidence || 0) - (a.confidence || 0);
        })[0]?.email || '';

      return {
        enrichmentStatus:
          emails.length || Object.keys(result.socials).length || techNames.size ? 'enriched' : 'no-data',
        emails,
        emailsScored,
        bestEmail,
        phones,
        socials: result.socials,
        tech: Array.from(techNames.values()),
      };
    } catch (err) {
      logger.debug({ err: err.message, host }, 'enrichment failed');
      return { enrichmentStatus: 'failed', error: err.message };
    }
  });
}

/**
 * Enrich a list of results in parallel (per-domain serialized via withDomainSlot).
 */
async function enrichResults(results, { concurrency = 4, onProgress = () => {}, signal } = {}) {
  const tasks = [];
  let done = 0;
  const total = results.filter((r) => r.website && !r.email && (!r.emails || !r.emails.length)).length;
  let active = 0;
  let cursor = 0;

  return new Promise((resolve) => {
    function next() {
      if (signal?.aborted) {
        if (active === 0) resolve(results);
        return;
      }
      while (active < concurrency && cursor < results.length) {
        const idx = cursor++;
        const r = results[idx];
        if (!r.website || (Array.isArray(r.emails) && r.emails.length) || r.email) {
          continue;
        }
        active += 1;
        tasks.push(
          enrichWebsite(r.website)
            .then((info) => {
              r.emails = info.emails || [];
              r.emailsScored = info.emailsScored || [];
              r.phones = info.phones || (r.phone ? [r.phone] : []);
              r.socials = info.socials || {};
              r.tech = info.tech || [];
              r.enrichmentStatus = info.enrichmentStatus || 'unknown';
              r.email = r.email || info.bestEmail || r.emails[0] || '';
              r.bestEmail = info.bestEmail || r.email || '';
              done += 1;
              onProgress({ done, total });
            })
            .catch(() => {
              done += 1;
              onProgress({ done, total });
            })
            .finally(() => {
              active -= 1;
              next();
            }),
        );
      }
      if (active === 0 && cursor >= results.length) resolve(results);
    }
    if (!total) return resolve(results);
    next();
  });
}

module.exports = { enrichWebsite, enrichResults };
