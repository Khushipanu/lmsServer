
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
import User from "../models/user.model.js";

dotenv.config();

const rawGoogleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || "http://localhost:8080/auth/google/callback";
const googleCallbackUrl = rawGoogleCallbackUrl.replace(/\/+$/, "");
console.log("🔑 Google OAuth callback URL:", googleCallbackUrl);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: googleCallbackUrl,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("Google OAuth profile received:", { id: profile.id, email: profile.emails?.[0]?.value });
        
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
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

export default passport;
