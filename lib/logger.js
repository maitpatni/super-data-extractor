'use strict';

const pino = require('pino');
const { config } = require('./config');

const redactPaths = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.googleMapsApiKey',
  '*.linkedinApiKey',
  '*.apiKey',
  '*.token',
];

const logger = pino({
  level: config.logLevel,
  base: { service: 'super-data-extractor' },
  redact: config.logRedactSecrets ? { paths: redactPaths, censor: '[REDACTED]' } : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = { logger };
