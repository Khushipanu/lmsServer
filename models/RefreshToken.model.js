import mongoose from "mongoose";

/**
 * One row per issued refresh token. We store only a SHA-256 hash of the token,
 * so a database leak doesn't hand out working sessions.
 *
 * family:   every token created by rotating the same login shares a family id.
 *           If an already-used token is presented again (token theft), the whole
 *           family is revoked.
 * expiresAt: MongoDB's TTL index deletes the row automatically after this date.
 */
const RefreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model("RefreshToken", RefreshTokenSchema);
export default RefreshToken;
