/**
 * Environment Variables Validator
 * Ensures all required environment variables are set on startup
 */
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
    'SMTP_REJECT_UNAUTHORIZED': 'true'
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

  console.log('[ENV] Environment variables validated');
}

module.exports = { validateEnv };
