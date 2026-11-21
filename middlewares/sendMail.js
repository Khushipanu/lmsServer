/*
  Email sending with automatic fallback. Every configured provider is tried
  in this order until one succeeds (EMAIL_PROVIDER=<name> moves one to the front):

  1. gmail  (GMAIL_SCRIPT_URL + GMAIL_SCRIPT_SECRET) — RECOMMENDED.
     A tiny Google Apps Script (server/scripts/gmail-relay.gs) deployed from
     your Gmail account. The server calls it over plain HTTPS, Google sends
     the mail from your Gmail. No SMTP, no domain, no third-party API key,
     works on Render free. Limit: ~100 emails/day on a free Gmail account.
  2. brevo  (BREVO_API_KEY + EMAIL_FROM)  — HTTPS API. Needs a verified sender.
  3. resend (RESEND_API_KEY + EMAIL_FROM) — HTTPS API. Needs a verified domain
     to email anyone but yourself.
  4. smtp   (SMTP_USER + SMTP_PASS, or legacy GMAIL + PASSWORD) — skipped in
     production unless EMAIL_PROVIDER=smtp, because Render's free plan blocks
     outgoing SMTP ports and it would only add a 15s wait before failing.

  Every request has a hard timeout so a stuck provider can never hang signup.
*/
import "../config/config.js";
import nodemailer from "nodemailer";
import { getClientUrl } from "../config/config.js";

const TIMEOUT_MS = 15000;
const APP_NAME = process.env.APP_NAME || "LMS";

const smtpUser = () => process.env.SMTP_USER || process.env.GMAIL;
const smtpPass = () => process.env.SMTP_PASS || process.env.PASSWORD;
const fromAddress = () => process.env.EMAIL_FROM || smtpUser();

const isProduction = process.env.NODE_ENV === "production";

const configured = {
  gmail: () => Boolean(process.env.GMAIL_SCRIPT_URL && process.env.GMAIL_SCRIPT_SECRET),
  brevo: () => Boolean(process.env.BREVO_API_KEY && fromAddress()),
  resend: () => Boolean(process.env.RESEND_API_KEY && fromAddress()),
  smtp: () => Boolean(smtpUser() && smtpPass()),
};

/** Providers to try, in order. */
export const getEmailProviders = () => {
  const forced = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  const order = ["gmail", "brevo", "resend", "smtp"];
  if (order.includes(forced)) order.unshift(...order.splice(order.indexOf(forced), 1));
  return order.filter((name) => {
    if (!configured[name]()) return false;
    if (name === "smtp" && isProduction && forced !== "smtp") return false;
    return true;
  });
};

/** Human-readable summary for /health, e.g. "gmail → brevo". */
export const getEmailProvider = () => getEmailProviders().join(" → ") || null;

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

const sendViaGmailScript = async ({ to, subject, html }) => {
  // Apps Script answers a POST with a redirect to the result; fetch follows it.
  const res = await fetchWithTimeout(process.env.GMAIL_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: process.env.GMAIL_SCRIPT_SECRET, to, subject, html, name: APP_NAME }),
    redirect: "follow",
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Gmail script: unexpected response (HTTP ${res.status}). Redeploy it with "Who has access: Anyone" and use the /exec URL.`
    );
  }
  if (!body.ok) throw new Error(`Gmail script: ${body.error || "send failed"}`);
  return body;
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

const senders = { gmail: sendViaGmailScript, brevo: sendViaBrevo, resend: sendViaResend, smtp: sendViaSmtp };

const deliver = async (message) => {
  const providers = getEmailProviders();
  if (!providers.length) throw new Error("No email provider configured");

  const errors = [];
  for (const name of providers) {
    try {
      const result = await senders[name](message);
      console.log(`📧 Email sent via ${name} to ${message.to}`);
      return result;
    } catch (err) {
      console.error(`⚠️  Email via ${name} failed: ${err.message}`);
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(`All email providers failed — ${errors.join(" | ")}`);
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
