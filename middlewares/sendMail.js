/*
  Email sending with three interchangeable providers. The first configured
  one wins (or force one with EMAIL_PROVIDER=brevo|resend|smtp):

  1. Brevo  (BREVO_API_KEY + EMAIL_FROM)  — HTTPS API, works on Render free.
  2. Resend (RESEND_API_KEY + EMAIL_FROM) — HTTPS API, works on Render free.
     Note: until you verify a domain in Resend you can only send to your own
     Resend account email.
  3. SMTP   (SMTP_USER + SMTP_PASS [+ SMTP_HOST/SMTP_PORT], or the legacy
     GMAIL + PASSWORD vars) — Render's FREE plan blocks outgoing SMTP ports
     (25/465/587), so this only works locally or on a paid instance.

  Every request has a hard timeout so a stuck provider can never hang a
  signup request forever (the old cause of "request pending" on Render).
*/
import "../config/config.js";
import nodemailer from "nodemailer";
import { getClientUrl } from "../config/config.js";

const TIMEOUT_MS = 15000;
const APP_NAME = process.env.APP_NAME || "LMS";

const smtpUser = () => process.env.SMTP_USER || process.env.GMAIL;
const smtpPass = () => process.env.SMTP_PASS || process.env.PASSWORD;
const fromAddress = () => process.env.EMAIL_FROM || smtpUser();

export const getEmailProvider = () => {
  const forced = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (forced) return forced;
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  if (smtpUser() && smtpPass()) return "smtp";
  return null;
};

const fetchWithTimeout = async (url, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Email provider timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const sendViaBrevo = async ({ to, subject, html }) => {
  const res = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: fromAddress(), name: APP_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo: ${body?.message || res.status}`);
  return body;
};

const sendViaResend = async ({ to, subject, html }) => {
  const res = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${APP_NAME} <${fromAddress()}>`,
      to: [to],
      subject,
      html,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend: ${body?.message || res.status}`);
  return body;
};

let transporter;
const sendViaSmtp = async ({ to, subject, html }) => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: smtpUser(), pass: smtpPass() },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
  }
  return transporter.sendMail({ from: `${APP_NAME} <${fromAddress()}>`, to, subject, html });
};

const deliver = async (message) => {
  const provider = getEmailProvider();
  if (!provider) throw new Error("No email provider configured");
  if (!fromAddress()) throw new Error("EMAIL_FROM is not set");

  const senders = { brevo: sendViaBrevo, resend: sendViaResend, smtp: sendViaSmtp };
  const send = senders[provider];
  if (!send) throw new Error(`Unknown EMAIL_PROVIDER "${provider}"`);

  const result = await send(message);
  console.log(`📧 Email sent via ${provider} to ${message.to}`);
  return result;
};

const escapeHtml = (str = "") =>
  String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const layout = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr><td style="background:#0f766e;padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;">${APP_NAME}</span>
        </td></tr>
        <tr><td style="padding:32px;color:#1c1917;">${bodyHtml}</td></tr>
        <tr><td style="padding:18px 32px;background:#fafaf9;text-align:center;">
          <p style="margin:0;color:#a8a29e;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

/** Sends the signup OTP. data = { name, otp } */
const sendMail = async (email, subject, data) => {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;">Verify your email</h1>
    <p style="margin:0 0 20px;color:#57534e;font-size:15px;line-height:1.6;">Hi ${escapeHtml(data.name)}, use this code to finish creating your account. It expires in 15 minutes.</p>
    <div style="text-align:center;margin:0 0 8px;">
      <span style="display:inline-block;padding:14px 28px;background:#f0fdfa;color:#0f766e;font-size:30px;font-weight:700;letter-spacing:8px;border-radius:12px;">${escapeHtml(data.otp)}</span>
    </div>`;
  return deliver({ to: email, subject, html: layout("Verify your email", body) });
};

/** Sends the password-reset link. data = { email, token } */
export const sendForgotMail = async (subject, data) => {
  const resetUrl = `${getClientUrl()}/reset-password/${data.token}`;
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;">Reset your password</h1>
    <p style="margin:0 0 24px;color:#57534e;font-size:15px;line-height:1.6;">We received a request to reset your password. The link below expires in 15 minutes.</p>
    <div style="text-align:center;margin-bottom:16px;">
      <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:10px;">Reset password</a>
    </div>
    <p style="margin:0;color:#a8a29e;font-size:12px;word-break:break-all;">Or open: ${resetUrl}</p>`;
  return deliver({ to: data.email, subject, html: layout("Reset your password", body) });
};

export default sendMail;
