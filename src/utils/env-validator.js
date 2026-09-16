/**
 * Environment Variables Validator
 * Ensures all required environment variables are set on startup
 */
const logger = require("./logger");

function validateEnv() {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'NODE_ENV'
  ];

  const optional = {
    'PORT': '3000',
    'JWT_EXPIRES_IN': '7d',
    'SIGNUP_TOKEN_EXPIRES_MINUTES': '30',
    'NODE_ENV': 'development',
    'SMTP_PORT': '587',
    'SMTP_SECURE': 'false',
    'SMTP_FROM': 'noreply@example.com',
    'SMTP_REJECT_UNAUTHORIZED': 'true',
    'SEQ_APPLICATION_NAME': 'ConnectCMS-API',
    'SEQ_LOGGING_ENABLED': 'true',
    'SEQ_FLUSH_INTERVAL_MS': '2000',
    'SEQ_BATCH_SIZE': '50'
  };

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Set defaults for optional variables
  Object.entries(optional).forEach(([key, defaultValue]) => {
    if (!process.env[key]) {
      process.env[key] = defaultValue;
    }
  });

  logger.info("Environment variables validated", {
    SeqLoggingEnabled: logger.isSeqEnabled(),
    SeqServerUrl: process.env.SEQ_SERVER_URL ? "(set)" : null
  });
}

module.exports = { validateEnv };
