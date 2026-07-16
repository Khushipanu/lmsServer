/*
 email → Ye us insaan ka receiver email address hai jisko mail bhejna hai.
 Example: "friend@gmail.com"

 subject → Ye email ka title / heading hoga.
 Example: "Your OTP Code"

 data → Ye ek object hai jisme extra details hoti hain jo mail ke andar dikhengi.
 Example: { name: "Khushi", otp: 123456 }

 data.name → receiver ka naam (mail me "Hello Khushi" aayega)
 data.otp → OTP number jo mail me show hoga

 NOTE: Sends via Brevo's HTTP transactional email API instead of SMTP.
 Gmail SMTP hung indefinitely on Render (outbound SMTP silently
 dropped), so this uses a plain HTTPS call instead, which isn't
 affected by that. BREVO_API_KEY + EMAIL_FROM (a Brevo-verified
 single sender) must be set wherever this runs, including Render's
 dashboard (Render env vars are separate from local .env).
*/

import dotenv from "dotenv";
dotenv.config();

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const brandWrapper = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f0fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background-color:#f1f0fb;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(79,70,229,0.12);">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">LMS &middot; Learning Management System</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#1f2937;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f8f7ff;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const sendViaBrevo = async ({ to, subject, html }) => {
    if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
        throw new Error("Brevo credentials not configured");
    }

    const response = await fetch(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
            sender: { email: process.env.EMAIL_FROM, name: "LMS" },
            to: [{ email: to }],
            subject,
            htmlContent: html,
        }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = result?.message || `Brevo request failed with status ${response.status}`;
        throw new Error(message);
    }

    return result;
};

const sendMail = async (email, subject, data) => {
    console.log("Attempting to send email to:", email);

    const body = `
      <h1 style="margin:0 0 12px;color:#312e81;font-size:22px;">Verify your email</h1>
      <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">Hello ${data.name}, use the code below to finish creating your account. It expires in 15 minutes.</p>
      <div style="margin:0 auto 20px;text-align:center;">
        <span style="display:inline-block;padding:14px 28px;background:#eef2ff;color:#4338ca;font-size:28px;font-weight:700;letter-spacing:6px;border-radius:10px;">${data.otp}</span>
      </div>
    `;

    const result = await sendViaBrevo({
        to: email,
        subject,
        html: brandWrapper("OTP Verification", body),
    });

    console.log("Email sent successfully:", result?.messageId);
    return result;
};

export const sendForgotMail = async (subject, data) => {
    const resetUrl = `${process.env.CLIENT_URL || process.env.frontendurl || "http://localhost:5173"}/reset-password/${data.token}`;

    const body = `
      <h1 style="margin:0 0 12px;color:#312e81;font-size:22px;">Reset your password</h1>
      <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 15 minutes.</p>
      <div style="text-align:center;margin-bottom:8px;">
        <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:10px;">Reset Password</a>
      </div>
    `;

    return sendViaBrevo({
        to: data.email,
        subject,
        html: brandWrapper("Reset Your Password", body),
    });
};

export default sendMail;
