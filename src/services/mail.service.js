const emailTemplates = require('./email-templates');

/**
 * Mail Service
 * Handles sending emails for various events
 * Supports both console logging (development) and SMTP (production)
 */
class MailService {
  constructor() {
    // Initialize nodemailer for production use
    // For now, we'll support console logging and SMTP
    this.smtpEnabled = process.env.SMTP_HOST ? true : false;
    
    if (this.smtpEnabled) {
      const nodemailer = require('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    }
  }

  /**
   * Send signup verification email
   */
  async sendSignupVerification(to, code, url, { name = 'User', organizationName = 'ConnectCMS' } = {}) {
    const template = emailTemplates.signupVerification({
      name,
      email: to,
      verificationUrl: url,
      token: code,
      expiryMinutes: process.env.SIGNUP_TOKEN_EXPIRES_MINUTES || 30,
      organizationName
    });

    return this._sendEmail(to, template);
  }

  /**
   * Send user invitation email
   */
  async sendInvitation(to, { name = 'User', inviterName = 'Admin', organizationName = 'ConnectCMS', generatedPassword, loginUrl }) {
    const template = emailTemplates.userInvitation({
      name,
      email: to,
      inviterName,
      organizationName,
      generatedPassword,
      loginUrl: loginUrl || process.env.APP_URL || 'https://app.example.com/login',
      temporaryPassword: !!generatedPassword
    });

    return this._sendEmail(to, template);
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(to, token, resetUrl, { name = 'User', organizationName = 'ConnectCMS' } = {}) {
    const template = emailTemplates.passwordReset({
      name,
      resetUrl,
      token,
      expiryMinutes: 60,
      organizationName
    });

    return this._sendEmail(to, template);
  }

  /**
   * Internal method to send email
   */
  async _sendEmail(to, { subject, text, html }) {
    try {
      if (this.smtpEnabled) {
        // Send via SMTP
        const info = await this.transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@example.com',
          to,
          subject,
          text,
          html
        });

        console.log(`[MAIL] Sent to ${to} - ${subject}`, { messageId: info.messageId });
        return { success: true, messageId: info.messageId };
      } else {
        // Development: Log to console
        console.log(`
╔════════════════════════════════════════════════════════╗
║                   EMAIL PREVIEW                        ║
╠════════════════════════════════════════════════════════╣
║ TO:      ${to.padEnd(50)}║
║ SUBJECT: ${subject.padEnd(50)}║
╠════════════════════════════════════════════════════════╣
║ TEXT:                                                  ║
╠════════════════════════════════════════════════════════╣
${text.split('\n').map(line => `║ ${line.padEnd(50)}║`).join('\n')}
╚════════════════════════════════════════════════════════╝
        `);
        return { success: true, development: true };
      }
    } catch (err) {
      console.error(`[MAIL] Error sending email to ${to}:`, err.message);
      throw err;
    }
  }
}

module.exports = new MailService();
