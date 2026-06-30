import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import Razorpay from "razorpay";
import passport from "./config/passport.js";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { connectDB } from "./database/db.js";
import { generateResponse } from "./src/service/ai.service.js";
import { checkEnv } from "./config/envCheck.js";

import userRoutes from "./routes/user.js";
import courseRoutes from "./routes/courses.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import queryRoutes from "./routes/query.js";


dotenv.config();
checkEnv();

const app = express();
const port = process.env.PORT || 5000;

const server = createServer(app);

/* ---------------- CORS ORIGIN ---------------- */

const rawClientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const allowedOrigins = rawClientUrl
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""));

console.log("🌐 Allowed CORS origins:", allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., curl, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, "");
    if (allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }

    console.error(`❌ CORS blocked origin: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};

/* ---------------- SECURITY & LOGGING ---------------- */

app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

app.use("/api", apiLimiter);
app.use("/auth", apiLimiter);

app.use(morgan("dev"));

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- PASSPORT ---------------- */

app.use(passport.initialize());

/* ---------------- SOCKET.IO ---------------- */

const io = new Server(server, {
  cors: corsOptions,
});

/* ---------------- RAZORPAY ---------------- */

let razorpayInstance = null;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} else {
  console.warn("⚠️  Razorpay keys not configured. Payment features will be disabled.");
}

export const instance = razorpayInstance;

/* ---------------- DATABASE ---------------- */

connectDB();

/* ---------------- STATIC FILES ---------------- */

app.use("/uploads", express.static("uploads"));

/* ---------------- ROUTES ---------------- */

app.use("/api", userRoutes);
app.use("/api", courseRoutes);
app.use("/api", adminRoutes);
app.use("/auth", authRoutes);
app.use("/api/query",queryRoutes);


/* ---------------- HOME ROUTE ---------------- */

app.get("/", (req, res) => {
  res.send("LMS Server Running 🚀");
});

/* ---------------- HEALTH CHECK ---------------- */

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* ---------------- SOCKET LOGIC ---------------- */

const chatHistory = [];

io.on("connection", (socket) => {
  console.log("User connected");

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });

  socket.on("ai-message", async (data) => {
    try {
      console.log("User message:", data);

      chatHistory.push({
        role: "user",
        parts: [{ text: data }],
      });

      const response = await generateResponse(chatHistory);

      chatHistory.push({
        role: "model",
        parts: [{ text: response }],
      });

      socket.emit("ai-message-response", response);
    } catch (error) {
      console.log(error);
      socket.emit("ai-message-response", "Something went wrong");
    }
  });
});

/* ---------------- 404 ---------------- */

app.use((req, res) => {
  res.status(404).json({ message: "Request not found" });
});

/* ---------------- GLOBAL ERROR HANDLER ---------------- */

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    message: err.message || "Internal Server Error",
  });
});

/* ---------------- SERVER START ---------------- */

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${port} is already in use. Please stop the other server instance and try again.`);
  } else {
    console.error("❌ Server failed to start:", err.message);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
