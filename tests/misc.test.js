'use strict';

process.env.MASTER_KEY = process.env.MASTER_KEY || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const { encrypt, decrypt, isCiphertext, generateApiKey, hashToken } = require('../lib/crypto');
const { defangCell, defangRow } = require('../lib/csv-injection');
const { extractFromHtml } = require('../lib/email-extract');

describe('crypto', () => {
  it('roundtrips through encrypt/decrypt', () => {
    const ct = encrypt('AIzaSyExample-Google-Key-1234567890');
    expect(isCiphertext(ct)).toBe(true);
    expect(decrypt(ct)).toBe('AIzaSyExample-Google-Key-1234567890');
  });
  it('returns plaintext unchanged when not ciphertext (legacy passthrough)', () => {
    expect(decrypt('legacy-plain-key')).toBe('legacy-plain-key');
  });
  it('produces unique ciphertext per call (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
  });
  it('generates distinct API keys with prefix', () => {
    const k1 = generateApiKey('sde_live_');
    const k2 = generateApiKey('sde_live_');
    expect(k1.startsWith('sde_live_')).toBe(true);
    expect(k1).not.toBe(k2);
  });
  it('hashes deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('csv-injection', () => {
  it('defangs leading dangerous chars', () => {
    expect(defangCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(defangCell('+1234')).toBe("'+1234");
    expect(defangCell('-100')).toBe("'-100");
    expect(defangCell('@cmd')).toBe("'@cmd");
  });
  it('leaves benign cells alone', () => {
    expect(defangCell('hello')).toBe('hello');
    expect(defangCell(42)).toBe(42);
    expect(defangCell(null)).toBe(null);
  });
  it('defangs every value in a row', () => {
    const r = defangRow({ a: '=evil', b: 'safe' });
    expect(r.a).toBe("'=evil");
    expect(r.b).toBe('safe');
  });
});

describe('email-extract', () => {
  it('pulls mailto, tel, and free-text emails', () => {
    const html = `
      <html><body>
        <a href="mailto:hello@acme.com">Email</a>
        <a href="tel:+12025550123">Call</a>
        Reach us at sales@acme.com or sales+priority@acme.com
        <a href="https://instagram.com/acme">IG</a>
      </body></html>`;
    const out = extractFromHtml(html, 'https://acme.com/contact');
    expect(out.emails).toContain('hello@acme.com');
    expect(out.emails).toContain('sales@acme.com');
    expect(out.phones[0]).toMatch(/2025550123/);
    expect(out.socials.instagram).toMatch(/instagram\.com\/acme/);
  });
  it('filters obvious noise', () => {
    const out = extractFromHtml('contact noreply@acme.com or info@acme.com', '');
    expect(out.emails).toContain('info@acme.com');
    expect(out.emails).not.toContain('noreply@acme.com');
  });
});
