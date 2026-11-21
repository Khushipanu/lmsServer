import fs from "fs";
import path from "path";
import { getClientUrls, isCloudinaryConfigured, isGoogleConfigured } from "./config.js";
import { getEmailProvider } from "../middlewares/sendMail.js";

const requiredEnv = ["MONGODB_URI", "JWT_SECRET_KEY", "ACTIVATION_SECRET", "FORGOT_SECRET_KEY"];

/** Summary of which integrations are configured (no secrets). Also served on /health. */
export function getServiceStatus() {
  return {
    email: getEmailProvider() || "not configured",
    googleOAuth: isGoogleConfigured(),
    payments: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    ai: Boolean(process.env.GEMINI_API_KEY),
    fileStorage: isCloudinaryConfigured() ? "cloudinary" : "local disk",
  };
}

export function checkEnv() {
  console.log("\n🔍 Environment check");

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error("❌ Missing REQUIRED env vars:", missing.join(", "));
  } else {
    console.log("✅ Required env vars present");
  }

  const status = getServiceStatus();
  console.log("🌐 Allowed frontend origins:", getClientUrls().join(", "));
  console.log(
    status.email === "not configured"
      ? "⚠️  Email not configured — set GMAIL_SCRIPT_URL + GMAIL_SCRIPT_SECRET (see scripts/gmail-relay.gs), or BREVO_API_KEY / RESEND_API_KEY"
      : `✅ Email providers (tried in order): ${status.email}`
  );
  console.log(
    status.googleOAuth
      ? `✅ Google OAuth configured (callback: ${process.env.GOOGLE_CALLBACK_URL || "derived from request host"})`
      : "⚠️  Google OAuth disabled — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
  );
  console.log(status.payments ? "✅ Razorpay configured" : "⚠️  Razorpay disabled — paid checkout will fail");
  console.log(status.ai ? "✅ Gemini AI configured" : "⚠️  GEMINI_API_KEY missing — AI tutor disabled");
  console.log(
    status.fileStorage === "cloudinary"
      ? "✅ Uploads go to Cloudinary"
      : "⚠️  Uploads stored on local disk — on Render these are DELETED on every restart/deploy. Set CLOUDINARY_URL."
  );

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("");
}
