const nodemailer = require("nodemailer");

let transporter;
let initializationAttempted = false;

function getTransporter() {
  if (initializationAttempted) return transporter;
  initializationAttempted = true;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn("Email service unconfigured; outbound emails are disabled");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  const mailer = getTransporter();
  if (!mailer) return false;
  try {
    await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    return true;
  } catch (error) {
    console.error("Email delivery failed:", error.message);
    return false;
  }
}

async function sendPasswordReset(user, token, baseUrl) {
  const resetBaseUrl = baseUrl || process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:8000";
  const resetUrl = new URL("/reset-password.html", resetBaseUrl);
  resetUrl.searchParams.set("token", token);
  return sendEmail({
    to: user.email,
    subject: "Reset your HireTrack 360 password",
    text: `Use this one-time link to reset your password. It expires in ${process.env.RESET_TOKEN_EXPIRES_MINUTES || 20} minutes: ${resetUrl}`,
    html: `<p>Use this one-time link to reset your HireTrack 360 password. It expires in ${process.env.RESET_TOKEN_EXPIRES_MINUTES || 20} minutes.</p><p><a href="${resetUrl}">Reset password</a></p>`
  });
}

async function sendInterviewEmail(user, details) {
  return sendEmail({
    to: user.email,
    subject: `Interview scheduled: ${details.jobTitle}`,
    text: `${details.company} scheduled an interview for ${details.jobTitle} at ${new Date(details.scheduledAt).toLocaleString()}.${details.meetingLink ? ` Meeting link: ${details.meetingLink}` : ""}`
  });
}

async function sendApplicationStatusEmail(user, details) {
  return sendEmail({
    to: user.email,
    subject: `Application update: ${details.jobTitle}`,
    text: `Your application for ${details.jobTitle} at ${details.company} moved to ${details.status}.`
  });
}

module.exports = { getTransporter, sendEmail, sendPasswordReset, sendInterviewEmail, sendApplicationStatusEmail };