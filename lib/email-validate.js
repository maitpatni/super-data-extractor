'use strict';

const dns = require('dns').promises;
const crypto = require('crypto');

// Email syntax: simple but RFC-compliant enough for our use case
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/;

const ROLE_LOCALPARTS = new Set([
  'info',
  'contact',
  'sales',
  'support',
  'admin',
  'administrator',
  'help',
  'helpdesk',
  'team',
  'office',
  'hello',
  'hi',
  'hey',
  'noreply',
  'no-reply',
  'donotreply',
  'marketing',
  'press',
  'media',
  'jobs',
  'careers',
  'hr',
  'accounts',
  'accounting',
  'billing',
  'privacy',
  'legal',
  'security',
  'abuse',
  'postmaster',
  'webmaster',
  'hostmaster',
  'root',
  'sysadmin',
  'it',
  'support-team',
  'customer-service',
  'customerservice',
  'enquiries',
  'enquiry',
  'inquiry',
  'inquiries',
  'feedback',
  'newsletter',
  'partners',
  'partnerships',
  'dev',
  'developers',
  'engineering',
  'operations',
  'ops',
]);

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.in',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'zoho.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'rediffmail.com',
  'tutanota.com',
  'fastmail.com',
]);

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'temp-mail.org',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'sharklasers.com',
  'dispostable.com',
  'trashmail.com',
  'getnada.com',
  'mintemail.com',
  'mohmal.com',
  'maildrop.cc',
  'tempmailo.com',
]);

const TYPO_DOMAINS = new Map([
  ['gmial.com', 'gmail.com'],
  ['gnail.com', 'gmail.com'],
  ['gmai.com', 'gmail.com'],
  ['gmaill.com', 'gmail.com'],
  ['hotnail.com', 'hotmail.com'],
  ['hotmai.com', 'hotmail.com'],
  ['outlok.com', 'outlook.com'],
  ['yahooo.com', 'yahoo.com'],
  ['yaho.com', 'yahoo.com'],
]);

/**
 * In-process DNS cache. Keeps a small TTL so we don't spam authoritative
 * servers for large enrichment runs against the same domain.
 */
const TTL_MS = 60 * 60 * 1000;
const dnsCache = new Map();

function cacheGet(key) {
  const v = dnsCache.get(key);
  if (!v) return undefined;
  if (Date.now() - v.t > TTL_MS) {
    dnsCache.delete(key);
    return undefined;
  }
  return v.value;
}

function cacheSet(key, value) {
  dnsCache.set(key, { t: Date.now(), value });
}

async function resolveMx(domain) {
  const key = `mx:${domain}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  try {
    const records = await dns.resolveMx(domain);
    records.sort((a, b) => a.priority - b.priority);
    cacheSet(key, records);
    return records;
  } catch (err) {
    cacheSet(key, []);
    return [];
  }
}

async function resolveTxt(domain) {
  const key = `txt:${domain}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map((arr) => arr.join(''));
    cacheSet(key, flat);
    return flat;
  } catch (err) {
    cacheSet(key, []);
    return [];
  }
}

function hasSpf(txtRecords) {
  return txtRecords.some((s) => /^v=spf1\s/i.test(s));
}

async function hasDmarc(domain) {
  const records = await resolveTxt(`_dmarc.${domain}`);
  return records.some((s) => /^v=dmarc1/i.test(s));
}

function localPart(email) {
  return String(email).split('@')[0]?.toLowerCase() || '';
}

function domainOf(email) {
  return String(email).split('@')[1]?.toLowerCase() || '';
}

function suggestCorrection(domain) {
  if (TYPO_DOMAINS.has(domain)) return TYPO_DOMAINS.get(domain);
  return null;
}

/**
 * Validate one email with DNS only (no SMTP probing — that's a different
 * conversation). Returns a structured verdict the UI can render.
 *
 *   confidence ∈ [0, 1]: how deliverable we think this is
 *   verdict   : 'valid' | 'risky' | 'invalid' | 'unknown'
 *   role      : true if local-part is a role inbox
 *   free      : true if the domain is a free webmail provider
 *   disposable: true if the domain is a known throwaway provider
 *   mx, spf, dmarc, suggestion: diagnostics
 */
