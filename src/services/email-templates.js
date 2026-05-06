/**
 * Email Templates
 * Dynamic templates for different email types
 */

const templates = {
  /**
   * Signup Verification Email Template
   */
  signupVerification: ({
    name,
    email,
    verificationUrl,
    token,
    expiryMinutes = 30,
    organizationName = 'ConnectCMS'
  }) => ({
    subject: `Welcome to ${organizationName} - Verify Your Email`,
    text: `
Hello ${name},

Thank you for signing up with ${organizationName}!

Please verify your email by clicking the link below:
${verificationUrl}

This link will expire in ${expiryMinutes} minutes.

Verification Code: ${token}

If you didn't create this account, please ignore this email.

Best regards,
${organizationName} Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #007bff; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .footer { background: #f0f0f0; padding: 10px; text-align: center; font-size: 12px; }
    .button { 
      display: inline-block; 
      background: #007bff; 
      color: white; 
      padding: 12px 30px; 
      text-decoration: none; 
      border-radius: 5px;
      margin: 20px 0;
    }
    .code { 
      background: #e9ecef; 
      padding: 10px; 
      border-radius: 3px; 
      font-family: monospace;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Welcome to ${organizationName}!</h2>
    </div>
    <div class="content">
      <p>Hello <strong>${name}</strong>,</p>
      
      <p>Thank you for signing up with ${organizationName}. We're excited to have you on board!</p>
      
      <p>Please verify your email address by clicking the button below:</p>
      
      <a href="${verificationUrl}" class="button">Verify Email Address</a>
      
      <p>Or copy and paste this verification code:</p>
      <div class="code">${token}</div>
      
      <p><small>This link will expire in ${expiryMinutes} minutes.</small></p>
      
      <p>If you didn't create this account, please ignore this email.</p>
      
      <p>Best regards,<br><strong>${organizationName} Team</strong></p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${organizationName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim()
  }),

  /**
   * User Invitation Email Template
   */
  userInvitation: ({
    name,
    email,
    inviterName,
    organizationName,
    generatedPassword,
    loginUrl = 'https://app.example.com/login',
    temporaryPassword = true
  }) => ({
    subject: `You've been invited to ${organizationName}`,
    text: `
Hello ${name},

${inviterName} has invited you to join ${organizationName} on ConnectCMS!

Your Login Credentials:
Email: ${email}
${temporaryPassword ? `Password: ${generatedPassword}\n\nPlease change this password after your first login.\n` : ''}

Login here: ${loginUrl}

We look forward to working with you!

Best regards,
${organizationName} Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .footer { background: #f0f0f0; padding: 10px; text-align: center; font-size: 12px; }
    .credentials { 
      background: #fff3cd; 
      border: 1px solid #ffc107; 
      padding: 15px; 
      border-radius: 5px;
      margin: 20px 0;
    }
    .button { 
      display: inline-block; 
      background: #28a745; 
      color: white; 
      padding: 12px 30px; 
      text-decoration: none; 
      border-radius: 5px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>You've been invited!</h2>
    </div>
    <div class="content">
      <p>Hello <strong>${name}</strong>,</p>
      
      <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on ConnectCMS!</p>
      
      <div class="credentials">
        <strong>Your Login Credentials:</strong>
        <p>
          Email: <code>${email}</code><br>
          ${temporaryPassword ? `Password: <code>${generatedPassword}</code><br><small style="color: #d9534f;">Please change this password after your first login.</small>` : ''}
        </p>
      </div>
      
      <a href="${loginUrl}" class="button">Login to ConnectCMS</a>
      
      <p>If you have any questions, please contact ${inviterName} or our support team.</p>
      
      <p>Best regards,<br><strong>${organizationName} Team</strong></p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ConnectCMS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim()
  }),

  /**
   * Password Reset Email Template
   */
  passwordReset: ({
    name,
    resetUrl,
    token,
    expiryMinutes = 60,
    organizationName = 'ConnectCMS'
  }) => ({
    subject: `Password Reset Request - ${organizationName}`,
    text: `
Hello ${name},

We received a request to reset your password. Click the link below to reset it:

${resetUrl}

This link will expire in ${expiryMinutes} minutes.

Reset Code: ${token}

If you didn't request this, please ignore this email. Your password won't change until you confirm the reset.

Best regards,
${organizationName} Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc3545; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .footer { background: #f0f0f0; padding: 10px; text-align: center; font-size: 12px; }
    .button { 
      display: inline-block; 
      background: #dc3545; 
      color: white; 
      padding: 12px 30px; 
      text-decoration: none; 
      border-radius: 5px;
      margin: 20px 0;
    }
    .code { 
      background: #e9ecef; 
      padding: 10px; 
      border-radius: 3px; 
      font-family: monospace;
      word-break: break-all;
    }
    .warning { color: #d9534f; font-size: 12px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Password Reset Request</h2>
    </div>
    <div class="content">
      <p>Hello <strong>${name}</strong>,</p>
      
      <p>We received a request to reset your password for your ${organizationName} account.</p>
      
      <p>Click the button below to reset your password:</p>
      
      <a href="${resetUrl}" class="button">Reset Password</a>
      
      <p>Or copy and paste this code:</p>
      <div class="code">${token}</div>
      
      <p><small>This link will expire in ${expiryMinutes} minutes.</small></p>
      
      <p class="warning">If you didn't request this, please ignore this email. Your password won't change until you confirm the reset.</p>
      
      <p>Best regards,<br><strong>${organizationName} Team</strong></p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${organizationName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim()
  })
};

module.exports = templates;
