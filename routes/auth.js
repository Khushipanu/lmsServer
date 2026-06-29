import express from "express"
import passport from "../config/passport.js"
import jwt from "jsonwebtoken"
import { isAuth } from "../middlewares/isAuth.js";

const router = express.Router();
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

// Step 1 -> redirect to Google login
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account", // always show account chooser
  })
);

// Step 2 -> Google callback
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, (err, user, info) => {
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