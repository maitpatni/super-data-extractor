'use strict';

const { parse } = require('node-html-parser');

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{6,18}\d)/g;
const SOCIAL_HOSTS = {
  instagram: /(?:^|\.)instagram\.com$/i,
  facebook: /(?:^|\.)(?:facebook|fb)\.com$/i,
  twitter: /(?:^|\.)(?:twitter|x)\.com$/i,
  linkedin: /(?:^|\.)linkedin\.com$/i,
  youtube: /(?:^|\.)youtube\.com$/i,
  tiktok: /(?:^|\.)tiktok\.com$/i,
};
const NOISE_EMAIL_RE =
  /(no-?reply|do-?not-?reply|example\.com|sentry\.io|wixpress\.com|@example\b|@test\b|@localhost)/i;
const NOISE_DOMAIN_RE = /\.(?:png|jpg|jpeg|gif|webp|svg|css|js|woff2?|ttf|map)$/i;

function dedupe(arr) {
  return Array.from(new Set(arr.filter(Boolean).map((v) => v.trim())));
}

function extractFromHtml(html, sourceUrl = '') {
  if (!html) return { emails: [], phones: [], socials: {} };
  const root = parse(html, { lowerCaseTagName: false });

  // mailto: and tel: from anchors are highest signal
  const emails = [];
  const phones = [];
  const socials = {};

  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (/^mailto:/i.test(href)) {
      const e = href.replace(/^mailto:/i, '').split('?')[0];
      if (e) emails.push(e);
    } else if (/^tel:/i.test(href)) {
      const p = href.replace(/^tel:/i, '');
      if (p) phones.push(p);
    } else {
      let url;
      try {
        url = new URL(href, sourceUrl);
      } catch (_e) {
        /* ignore */
      }
      if (url) {
        for (const [name, re] of Object.entries(SOCIAL_HOSTS)) {
          if (re.test(url.hostname)) {
            const path = url.pathname.replace(/\/+$/, '');
            if (path && !socials[name]) socials[name] = url.toString();
          }
        }
      }
    }
  }

  // Free-text scan against the full document
  const text = root.text || '';
  for (const m of text.matchAll(EMAIL_RE)) emails.push(m[0]);
  for (const m of text.matchAll(PHONE_RE)) phones.push(m[0]);

  return {
    emails: dedupe(emails)
      .filter((e) => !NOISE_EMAIL_RE.test(e))
      .filter((e) => !NOISE_DOMAIN_RE.test(e))
      .slice(0, 10),
    phones: dedupe(phones).slice(0, 10),
    socials,
  };
}

module.exports = { extractFromHtml };
