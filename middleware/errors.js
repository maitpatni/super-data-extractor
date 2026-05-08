'use strict';

const { AppError } = require('../lib/errors');
const { logger } = require('../lib/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.meta && Object.keys(err.meta).length ? { meta: err.meta } : {}),
      },
      requestId: req.id,
    });
  }
  logger.error({ err: { message: err.message, stack: err.stack }, requestId: req.id }, 'unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
    requestId: req.id,
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    requestId: req.id,
  });
}

module.exports = { errorHandler, notFoundHandler };
