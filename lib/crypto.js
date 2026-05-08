'use strict';

const crypto = require('crypto');
const { config } = require('./config');

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = 'enc:v1:';

function decodeMasterKey() {
  if (!config.masterKey) {
    throw new Error('MASTER_KEY is not configured.');
  }
  const isHex = /^[0-9a-f]+$/i.test(config.masterKey);
  const buf = Buffer.from(config.masterKey, isHex ? 'hex' : 'base64');
  if (buf.length !== 32) {
    throw new Error(`MASTER_KEY must decode to 32 bytes (got ${buf.length}).`);
  }
  return buf;
}

function masterKey() {
  // Intentionally NOT cached: re-decoding a 32-byte buffer is microseconds, but
  // caching means MASTER_KEY rotation requires a process restart (and old
  // values silently keep being used). Re-read every call.
  return decodeMasterKey();
}

/**
 * Encrypts plaintext, returning a single base64 string of: IV(12) || TAG(16) || CT.
 * Output is prefixed with `enc:v1:` so we can detect ciphertexts at-rest.
 */
function encrypt(plaintext) {
  if (plaintext === '' || plaintext === null || plaintext === undefined) return '';
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypts a ciphertext produced by encrypt(). If the input is not a recognized
 * ciphertext (i.e. legacy plaintext), returns it unchanged so reads continue to
 * work during the migration window.
 */
function decrypt(value) {
  if (!value) return '';
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) {
    return value; // legacy plaintext; let the migration re-encrypt it later
  }
  const blob = Buffer.from(value.slice(PREFIX.length), 'base64');
  if (blob.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Ciphertext is truncated.');
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

function isCiphertext(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function generateApiKey(prefix = 'sde_live_') {
  const random = crypto.randomBytes(24).toString('base64url');
  return prefix + random;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { encrypt, decrypt, isCiphertext, generateApiKey, hashToken };
