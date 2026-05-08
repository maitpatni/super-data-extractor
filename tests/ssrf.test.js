'use strict';

const { assertSafeUrl, isPrivateAddress } = require('../lib/ssrf');

describe('ssrf: isPrivateAddress', () => {
  it('blocks loopback', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
  });
  it('blocks RFC1918', () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
  });
  it('blocks link-local incl. cloud metadata', () => {
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
  });
  it('blocks ULA', () => {
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fd12:3456:789a::1')).toBe(true);
  });
  it('blocks CGNAT, multicast, reserved', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
    expect(isPrivateAddress('240.0.0.1')).toBe(true);
  });
  it('allows public IPs', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('1.1.1.1')).toBe(false);
  });
});

describe('ssrf: assertSafeUrl', () => {
  it('rejects file:// and gopher://', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertSafeUrl('gopher://example.com/')).rejects.toThrow();
  });
  it('rejects literal-IP private addresses', async () => {
    await expect(assertSafeUrl('http://127.0.0.1/x')).rejects.toThrow();
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
  });
  it('rejects non-standard ports', async () => {
    await expect(assertSafeUrl('http://example.com:22/')).rejects.toThrow();
  });
});
