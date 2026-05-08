const emailTemplates = require("./email-templates");

/**
 * Mail Service
 * Handles sending emails for various events
 * Supports both console logging (development) and SMTP (production)
 */
class MailService {
  constructor() {
    this.smtpEnabled = Boolean(process.env.SMTP_HOST);
    this.customTemplates = this.parseCustomTemplates();
    this.defaultFrom = process.env.SMTP_FROM || "noreply@example.com";

    if (this.smtpEnabled) {
      const nodemailer = require("nodemailer");
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        },
        tls: {
          rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false"
        }
      });
    }
  }

  parseCustomTemplates() {
    const raw = process.env.MAIL_TEMPLATES_JSON;
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      console.error("[MAIL] Failed to parse MAIL_TEMPLATES_JSON:", err.message);
      return {};
    }
  }

  /**
   * Send signup verification email
   */
  async sendSignupVerification(to, code, url, { name = "User", organizationName = "ConnectCMS" } = {}) {
    return this.sendTemplate("signupVerification", to, {
      name,
      email: to,
      verificationUrl: url,
      token: code,
      expiryMinutes: process.env.SIGNUP_TOKEN_EXPIRES_MINUTES || 30,
      organizationName
    });
  }

  /**
   * Send user invitation email
   */
  async sendInvitation(to, { name = "User", inviterName = "Admin", organizationName = "ConnectCMS", generatedPassword, loginUrl }) {
    return this.sendTemplate("userInvitation", to, {
      name,
      email: to,
      inviterName,
      organizationName,
      generatedPassword,
      loginUrl: loginUrl || process.env.APP_URL || "https://app.example.com/login",
      temporaryPassword: !!generatedPassword
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(to, token, resetUrl, { name = "User", organizationName = "ConnectCMS" } = {}) {
    return this.sendTemplate("passwordReset", to, {
      name,
      resetUrl,
      token,
      expiryMinutes: 60,
      organizationName
    });
  }

  async sendTemplate(templateName, to, payload = {}) {
    const customTemplate = this.customTemplates[templateName];
    const template = customTemplate
      ? emailTemplates.fromDynamicTemplate(customTemplate, payload)
      : emailTemplates.resolveTemplate(templateName, payload);
    return this._sendEmail(to, template);
  }

  async sendTestMail(to, auth = {}) {
    const payload = {
      name: auth.name || "Admin",
      organizationName: process.env.APP_NAME || "ConnectCMS",
      generatedAt: new Date().toISOString(),
      tenantid: auth.tenantid || "",
      branchid: auth.branchid || ""
    };

    return this.sendTemplate("mailTest", to, payload);
  }

  async verifySmtpConnection() {
    if (!this.smtpEnabled) {
      return { enabled: false, verified: false, reason: "SMTP_HOST not configured" };
    }
    try {
      await this.transporter.verify();
      return { enabled: true, verified: true };
    } catch (err) {
      return { enabled: true, verified: false, reason: err.message };
    }
  }

  /**
   * Internal method to send email
   */
  async _sendEmail(to, { subject, text, html }) {
    try {
      if (this.smtpEnabled) {
        // Send via SMTP
        const info = await this.transporter.sendMail({
          from: this.defaultFrom,
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
