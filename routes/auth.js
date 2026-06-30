import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { isAuth } from "../middlewares/isAuth.js";

const router = express.Router();
const rawClientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const clientUrl = rawClientUrl.replace(/\/+$/, "");

const googleVerify = async (accessToken, refreshToken, profile, done) => {
  try {
    console.log("Google OAuth profile received:", {
      id: profile.id,
      email: profile.emails?.[0]?.value,
    });

    const email = profile.emails && profile.emails[0] && profile.emails[0].value;
    const name = profile.displayName || (email ? email.split("@")[0] : "User");

    let user = await User.findOne({ googleId: profile.id });
    if (!user && email) {
      user = await User.findOne({ email });
    }

    if (!user) {
      console.log("Creating new user with email:", email);
      user = await User.create({
        name,
        email,
        googleId: profile.id,
        avatar: profile.photos && profile.photos[0] && profile.photos[0].value,
        role: "user",
      });
      console.log("New user created:", user._id);
    } else {
      console.log("User found or updated:", user._id);
      if (!user.googleId) {
        user.googleId = profile.id;
        await user.save();
      }
    }

    return done(null, user);
  } catch (err) {
    console.error("Passport Google Strategy error:", err.message, err);
    return done(err, null);
  }
};

const getCallbackUrl = (req) => {
  const host = req.get("host");
  const protocol = host.includes("localhost") ? req.protocol : "https";
  return `${protocol}://${host}/auth/google/callback`;
};

const getGoogleStrategy = (req) => {
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || getCallbackUrl(req);
  console.log("🔑 Using Google callback URL:", callbackURL);
  return new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
    },
    googleVerify
  );
};

// Step 1 -> redirect to Google login
router.get("/google", (req, res, next) => {
  const strategy = getGoogleStrategy(req);
  passport.authenticate(strategy, {
    scope: ["profile", "email"],
    prompt: "select_account",
  })(req, res, next);
});

// Step 2 -> Google callback
router.get("/google/callback", (req, res, next) => {
  const strategy = getGoogleStrategy(req);
  passport.authenticate(strategy, { session: false }, (err, user, info) => {
    try {
      if (err) {
        console.error("Passport callback error:", err.message, err);
        return res.redirect(`${clientUrl}/login?err=oauth_callback_error`);
      }

      if (!user) {
        console.error("Passport returned no user. Info:", info);
        return res.redirect(`${clientUrl}/login?err=auth_failed`);
      }

      if (!process.env.JWT_SECRET_KEY) {
        console.error("JWT_SECRET_KEY not set in environment");
        return res.redirect(`${clientUrl}/login?err=server_error`);
      }

      const token = jwt.sign(
        {
          _id: user._id,
          role: user.role,
        },
        process.env.JWT_SECRET_KEY,
        { expiresIn: "7d" }
      );

      console.log("OAuth login successful for user:", user._id);
      return res.redirect(`${clientUrl}/auth-success?token=${token}`);
    } catch (callbackErr) {
      console.error("Google login error:", callbackErr.message, callbackErr);
      return res.redirect(`${clientUrl}/login?err=google_failed`);
    }
  })(req, res, next);
});

router.get("/google/failure", (req, res) => {
  console.error("Passport authentication failed");
  res.redirect(`${clientUrl}/login?err=auth_failed`);
});

//OUTSIDE callback
router.get("/me", isAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;
