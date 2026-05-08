'use strict';

const crypto = require('crypto');
const database = require('../database');
const { logger } = require('../lib/logger');
const { safeFetch } = require('../lib/ssrf');

function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function deliver(userId, event, payload) {
  const list = database.webhooks.listEnabledFor(userId);
  if (!list.length) return;
  const body = JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() });
  await Promise.allSettled(
    list.map(async (wh) => {
      const events = String(wh.events || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (events.length && !events.includes(event) && !events.includes('*')) return;
      const signature = sign(wh.secret, body);
      try {
        const r = await safeFetch(wh.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-sde-event': event,
            'x-sde-signature': `sha256=${signature}`,
            'user-agent': 'SuperDataExtractor/2.0',
          },
          timeoutMs: 6000,
          maxBytes: 16 * 1024,
          maxRedirects: 1,
        });
        database.webhooks.recordDelivery(wh.id, r.status);
      } catch (err) {
        database.webhooks.recordDelivery(wh.id, 0);
        logger.warn({ err: err.message, webhookId: wh.id }, 'webhook delivery failed');
      }
    }),
  );
}

module.exports = { deliver, sign };
