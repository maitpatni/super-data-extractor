'use strict';

const dns = require('dns').promises;
const net = require('net');
const undici = require('undici');
const { config } = require('./config');
const { ValidationError } = require('./errors');

// ---------------------------------------------------------------------------
// CIDR rules — built once via Node's BlockList (handles IPv4 and IPv6 cleanly).
// ---------------------------------------------------------------------------

const blocklist = new net.BlockList();

// IPv4 — everything we don't want a server to fetch
const PRIVATE_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local incl. AWS/GCP/Azure metadata 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];
for (const [base, mask] of PRIVATE_V4) blocklist.addSubnet(base, mask, 'ipv4');
blocklist.addAddress('255.255.255.255', 'ipv4');

// IPv6
blocklist.addAddress('::1', 'ipv6'); // loopback
blocklist.addAddress('::', 'ipv6'); // unspecified
blocklist.addSubnet('fc00::', 7, 'ipv6'); // ULA fc00::/7
blocklist.addSubnet('fe80::', 10, 'ipv6'); // link-local
blocklist.addSubnet('fec0::', 10, 'ipv6'); // deprecated site-local
blocklist.addSubnet('ff00::', 8, 'ipv6'); // multicast

// ---------------------------------------------------------------------------
// Address normalization
// ---------------------------------------------------------------------------

function stripBracketsAndZone(addr) {
  if (!addr) return '';
  let s = String(addr).trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  // RFC 6874: zone IDs in URLs are %25xxx; Node sometimes already decodes %.
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  return s;
}

/**
 * If `addr` is an IPv4-mapped or IPv4-compatible IPv6 address (in any form
 * including the rarely-seen hex shorthand `::ffff:7f00:1`), return the
 * underlying IPv4 string. Otherwise return null.
 */
