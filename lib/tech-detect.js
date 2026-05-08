'use strict';

const { parse } = require('node-html-parser');

/**
 * Lightweight, server-side tech-stack detector. No external API. Inspired by
 * Wappalyzer's pattern model but kept small: we ship the detections that
 * matter most for B2B lead qualification (CMS, ecommerce, analytics, ad tech,
 * email marketing, frameworks, hosting). Adding more is a matter of appending
 * to FINGERPRINTS.
 *
 * Each fingerprint:
 *   name        — display name
 *   category    — coarse bucket
 *   header[]    — { name, value? }   match if header is present (and value matches regex if given)
 *   script[]    — RegExp on <script src>
 *   meta[]      — { name, value? }   match if <meta name="X"> exists (with optional value regex)
 *   body[]      — RegExp on the raw HTML body
 *   global[]    — RegExp on inline <script> contents (looking for `window.X = ...`-style globals)
 *   cookie[]    — RegExp on Set-Cookie names
 */
const FINGERPRINTS = [
  // CMS
  {
    name: 'WordPress',
    category: 'CMS',
    script: [/\/wp-(?:content|includes)\//i],
    body: [/wp-content|wp-includes/i],
    meta: [{ name: 'generator', value: /^WordPress/i }],
  },
  {
    name: 'Shopify',
    category: 'Ecommerce',
    body: [/cdn\.shopify\.com|Shopify\.theme/i],
    header: [{ name: 'x-shopify-stage' }],
    cookie: [/^_shopify_/],
  },
  {
    name: 'Wix',
    category: 'Website Builder',
    body: [/static\.wixstatic\.com|wix-bolt/i],
    header: [{ name: 'x-wix-request-id' }],
  },
  {
    name: 'Squarespace',
    category: 'Website Builder',
    body: [/static\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/i],
    header: [{ name: 'x-served-by', value: /^cache-/i }],
  },
  {
    name: 'Webflow',
    category: 'Website Builder',
    body: [/webflow\.com|wf-page-id|js\.wf-page-id/i],
    meta: [{ name: 'generator', value: /Webflow/i }],
  },
  {
    name: 'Drupal',
    category: 'CMS',
    meta: [{ name: 'generator', value: /^Drupal/i }],
    header: [{ name: 'x-drupal-cache' }, { name: 'x-generator', value: /Drupal/i }],
  },
  {
    name: 'Ghost',
    category: 'CMS',
    meta: [{ name: 'generator', value: /^Ghost/i }],
    body: [/ghost-content/],
  },
  { name: 'Contentful', category: 'Headless CMS', script: [/cdn\.contentful\.com/i] },
  { name: 'Sanity', category: 'Headless CMS', script: [/cdn\.sanity\.io/i] },
  { name: 'Strapi', category: 'Headless CMS', body: [/strapi\.io|powered by strapi/i] },

  // Frameworks
  {
    name: 'Next.js',
    category: 'JS Framework',
    body: [/__NEXT_DATA__|_next\/static/],
    header: [{ name: 'x-nextjs-cache' }],
  },
  { name: 'Nuxt', category: 'JS Framework', body: [/__NUXT__|_nuxt\//] },
  {
    name: 'React',
    category: 'JS Framework',
    body: [/data-reactroot|data-reactid|__REACT_DEVTOOLS_GLOBAL_HOOK__/],
  },
  { name: 'Vue.js', category: 'JS Framework', body: [/data-v-[0-9a-f]{8}|__VUE__/] },
  { name: 'Svelte', category: 'JS Framework', body: [/svelte-/] },
  { name: 'Angular', category: 'JS Framework', body: [/ng-version=|ng-app=/] },
  { name: 'Astro', category: 'JS Framework', body: [/astro-island|data-astro-cid-/] },
  { name: 'Remix', category: 'JS Framework', body: [/__remixContext|window\.__remixManifest/] },
  { name: 'Gatsby', category: 'JS Framework', body: [/__gatsby|gatsby-image/] },

  // Ecommerce
  { name: 'WooCommerce', category: 'Ecommerce', body: [/wc-block|woocommerce/i] },
  { name: 'Magento', category: 'Ecommerce', body: [/Mage\.Cookies|magento|mage\/[a-z]+/i] },
  { name: 'BigCommerce', category: 'Ecommerce', body: [/bigcommerce\.com|stencilUtils/] },

  // Analytics & ad tech
  {
    name: 'Google Analytics',
    category: 'Analytics',
    script: [/google-analytics\.com\/(analytics|ga)\.js|googletagmanager\.com\/gtag\/js\?id=UA-/],
    global: [/gtag\(\s*['"]config['"],\s*['"]UA-/],
  },
  {
    name: 'Google Analytics 4',
    category: 'Analytics',
    script: [/googletagmanager\.com\/gtag\/js\?id=G-/],
    global: [/gtag\(\s*['"]config['"],\s*['"]G-/],
  },
  { name: 'Google Tag Manager', category: 'Tag Manager', script: [/googletagmanager\.com\/gtm\.js/] },
  {
    name: 'Google Ads',
    category: 'Advertising',
    script: [/googletagmanager\.com\/gtag\/js\?id=AW-/],
    body: [/AW-\d+/],
  },
  {
    name: 'Meta Pixel',
    category: 'Advertising',
    body: [/connect\.facebook\.net\/en_US\/fbevents\.js|fbq\('init'/],
  },
  { name: 'LinkedIn Insight', category: 'Advertising', script: [/snap\.licdn\.com\/li\.lms-analytics/] },
  { name: 'TikTok Pixel', category: 'Advertising', script: [/analytics\.tiktok\.com\/i18n\/pixel/] },
  { name: 'Hotjar', category: 'Analytics', script: [/static\.hotjar\.com/] },
  { name: 'Mixpanel', category: 'Analytics', script: [/cdn\.mxpnl\.com|mixpanel\.com\/site_media/] },
  { name: 'Amplitude', category: 'Analytics', script: [/cdn\.amplitude\.com/] },
  { name: 'Segment', category: 'Analytics', script: [/cdn\.segment\.com\/analytics\.js/] },
  { name: 'Plausible', category: 'Analytics', script: [/plausible\.io\/js\/script\.js/] },
  { name: 'Microsoft Clarity', category: 'Analytics', script: [/clarity\.ms\/tag/] },

  // Email marketing / lead capture
  {
    name: 'HubSpot',
    category: 'Marketing Automation',
    script: [/js\.hs-scripts\.com|js\.hubspot\.com/],
    body: [/hsforms\.net|hsforms\.com/],
  },
  {
    name: 'Mailchimp',
    category: 'Marketing Automation',
    body: [/list-manage\.com|chimpstatic\.com|mailchimp/i],
  },
  { name: 'Klaviyo', category: 'Marketing Automation', script: [/static\.klaviyo\.com/] },
  { name: 'Intercom', category: 'Live Chat', script: [/widget\.intercom\.io/], global: [/window\.Intercom/] },
  { name: 'Drift', category: 'Live Chat', script: [/js\.driftt\.com/] },
  { name: 'Crisp', category: 'Live Chat', script: [/client\.crisp\.chat/] },
  { name: 'Tawk.to', category: 'Live Chat', script: [/embed\.tawk\.to/] },
  { name: 'Zendesk', category: 'Live Chat', script: [/static\.zdassets\.com\/ekr/] },
  { name: 'Calendly', category: 'Scheduling', script: [/assets\.calendly\.com|calendly\.com\/embed/] },

  // CDN / hosting (header-driven)
  {
    name: 'Cloudflare',
    category: 'CDN',
    header: [{ name: 'cf-ray' }, { name: 'server', value: /cloudflare/i }],
  },
  {
    name: 'Vercel',
    category: 'Hosting',
    header: [{ name: 'x-vercel-id' }, { name: 'server', value: /Vercel/i }],
  },
  {
    name: 'Netlify',
    category: 'Hosting',
    header: [{ name: 'x-nf-request-id' }, { name: 'server', value: /Netlify/i }],
  },
  {
    name: 'AWS CloudFront',
    category: 'CDN',
    header: [{ name: 'x-amz-cf-id' }, { name: 'via', value: /CloudFront/i }],
  },
  { name: 'GitHub Pages', category: 'Hosting', header: [{ name: 'server', value: /^GitHub\.com/i }] },
  {
    name: 'Fastly',
    category: 'CDN',
    header: [{ name: 'x-served-by', value: /cache-/i }, { name: 'x-fastly-request-id' }],
  },
  { name: 'Akamai', category: 'CDN', header: [{ name: 'x-akamai-transformed' }] },

  // Web servers
  { name: 'nginx', category: 'Web Server', header: [{ name: 'server', value: /^nginx/i }] },
  { name: 'Apache', category: 'Web Server', header: [{ name: 'server', value: /^Apache/i }] },
  { name: 'LiteSpeed', category: 'Web Server', header: [{ name: 'server', value: /LiteSpeed/i }] },
  { name: 'Caddy', category: 'Web Server', header: [{ name: 'server', value: /^Caddy/i }] },

  // Payments
  { name: 'Stripe', category: 'Payments', script: [/js\.stripe\.com/], global: [/Stripe\(/] },
  { name: 'PayPal', category: 'Payments', script: [/paypal\.com\/sdk\/js|paypalobjects\.com/] },
  { name: 'Razorpay', category: 'Payments', script: [/checkout\.razorpay\.com/] },

  // Misc B2B-relevant
  { name: 'Intercom Messenger', category: 'Live Chat', global: [/window\.intercomSettings/] },
  { name: 'Tidio', category: 'Live Chat', script: [/code\.tidio\.co/] },
  { name: 'Olark', category: 'Live Chat', script: [/static\.olark\.com/] },
  { name: 'Zoho Forms', category: 'Forms', script: [/forms\.zohopublic\.com/] },
  { name: 'Typeform', category: 'Forms', script: [/embed\.typeform\.com/] },
];

function matchHeader(headers, fingerprintHeader) {
  if (!headers || !fingerprintHeader) return false;
  const lowered = {};
  for (const [k, v] of Object.entries(headers)) lowered[k.toLowerCase()] = String(v || '');
  const value = lowered[fingerprintHeader.name.toLowerCase()];
  if (value === undefined) return false;
  if (!fingerprintHeader.value) return true;
  return fingerprintHeader.value.test(value);
}

function matchMeta(metas, fp) {
  return metas.some((m) => {
    if (!m) return false;
    if (m.name.toLowerCase() !== fp.name.toLowerCase()) return false;
    if (!fp.value) return true;
    return fp.value.test(m.content || '');
  });
}

function detectFromHtml({ html = '', headers = {} } = {}) {
  const detections = new Map(); // name -> {category, evidence}
  const root = html ? parse(html, { lowerCaseTagName: false }) : null;
  const scriptSrcs = root ? root.querySelectorAll('script[src]').map((s) => s.getAttribute('src') || '') : [];
  const inlineScripts = root ? root.querySelectorAll('script:not([src])').map((s) => s.text || '') : [];
  const metas = root
    ? root.querySelectorAll('meta').map((m) => ({
        name: (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase(),
        content: m.getAttribute('content') || '',
      }))
    : [];

  function add(name, category, evidence) {
    if (!detections.has(name)) detections.set(name, { name, category, evidence });
  }

  for (const fp of FINGERPRINTS) {
    if (fp.header) {
      for (const h of fp.header) {
        if (matchHeader(headers, h)) {
          add(fp.name, fp.category, `header:${h.name}`);
          break;
        }
      }
    }
    if (fp.meta && root) {
      if (matchMeta(metas, fp.meta[0] || {})) add(fp.name, fp.category, 'meta');
    }
    if (fp.script && scriptSrcs.length) {
      const hit = fp.script.find((re) => scriptSrcs.some((src) => re.test(src)));
      if (hit) add(fp.name, fp.category, 'script-src');
    }
    if (fp.body && html) {
      const hit = fp.body.find((re) => re.test(html));
      if (hit) add(fp.name, fp.category, 'body-text');
    }
    if (fp.global && inlineScripts.length) {
      const hit = fp.global.find((re) => inlineScripts.some((s) => re.test(s)));
      if (hit) add(fp.name, fp.category, 'js-global');
    }
  }

  return Array.from(detections.values());
}

module.exports = { detectFromHtml, FINGERPRINTS };
