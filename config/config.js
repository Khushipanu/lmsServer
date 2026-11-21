// Loads .env before anything else reads process.env.
// Every module that needs env vars should import from here (or import
// "dotenv/config" first) — ES module imports are hoisted, so calling
// dotenv.config() in the body of index.js runs too late for other files.
import "dotenv/config";

export const isProd = process.env.NODE_ENV === "production";

const clean = (url) => (url || "").trim().replace(/\/+$/, "");

/** All frontend origins allowed to call this API (comma-separated CLIENT_URL). */
export const getClientUrls = () =>
  (process.env.CLIENT_URL || process.env.frontendurl || "http://localhost:5173")
    .split(",")
    .map(clean)
    .filter(Boolean);

/** The main frontend URL — used for redirects and links inside emails. */
export const getClientUrl = () => getClientUrls()[0];

export const isGoogleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET)
  );
