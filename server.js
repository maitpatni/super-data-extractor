'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');

const { config, assertProductionReady } = require('./lib/config');
const { logger } = require('./lib/logger');
const { requestId } = require('./middleware/request-id');
const { errorHandler, notFoundHandler } = require('./middleware/errors');
const { requireSession } = require('./middleware/auth');
const database = require('./database'); // ensure schema + migrations apply at startup
const jobsService = require('./services/jobs');

// Fail fast on production misconfiguration.
const startupErrors = assertProductionReady();
if (startupErrors.length) {
  if (config.isProd) {
    for (const e of startupErrors) logger.fatal(e);
    process.exit(1);
  } else {
    for (const e of startupErrors) logger.warn(`[startup] ${e}`);
  }
}

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);

app.use(requestId);
app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({ requestId: req.id }),
    serializers: {
      req: (r) => ({ id: r.id, method: r.method, url: r.url, remoteAddress: r.remoteAddress }),
      res: (r) => ({ statusCode: r.statusCode }),
    },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);

// Security headers. Allow inline styles for the existing landing/CSS.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts:
      config.forceHttps && config.isProd
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  }),
);

// CORS: deny by default; if ALLOWED_ORIGIN is set, only those origins.
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin
      if (!config.allowedOrigins.length) return cb(null, false);
      cb(null, config.allowedOrigins.includes(origin));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '5mb' }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Health and SSRF-hardened utility
app.use('/api', require('./routes/health'));

// Auth + session-bound APIs
app.use('/api/auth', require('./routes/auth'));
app.use('/api/maps', require('./routes/maps'));
app.use('/api/google-maps', require('./routes/maps')); // back-compat alias
app.use('/api/linkedin', require('./routes/linkedin'));
app.use('/api/history', require('./routes/history'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/export', require('./routes/export'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/api-keys', require('./routes/api-keys'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/analytics', require('./routes/analytics'));

// Activity (legacy single-route)
app.get('/api/activity', requireSession, (req, res) => {
  res.json(database.getActivityLogsByUser(req.auth.userId, 10));
});

// Public REST API
app.use('/api/v1', require('./routes/v1'));

// Frontend pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/landing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get(['/app', '/app/*'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use('/api', notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  const server = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host, env: config.nodeEnv }, 'Super Data Extractor up');
    // Resume any in-flight jobs from before restart
    try {
      jobsService.resumeAll();
    } catch (e) {
      logger.warn({ err: e.message }, 'job resume failed');
    }
  });
  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
