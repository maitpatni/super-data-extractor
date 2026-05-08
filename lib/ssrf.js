'use strict';

const dns = require('dns').promises;
const net = require('net');
const { config } = require('./config');
const { ValidationError } = require('./errors');

// IPv4 CIDR ranges that are not safe to fetch from a server.
// Sourced from RFC1918, RFC3927, RFC6598, RFC5735, RFC5737, RFC1112.
const PRIVATE_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
  ['255.255.255.255', 32],
];

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const byte = Number(part);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    n = (n << 8) + byte;
  }
  return n >>> 0;
}

function v4InCidr(ip, base, mask) {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (mask === 0) return true;
  const m = (~0 << (32 - mask)) >>> 0;
  return (ipInt & m) === (baseInt & m);
}

function isPrivateV4(ip) {
  return PRIVATE_V4.some(([base, mask]) => v4InCidr(ip, base, mask));
}

function isPrivateV6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fec0:')) return true; // link-local + deprecated site-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped: ::ffff:a.b.c.d
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

function isPrivateAddress(ip) {
  if (config.ssrf.allowPrivate) return false;
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true; // unknown format → reject
}

/**
 * Validate a user-supplied URL against SSRF risks. Returns the parsed URL on
 * success; throws ValidationError otherwise. Resolves the hostname via DNS and
 * rejects if any A/AAAA record points to a private/loopback/metadata range.
 */
async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_err) {
    throw new ValidationError('Invalid URL.', { url: rawUrl });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Only http(s) URLs are allowed.', { protocol: url.protocol });
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!config.ssrf.allowedPorts.includes(port)) {
    throw new ValidationError('Port not allowed.', { port });
  }
  // Reject obvious literal-IP private addresses without DNS work.
  if (net.isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) {
      throw new ValidationError('Address is private/loopback/metadata.', { ip: url.hostname });
    }
    return url;
  }
  let addrs;
  try {
    addrs = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch (err) {
    throw new ValidationError(`DNS lookup failed: ${err.code || err.message}`, { hostname: url.hostname });
  }
  if (!addrs.length) {
    throw new ValidationError('Hostname did not resolve.', { hostname: url.hostname });
  }
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new ValidationError('Hostname resolves to a private/loopback/metadata address.', {
        hostname: url.hostname,
        address: a.address,
      });
    }
  }
  return url;
}

/**
 * fetch() wrapper that:
 *  - validates the initial URL via assertSafeUrl
 *  - manually follows redirects (up to maxRedirects), re-validating each hop
 *  - applies a hard timeout and a max-body-bytes cap
 */
async function safeFetch(rawUrl, opts = {}) {
  const {
    method = 'GET',
    headers = {},
    timeoutMs = config.ssrf.timeoutMs,
    maxBytes = 1024 * 1024,
    maxRedirects = 3,
  } = opts;

  let current = await assertSafeUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(current.toString(), {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (hop === maxRedirects) {
        throw new ValidationError('Too many redirects.', { url: current.toString() });
      }
      const next = new URL(response.headers.get('location'), current);
      current = await assertSafeUrl(next.toString());
      continue;
    }
    // Stream up to maxBytes
    const chunks = [];
    let received = 0;
    if (response.body) {
      const reader = response.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          try {
            reader.cancel();
          } catch (_e) {
            /* ignore */
          }
          break;
        }
        chunks.push(Buffer.from(value));
      }
    }
    const body = Buffer.concat(chunks);
    return {
      status: response.status,
      ok: response.ok,
      url: current.toString(),
      headers: Object.fromEntries(response.headers.entries()),
      body,
      text: () => body.toString('utf8'),
    };
  }
  throw new ValidationError('Redirect loop.', { url: current.toString() });
}

module.exports = { assertSafeUrl, safeFetch, isPrivateAddress };
