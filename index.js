import "./config/config.js"; // must be first: loads .env
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import path from "path";
import mongoose from "mongoose";
import passport from "passport";
import jwt from "jsonwebtoken";
import multer from "multer";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { connectDB } from "./database/db.js";
import { generateResponse } from "./src/service/ai.service.js";
import { checkEnv, getServiceStatus } from "./config/envCheck.js";
import { getClientUrls, isProd } from "./config/config.js";

import userRoutes from "./routes/user.js";
import courseRoutes from "./routes/courses.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import queryRoutes from "./routes/query.js";

checkEnv();

const app = express();
app.set("trust proxy", 1); // Render/Netlify sit behind a proxy
const port = process.env.PORT || 5000;
const server = createServer(app);

/* ---------------- CORS ---------------- */

const allowedOrigins = getClientUrls();
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // curl, server-to-server, same-origin
  const clean = origin.replace(/\/+$/, "");
  if (allowedOrigins.includes(clean)) return true;
  if (!isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) return true;
  return false;
};

const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    console.warn(`🚫 CORS blocked origin: ${origin} (allowed: ${allowedOrigins.join(", ")})`);
    cb(null, false); // respond without CORS headers instead of throwing a 500
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "token", "Authorization"],
  credentials: true,
};

/* ---------------- SECURITY & LOGGING ---------------- */

// crossOriginResourcePolicy must be "cross-origin", otherwise browsers refuse
// to load /uploads images & videos on the frontend's (different) domain.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));
app.use(morgan(isProd ? "tiny" : "dev"));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use("/api", apiLimiter);
app.use("/auth", apiLimiter);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(passport.initialize());

/* ---------------- STATIC FILES ---------------- */

app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), { maxAge: "7d" }));

/* ---------------- ROUTES ---------------- */

app.use("/api", userRoutes);
app.use("/api", courseRoutes);
app.use("/api", adminRoutes);
app.use("/api/query", queryRoutes);
app.use("/auth", authRoutes);

app.get("/", (req, res) => res.send("LMS Server Running 🚀"));

// Quick production diagnostics — shows what's configured, never secret values.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    allowedOrigins,
    services: getServiceStatus(),
  });
});

/* ---------------- 404 + ERRORS ---------------- */

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `File is too large (max ${process.env.MAX_UPLOAD_MB || 200} MB)`
        : err.message;
    return res.status(400).json({ message });
  }
  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({ message: err.message });
  }
  console.error("💥", req.method, req.originalUrl, err);
  res.status(err.status || 500).json({
    message: err.status && err.status < 500 ? err.message : "Something went wrong on our side. Please try again.",
  });
});

/* ---------------- AI TUTOR (socket.io) ---------------- */

const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: true },
});

// Only logged-in users can use the tutor (protects the Gemini quota).
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = jwt.verify(token, process.env.JWT_SECRET_KEY);
    next();
  } catch (err) {
    // "token_expired" → the app refreshes its access token and reconnects.
    next(new Error(err.name === "TokenExpiredError" ? "token_expired" : "unauthorized"));
  }
});

const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 4000;

io.on("connection", (socket) => {
  // Each connection keeps its own conversation (previously one global
  // history was shared by every user on the server).
  const history = [];
  let busy = false;

  socket.on("ai-message", async (raw) => {
    const text = String(raw || "").trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text) return;
    if (busy) return socket.emit("ai-message-response", "Please wait for my previous answer to finish 🙂");

    busy = true;
    history.push({ role: "user", parts: [{ text }] });
    try {
      const reply = await generateResponse(history);
      history.push({ role: "model", parts: [{ text: reply }] });
      socket.emit("ai-message-response", reply);
    } catch (err) {
      console.error("AI error:", err.message);
      history.pop();
      socket.emit("ai-message-response", "Something went wrong. Please try again.");
    } finally {
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
      busy = false;
    }
  });

  socket.on("ai-reset", () => history.splice(0));
});

/* ---------------- START ---------------- */

server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE" ? `❌ Port ${port} is already in use.` : `❌ Server error: ${err.message}`);
  process.exit(1);
});

connectDB();
server.listen(port, () => console.log(`🚀 Server running on port ${port}`));
