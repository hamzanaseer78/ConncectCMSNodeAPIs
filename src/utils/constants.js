/**
 * Application Constants
 * Centralized configuration for application-wide constants
 */

const CONSTANTS = {
  // HTTP Status Codes
  STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500
  },

  // Security
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    HASH_ROUNDS: 10
  },

  // Token
  TOKEN: {
    SIGNUP_EXPIRES_MINUTES: 30,
    JWT_EXPIRES_DEFAULT: '7d',
    BEARER_PREFIX: 'Bearer '
  },

  // Pagination
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_PAGE_SIZE: 25,
    MAX_PAGE_SIZE: 100
  },

  // Request
  REQUEST: {
    MAX_PAYLOAD_SIZE: '10kb',
    TIMEOUT_MS: 30000
  },

  // Errors
  ERRORS: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    TOKEN_EXPIRED: 'Token has expired',
    TOKEN_INVALID: 'Invalid token',
    USER_NOT_FOUND: 'User not found',
    RECORD_NOT_FOUND: 'Record not found',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    VALIDATION_FAILED: 'Validation failed'
  },

  // Logs
  LOG_LEVELS: {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
  }
};

module.exports = CONSTANTS;
