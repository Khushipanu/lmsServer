import express from "express";
import rateLimit from "express-rate-limit";
import {
  forgotPassword,
  login,
  myprofile,
  register,
  resetPassword,
  updateProfile,
  verifyUser,
} from "../controllers/user.js";
import { isAuth } from "../middlewares/isAuth.js";

const router = express.Router();

// Stricter limit on endpoints that send email or check passwords.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please wait a few minutes and try again." },
});

router.post("/user/register", authLimiter, register);
router.post("/user/verify", authLimiter, verifyUser);
router.post("/user/login", authLimiter, login);
router.post("/user/forgot", authLimiter, forgotPassword);
router.post("/user/reset", authLimiter, resetPassword);
router.get("/user/myprofile", isAuth, myprofile);
router.put("/user/profile", isAuth, updateProfile);
router.put("/user/updateProfile/:id", isAuth, updateProfile); // legacy path

export default router;
