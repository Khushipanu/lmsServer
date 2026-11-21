import "../config/config.js";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const readToken = (req) => {
  if (req.headers.token) return req.headers.token;
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
};

export const isAuth = async (req, res, next) => {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ message: "Please log in to continue" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const user = await User.findById(decoded._id).select("-password");
    if (!user) return res.status(401).json({ message: "Account not found. Please log in again." });

    req.user = user;
    next();
  } catch (err) {
    // TOKEN_EXPIRED tells the app to get a new access token with its refresh
    // token and retry, instead of logging the user out.
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ message: "Session expired. Please log in again.", code: "INVALID_TOKEN" });
  }
};

export const isAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Only instructors can do this" });
  }
  next();
};
