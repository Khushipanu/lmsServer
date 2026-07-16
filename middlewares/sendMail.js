import dotenv from "dotenv";
import { Resend } from 'resend';

dotenv.config();

// Resend API Initialize
// Note: Vercel/Render ke Environment Variables mein RESEND_API_KEY zaroor add karein
const resend = new Resend(process.env.RESEND_API_KEY);

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

export const sendMail = async (email, subject, data) => {
    console.log("Attempting to send email to:", email);

    const body = `
      <h1 style="margin:0 0 12px;color:#312e81;font-size:22px;">Verify your email</h1>
      <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">Hello ${data.name}, use the code below to finish creating your account. It expires in 15 minutes.</p>
      <div style="margin:0 auto 20px;text-align:center;">
        <span style="display:inline-block;padding:14px 28px;background:#eef2ff;color:#4338ca;font-size:28px;font-weight:700;letter-spacing:6px;border-radius:10px;">${data.otp}</span>
      </div>
    `;

    try {
        const response = await resend.emails.send({
            from: 'LMS <onboarding@resend.dev>', // Agar domain verify nahi kiya hai, toh yahi use karein
            to: [email],
            subject: subject,
            html: brandWrapper("OTP Verification", body),
        });
        
        console.log("Email sent successfully:", response.id);
        return response;
    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error("Failed to send email");
    }
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

    try {
        const response = await resend.emails.send({
            from: 'LMS <onboarding@resend.dev>',
            to: [data.email],
            subject: subject,
            html: brandWrapper("Reset Your Password", body),
        });
        
        return response;
    } catch (error) {
        console.error("Error sending forgot password email:", error);
        throw new Error("Failed to send reset email");
    }
};

export default sendMail;