'use strict';

const { isPrivateAddress, extractMappedV4, stripBracketsAndZone, _expandV6 } = require('../lib/ssrf');

describe('ssrf v3: address normalization', () => {
  it('strips brackets and zone IDs', () => {
    expect(stripBracketsAndZone('[fe80::1%25eth0]')).toBe('fe80::1');
    expect(stripBracketsAndZone('[::1]')).toBe('::1');
    expect(stripBracketsAndZone('fe80::1%eth0')).toBe('fe80::1');
  });

  it('extracts the V4 from a mapped IPv6 in dotted form', () => {
    expect(extractMappedV4('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(extractMappedV4('::ffff:169.254.169.254')).toBe('169.254.169.254');
  });

  it('extracts the V4 from a mapped IPv6 in hex form', () => {
    expect(extractMappedV4('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(extractMappedV4('::ffff:a9fe:a9fe')).toBe('169.254.169.254');
  });

  it('expands compressed IPv6 correctly', () => {
    expect(_expandV6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(_expandV6('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  });
});

describe('ssrf v3: blocks every IPv4-mapped IPv6 form for private V4', () => {
  it('blocks bracketed dotted form', () => {
    expect(isPrivateAddress('[::ffff:127.0.0.1]')).toBe(true);
  });
  it('blocks hex form pointing at 127.0.0.1', () => {
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true);
  });
  it('blocks hex form pointing at metadata IP', () => {
    expect(isPrivateAddress('::ffff:a9fe:a9fe')).toBe(true);
  });
  it('blocks fe80::1 with zone ID', () => {
    expect(isPrivateAddress('fe80::1%eth0')).toBe(true);
  });
  it('still allows public IPv6', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });
});
