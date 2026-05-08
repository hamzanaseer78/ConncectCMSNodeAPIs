const nodemailer = require("nodemailer");

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM
  );
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

async function sendMailSafe(message) {
  if (!isConfigured()) return { sent: false, reason: "SMTP not configured" };
  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      ...message
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  isConfigured,
  sendMailSafe
};

