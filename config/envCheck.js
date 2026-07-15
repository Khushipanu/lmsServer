import fs from "fs";
import path from "path";

const requiredEnv = [
  "MONGODB_URI",
  "JWT_SECRET_KEY",
  "ACTIVATION_SECRET",
  "FORGOT_SECRET_KEY",
];

const oauthEnv = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL"];
const mailEnv = ["RESEND_API_KEY", "EMAIL_FROM"];
const paymentEnv = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"];

export function checkEnv() {
  console.log("\n🔍 Environment Check\n");

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    console.warn("⚠️  Missing required env vars:", missing.join(", "));
  } else {
    console.log("✅ Required env vars present");
  }

  const oauthMissing = oauthEnv.filter((key) => !process.env[key]);
  if (oauthMissing.length) {
    console.warn("⚠️  Google OAuth may not work. Missing:", oauthMissing.join(", "));
  } else {
    console.log("✅ Google OAuth configured");
  }

  const mailMissing = mailEnv.filter((key) => !process.env[key]);
  if (mailMissing.length) {
    console.warn("⚠️  Email sending may not work. Missing:", mailMissing.join(", "));
  } else {
    console.log("✅ Email (Resend) configured");
  }

  const paymentMissing = paymentEnv.filter((key) => !process.env[key]);
  if (paymentMissing.length) {
    console.warn("⚠️  Razorpay may not work. Missing:", paymentMissing.join(", "));
  } else {
    console.log("✅ Razorpay configured");
  }

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log("📁 Created uploads directory");
  }

  console.log("");
}
