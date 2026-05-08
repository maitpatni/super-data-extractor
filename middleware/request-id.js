'use strict';

const crypto = require('crypto');

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

module.exports = { requestId };
