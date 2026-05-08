'use strict';

class AppError extends Error {
  constructor(code, message, status = 400, meta = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
}

class ValidationError extends AppError {
  constructor(message, meta) {
    super('VALIDATION', message, 400, meta);
    this.name = 'ValidationError';
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication required.') {
    super('AUTH', message, 401);
    this.name = 'AuthError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden.') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded.', retryAfter) {
    super('RATE_LIMIT', message, 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

class UpstreamError extends AppError {
  constructor(provider, message, status = 502, meta = {}) {
    super('UPSTREAM', `${provider}: ${message}`, status, { provider, ...meta });
    this.name = 'UpstreamError';
  }
}

class SpendLimitError extends AppError {
  constructor(message = 'Daily spend limit reached.', meta = {}) {
    super('SPEND_LIMIT', message, 402, meta);
    this.name = 'SpendLimitError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UpstreamError,
  SpendLimitError,
};