async function validateEmail(email) {
  const e = String(email || '').trim();
  if (!e || !EMAIL_RE.test(e)) {
    return {
      email: e,
      verdict: 'invalid',
      confidence: 0,
      reason: 'syntax',
    };
  }
  const local = localPart(e);
  const domain = domainOf(e);
  const role = ROLE_LOCALPARTS.has(local);
  const free = FREE_MAIL_DOMAINS.has(domain);
  const disposable = DISPOSABLE_DOMAINS.has(domain);
  const suggestion = suggestCorrection(domain);

  if (disposable) {
    return {
      email: e,
      verdict: 'invalid',
      confidence: 0,
      reason: 'disposable',
      role,
      free,
      disposable,
      suggestion,
    };
  }

  const [mx, txt, dmarcOk] = await Promise.all([resolveMx(domain), resolveTxt(domain), hasDmarc(domain)]);
  const spfOk = hasSpf(txt);

  if (!mx.length) {
    return {
      email: e,
      verdict: 'invalid',
      confidence: 0.05,
      reason: 'no-mx',
      role,
      free,
      disposable,
      suggestion,
      mx: [],
      spf: spfOk,
      dmarc: dmarcOk,
    };
  }

  // Confidence model:
  //  base 0.55 (MX exists)
  //  +0.20 if SPF present (real domain)
  //  +0.15 if DMARC present
  //  -0.20 if role inbox (deliverable, but generally low-quality for outreach)
  //  -0.05 if free webmail (still deliverable; just less professional)
  let confidence = 0.55;
  if (spfOk) confidence += 0.2;
  if (dmarcOk) confidence += 0.15;
  if (role) confidence -= 0.2;
  if (free) confidence -= 0.05;
  confidence = Math.max(0, Math.min(1, confidence));

  let verdict;
  if (role || free) verdict = 'risky';
  else if (confidence >= 0.7) verdict = 'valid';
  else verdict = 'risky';

  return {
    email: e,
    verdict,
    confidence: Number(confidence.toFixed(2)),
    role,
    free,
    disposable,
    suggestion,
    mx: mx.map((r) => r.exchange),
    spf: spfOk,
    dmarc: dmarcOk,
  };
}

/**
 * Probe whether a domain is a "catch-all" (accepts mail at any local-part).
 * We avoid SMTP probing entirely; instead we look up the MX and check if it
 * matches any known catch-all provider patterns. This is a heuristic — for
 * real catch-all detection a user must opt into SMTP probing (not yet shipped).
 */
async function detectCatchAllHeuristic(domain) {
  const mx = await resolveMx(domain);
  if (!mx.length) return false;
  const allHosts = mx.map((m) => m.exchange.toLowerCase());
  // These patterns are common with catch-all forwarding services
  const catchAllSignals = [
    'forwardemail.net',
    'improvmx.com',
    'mxroute.com',
    'zoho.com',
    'cloudflare.net',
    'cloudfilter.net',
  ];
  return allHosts.some((h) => catchAllSignals.some((pat) => h.includes(pat)));
}

async function validateEmailsBatch(emails, { concurrency = 20 } = {}) {
  const out = new Array(emails.length);
  let i = 0;
  async function worker() {
    while (i < emails.length) {
      const idx = i++;
      out[idx] = await validateEmail(emails[idx]);
    }
  }
  await Promise.all(new Array(Math.max(1, concurrency)).fill(0).map(worker));
  return out;
}

// Stable digest of an email for dedup keys
function canonicalEmail(email) {
  const e = String(email || '')
    .trim()
    .toLowerCase();
  if (!e) return '';
  const [local, domain] = e.split('@');
  if (!local || !domain) return '';
  // Gmail: strip dots from local-part, drop +tag
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const stripped = local.split('+')[0].replace(/\./g, '');
    return `${stripped}@gmail.com`;
  }
  // Generic: drop +tag
  return `${local.split('+')[0]}@${domain}`;
}

function emailHash(email) {
  return crypto.createHash('sha1').update(canonicalEmail(email)).digest('hex');
}

module.exports = {
  EMAIL_RE,
  validateEmail,
  validateEmailsBatch,
  detectCatchAllHeuristic,
  canonicalEmail,
  emailHash,
  // exposed for tests
  _ROLE_LOCALPARTS: ROLE_LOCALPARTS,
  _FREE_MAIL_DOMAINS: FREE_MAIL_DOMAINS,
  _DISPOSABLE_DOMAINS: DISPOSABLE_DOMAINS,
};
