/*
  Access token + refresh token.

  Access token  — a signed JWT, valid for ACCESS_TOKEN_TTL (default 15 minutes).
                  Sent with every API request in the `token` header (or
                  `Authorization: Bearer`). The server checks only the signature,
                  so it's fast, but it can't be cancelled before it expires;
                  that's why it's short-lived.

  Refresh token — a long random string (not a JWT), valid for REFRESH_TOKEN_DAYS
                  (default 30). Used only on POST /api/user/refresh to get a new
                  pair. Stored in the database (as a hash), so it CAN be revoked:
                  logout, password change and password reset all revoke it.

  Rotation      — every refresh returns a NEW refresh token and retires the old
                  one. If a retired token is used again, someone has a copy of it,
                  so every token from that login ("family") is revoked.
*/
import "../config/config.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import RefreshToken from "../models/RefreshToken.model.js";
import User from "../models/user.model.js";

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS) || 30;
// Two tabs refreshing at the same moment both send the same token. A retired
// token reused within this window is treated as that race, not as theft.
const RACE_GRACE_MS = 20 * 1000;

export class TokenError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

export const signAccessToken = (user) =>
  jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET_KEY, { expiresIn: ACCESS_TTL });

const createRefreshToken = async (user, req, family = crypto.randomUUID()) => {
  const token = crypto.randomBytes(48).toString("hex");
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    family,
    expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000),
    userAgent: req?.get?.("user-agent")?.slice(0, 200),
  });
  return token;
};

/** New login: a fresh access token and a refresh token in a new family. */
export const issueTokens = async (user, req) => ({
  accessToken: signAccessToken(user),
  refreshToken: await createRefreshToken(user, req),
});

/** Swap a valid refresh token for a new pair (the old refresh token is retired). */
export const rotateRefreshToken = async (token, req) => {
  if (!token) throw new TokenError("NO_REFRESH_TOKEN", "Please log in to continue");

  const doc = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (!doc) throw new TokenError("INVALID_REFRESH_TOKEN", "Session expired. Please log in again.");

  if (doc.revokedAt) {
    // Ended on purpose (logout, password change/reset) — not suspicious.
    if (doc.revokeReason !== "rotated" && doc.revokeReason !== "reuse-detected") {
      throw new TokenError("SESSION_REVOKED", "You were signed out. Please log in again.");
    }
    const isRace = doc.revokeReason === "rotated" && Date.now() - doc.revokedAt.getTime() < RACE_GRACE_MS;
    if (!isRace) {
      await RefreshToken.updateMany(
        { family: doc.family, revokedAt: null },
        { revokedAt: new Date(), revokeReason: "reuse-detected" }
      );
      console.warn(`⚠️  Refresh token reuse detected for user ${doc.user} — session family revoked`);
    }
    throw new TokenError("REFRESH_TOKEN_REUSED", "Session expired. Please log in again.");
  }

  if (doc.expiresAt < new Date()) throw new TokenError("REFRESH_TOKEN_EXPIRED", "Session expired. Please log in again.");

  const user = await User.findById(doc.user);
  if (!user) throw new TokenError("INVALID_REFRESH_TOKEN", "Account not found. Please log in again.");

  // Retire the old token only if nobody else retired it in the meantime.
  const claimed = await RefreshToken.updateOne(
    { _id: doc._id, revokedAt: null },
    { revokedAt: new Date(), revokeReason: "rotated" }
  );
  if (!claimed.modifiedCount) throw new TokenError("REFRESH_TOKEN_REUSED", "Session expired. Please log in again.");

  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken: await createRefreshToken(user, req, doc.family),
  };
};

/** Logout on this device. */
export const revokeRefreshToken = (token) =>
  token
    ? RefreshToken.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { revokedAt: new Date(), revokeReason: "logout" })
    : Promise.resolve();

/** Logout everywhere (password change / reset). */
export const revokeAllForUser = (userId, reason = "logout-all") =>
  RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date(), revokeReason: reason });
