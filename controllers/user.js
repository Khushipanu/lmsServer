import "../config/config.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import sendMail, { sendForgotMail } from "../middlewares/sendMail.js";
import TryCatch from "../middlewares/TryCatch.js";
import {
  TokenError,
  issueTokens,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../utils/tokens.js";

const ROLES = ["user", "admin"]; // "admin" = instructor (can create courses)
const MIN_PASSWORD = 6;

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// Case-insensitive lookup so accounts created before emails were
// normalised (e.g. "Name@Gmail.com") can still log in.
export const findByEmail = (email) =>
  User.findOne({ email: normalizeEmail(email) }).collation({ locale: "en", strength: 2 });

/** @deprecated kept for older imports — returns a short-lived access token. */
export const signToken = signAccessToken;

export const publicUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  obj.hasPassword = Boolean(obj.password);
  delete obj.password;
  delete obj.resetPasswordExpire;
  return obj;
};

export const register = TryCatch(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  const role = ROLES.includes(req.body.role) ? req.body.role : "user";

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
  }

  const existing = await findByEmail(email);
  if (existing) return res.status(400).json({ message: "An account with this email already exists" });

  const hashPassword = await bcrypt.hash(password, 10);
  const otp = String(crypto.randomInt(100000, 1000000)); // always 6 digits

  const activationToken = jwt.sign(
    { user: { name, email, password: hashPassword, role }, otp },
    process.env.ACTIVATION_SECRET,
    { expiresIn: "15m" }
  );

  try {
    await sendMail(email, "Your verification code", { name, otp });
    return res.status(200).json({ message: "We sent a 6-digit code to your email", activationToken });
  } catch (err) {
    console.error("❌ Signup email failed:", err.message);

    // Optional escape hatch while email isn't set up yet: set
    // EMAIL_OTP_FALLBACK=true to return the code in the response instead.
    // Leave it OFF for a real deployment (anyone could sign up with any email).
    if (process.env.EMAIL_OTP_FALLBACK === "true") {
      return res.status(200).json({
        message: "Email delivery is unavailable right now — use the code shown on screen",
        activationToken,
        otp,
      });
    }
    return res.status(502).json({
      message: "We couldn't send the verification email. Please try again in a minute or use Google sign-in.",
    });
  }
});

export const verifyUser = TryCatch(async (req, res) => {
  const { otp, activationToken } = req.body;
  if (!otp || !activationToken) return res.status(400).json({ message: "Code is required" });

  let payload;
  try {
    payload = jwt.verify(activationToken, process.env.ACTIVATION_SECRET);
  } catch {
    return res.status(400).json({ message: "This code has expired. Please register again." });
  }

  if (String(payload.otp) !== String(otp).trim()) {
    return res.status(400).json({ message: "Incorrect code. Please check and try again." });
  }

  const exists = await findByEmail(payload.user.email);
  if (exists) return res.status(400).json({ message: "Account already verified. Please log in." });

  await User.create(payload.user);
  return res.json({ message: "Account verified! You can log in now." });
});

export const login = TryCatch(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

  const user = await findByEmail(email);
  if (!user) return res.status(400).json({ message: "No account found with this email" });

  if (!user.password) {
    return res.status(400).json({
      message: "This account uses Google sign-in. Continue with Google, or use 'Forgot password' to set a password.",
    });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ message: "Incorrect password" });

  const { accessToken, refreshToken } = await issueTokens(user, req);
  return res.json({
    message: `Welcome back, ${user.name}!`,
    accessToken,
    refreshToken,
    token: accessToken, // old clients read `token`
    user: publicUser(user),
  });
});

/** POST /api/user/refresh  { refreshToken } → new { accessToken, refreshToken } */
export const refresh = async (req, res, next) => {
  try {
    const { accessToken, refreshToken, user } = await rotateRefreshToken(req.body?.refreshToken, req);
    return res.json({ accessToken, refreshToken, token: accessToken, user: publicUser(user) });
  } catch (err) {
    if (err instanceof TokenError) return res.status(401).json({ message: err.message, code: err.code });
    return next(err);
  }
};

/** POST /api/user/logout  { refreshToken } — ends this device's session. Always succeeds. */
export const logout = TryCatch(async (req, res) => {
  await revokeRefreshToken(req.body?.refreshToken);
  return res.json({ message: "Logged out" });
});

export const myprofile = TryCatch(async (req, res) => {
  const user = await User.findById(req.user._id);
  return res.json({ user: publicUser(user) });
});

export const updateProfile = TryCatch(async (req, res) => {
  const user = await User.findById(req.user._id);
  const { name, password, currentPassword } = req.body;

  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ message: "Name can't be empty" });
    user.name = String(name).trim();
  }

  if (password) {
    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
    }
    // Accounts that already have a password must confirm it first.
    if (user.password) {
      const ok = currentPassword && (await bcrypt.compare(currentPassword, user.password));
      if (!ok) return res.status(400).json({ message: "Current password is incorrect" });
    }
    user.password = await bcrypt.hash(password, 10);
  }

  await user.save();

  // New password → sign out every other device and give this one fresh tokens.
  if (password) {
    await revokeAllForUser(user._id, "password-changed");
    const tokens = await issueTokens(user, req);
    return res.json({ message: "Password updated", user: publicUser(user), ...tokens, token: tokens.accessToken });
  }
  res.json({ message: "Profile updated", user: publicUser(user) });
});

export const forgotPassword = TryCatch(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await findByEmail(email);
  if (!user) return res.status(404).json({ message: "No account found with this email" });

  const token = jwt.sign({ email }, process.env.FORGOT_SECRET_KEY, { expiresIn: "15m" });

  try {
    await sendForgotMail("Reset your password", { email, token });
  } catch (err) {
    console.error("❌ Reset email failed:", err.message);
    return res.status(502).json({ message: "We couldn't send the reset email. Please try again in a minute." });
  }

  user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
  await user.save();
  return res.json({ message: "Reset link sent — check your inbox (and spam folder)" });
});

export const resetPassword = TryCatch(async (req, res) => {
  const token = req.query.token || req.body.token;
  const { password } = req.body;
  if (!password || password.length < MIN_PASSWORD) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.FORGOT_SECRET_KEY);
  } catch {
    return res.status(400).json({ message: "This reset link is invalid or has expired" });
  }

  const user = await findByEmail(decoded.email);
  if (!user) return res.status(404).json({ message: "No account found" });
  if (!user.resetPasswordExpire || user.resetPasswordExpire < Date.now()) {
    return res.status(400).json({ message: "This reset link has already been used or expired" });
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordExpire = null;
  await user.save();
  await revokeAllForUser(user._id, "password-reset"); // sign out everywhere
  res.json({ message: "Password updated — you can log in now" });
});
