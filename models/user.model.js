import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, trim: true },
    password: { type: String },
    googleId: { type: String },
    avatar: { type: String },
    // "user" = student, "admin" = instructor (can create & manage courses)
    role: { type: String, default: "user" },
    subscription: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
    resetPasswordExpire: { type: Date },
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);
export default User;