function extractMappedV4(addr) {
  if (!addr) return null;
  const s = stripBracketsAndZone(addr).toLowerCase();
  if (!net.isIPv6(s)) return null;

  // Decimal forms: ::ffff:1.2.3.4  and (deprecated) ::1.2.3.4
  const decMatch = s.match(/^(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (decMatch) return decMatch[1];

  // Hex form of IPv4-mapped: ::ffff:HHHH:HHHH (last two 16-bit groups encode the IPv4)
  // Use a robust expansion of the address.
  const groups = expandV6(s);
  if (!groups) return null;
  // IPv4-mapped: groups 0..4 == 0, group 5 == 0xffff, groups 6..7 hold the IPv4
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const v4 =
      `${(groups[6] >> 8) & 0xff}.${groups[6] & 0xff}.` + `${(groups[7] >> 8) & 0xff}.${groups[7] & 0xff}`;
    return v4;
  }
  // IPv4-compatible: groups 0..6 == 0, group 7 == low 16 bits — too ambiguous to
  // safely treat as IPv4 (could be ::1 etc.). Skip; the IPv6 blocklist already
  // covers ::1 and similar.
  return null;
}

function expandV6(addr) {
  if (!addr || addr.includes('.')) {
    // dotted form: pre-expand the trailing IPv4 to two hex groups
    const m = addr.match(/^(.*):((?:\d{1,3}\.){3}\d{1,3})$/);
    if (m) {
      const v4 = m[2].split('.').map(Number);
      if (v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
      const hi = ((v4[0] << 8) | v4[1]).toString(16);
      const lo = ((v4[2] << 8) | v4[3]).toString(16);
      addr = `${m[1]}:${hi}:${lo}`;
    }
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] === '' ? [] : halves[0].split(':');
  const right = halves.length === 2 ? (halves[1] === '' ? [] : halves[1].split(':')) : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...new Array(missing).fill('0'), ...right];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => parseInt(g || '0', 16));
  if (out.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return null;
  return out;
}

function isPrivateAddress(addr) {
  if (config.ssrf.allowPrivate) return false;
  const s = stripBracketsAndZone(addr);
  if (!s) return true;
  // IPv4-mapped IPv6 → check the underlying V4 first (handles all hex/dec forms)
  const mapped = extractMappedV4(s);
  if (mapped) return blocklist.check(mapped, 'ipv4');
  if (net.isIPv4(s)) return blocklist.check(s, 'ipv4');
  if (net.isIPv6(s)) return blocklist.check(s, 'ipv6');
  return true; // unknown format → reject
}

// ---------------------------------------------------------------------------
// URL validation — resolves DNS *once* and pins to those IPs to defeat
// rebinding. Returns { url, pinnedAddrs } where pinnedAddrs is the validated
// address set safeFetch will force the connection to.
// ---------------------------------------------------------------------------

async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_e) {
    throw new ValidationError('Invalid URL.', { url: rawUrl });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Only http(s) URLs are allowed.', { protocol: url.protocol });
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!config.ssrf.allowedPorts.includes(port)) {
    throw new ValidationError('Port not allowed.', { port });
  }
  // Literal IP host: pin and validate immediately.
  const hostnameForCheck = stripBracketsAndZone(url.hostname);
  if (net.isIP(hostnameForCheck)) {
    if (isPrivateAddress(hostnameForCheck)) {
      throw new ValidationError('Address is private/loopback/metadata.', { ip: hostnameForCheck });
    }
    return {
      url,
      pinnedAddrs: [{ address: hostnameForCheck, family: net.isIPv4(hostnameForCheck) ? 4 : 6 }],
    };
  }
  // DNS hostname: resolve once, validate every record, pin.
  let addrs;
  try {
    addrs = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch (err) {
    throw new ValidationError(`DNS lookup failed: ${err.code || err.message}`, {
      hostname: url.hostname,
    });
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
  return { url, pinnedAddrs: addrs };
}

// ---------------------------------------------------------------------------
// safeFetch — uses an undici Agent whose `connect.lookup` always returns the
// pre-validated IP, so DNS rebinding between validation and fetch is impossible.
// ---------------------------------------------------------------------------

function buildPinnedAgent(pinnedAddrs) {
  const addr = pinnedAddrs[0]; // already validated; first one is fine
  return new undici.Agent({
    connect: {
      // Force resolution to the pre-validated IP; ignore real DNS at connect time.
      lookup: (_host, _opts, cb) => {
        cb(null, addr.address, addr.family);
      },
    },
  });
}

async function safeFetch(rawUrl, opts = {}) {
  const {
    method = 'GET',
    headers = {},
    timeoutMs = config.ssrf.timeoutMs,
    maxBytes = 1024 * 1024,
    maxRedirects = 3,
    body,
  } = opts;

  let { url, pinnedAddrs } = await assertSafeUrl(rawUrl);
  let dispatcher = buildPinnedAgent(pinnedAddrs);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
        // dispatcher pins the connection to the pre-validated IP
        // (undici-specific extension; safe to pass to fetch()).
        dispatcher,
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (hop === maxRedirects) {
        throw new ValidationError('Too many redirects.', { url: url.toString() });
      }
      const next = new URL(response.headers.get('location'), url);
      // Re-validate the new hostname end-to-end (and re-pin).
      const validated = await assertSafeUrl(next.toString());
      url = validated.url;
      pinnedAddrs = validated.pinnedAddrs;
      try {
        await dispatcher.close();
      } catch (_e) {
        /* ignore */
      }
      dispatcher = buildPinnedAgent(pinnedAddrs);
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
    const responseBody = Buffer.concat(chunks);
    try {
      await dispatcher.close();
    } catch (_e) {
      /* ignore */
    }
    return {
      status: response.status,
      ok: response.ok,
      url: url.toString(),
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
      text: () => responseBody.toString('utf8'),
    };
  }
  try {
    await dispatcher.close();
  } catch (_e) {
    /* ignore */
  }
  throw new ValidationError('Redirect loop.', { url: url.toString() });
}

module.exports = {
  assertSafeUrl,
  safeFetch,
  isPrivateAddress,
  extractMappedV4,
  stripBracketsAndZone,
  // exported for tests
  _expandV6: expandV6,
};
