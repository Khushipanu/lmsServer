// Google OAuth (redirect flow, no sessions).
//
// Production checklist (most "OAuth errors" are one of these):
//  1. GOOGLE_CALLBACK_URL on Render = https://<your-api>.onrender.com/auth/google/callback
//  2. That exact URL is listed under "Authorized redirect URIs" in Google Cloud Console.
//  3. CLIENT_URL on Render = your frontend URL (no trailing slash) — users are sent back there.
//  4. If the OAuth consent screen is in "Testing" mode, only listed test users can sign in.
import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.model.js";
import { isAuth } from "../middlewares/isAuth.js";
import { getClientUrl, isGoogleConfigured } from "../config/config.js";
import { findByEmail, publicUser, signToken } from "../controllers/user.js";

const router = express.Router();

const callbackUrlFor = (req) => {
  if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL.trim().replace(/\/+$/, "");
  const host = req.get("host");
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? req.protocol : "https";
  return `${protocol}://${host}/auth/google/callback`;
};

const verify = async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value?.toLowerCase();
    if (!email) return done(null, false, { message: "no_email" });

    let user = (await User.findOne({ googleId: profile.id })) || (await findByEmail(email));

    if (!user) {
      user = await User.create({
        name: profile.displayName || email.split("@")[0],
        email,
        googleId: profile.id,
        avatar: profile.photos?.[0]?.value,
        role: "user",
      });
    } else if (!user.googleId) {
      user.googleId = profile.id;
      if (!user.avatar && profile.photos?.[0]?.value) user.avatar = profile.photos[0].value;
      await user.save();
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
};

const strategyFor = (req) =>
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackUrlFor(req),
    },
    verify
  );

const fail = (res, code) => res.redirect(`${getClientUrl()}/login?err=${code}`);

router.get("/google", (req, res, next) => {
  if (!isGoogleConfigured()) return fail(res, "google_not_configured");
  passport.authenticate(strategyFor(req), {
    scope: ["profile", "email"],
    prompt: "select_account",
    session: false,
  })(req, res, next);
});

router.get("/google/callback", (req, res, next) => {
  if (!isGoogleConfigured()) return fail(res, "google_not_configured");
  if (req.query.error) return fail(res, "google_cancelled");

  passport.authenticate(strategyFor(req), { session: false }, (err, user) => {
    if (err) {
      console.error("❌ Google OAuth error:", err.message, "| callback:", callbackUrlFor(req));
      return fail(res, "google_failed");
    }
    if (!user) return fail(res, "google_failed");

    // Token goes in the URL fragment (#) so it never reaches server logs.
    return res.redirect(`${getClientUrl()}/auth-success#token=${signToken(user)}`);
  })(req, res, next);
});

router.get("/me", isAuth, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

export default router;
