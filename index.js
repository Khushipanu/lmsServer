import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import Razorpay from "razorpay";
import passport from "./config/passport.js";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { connectDB } from "./database/db.js";
import { generateResponse } from "./src/service/ai.service.js";

import userRoutes from "./routes/user.js";
import courseRoutes from "./routes/courses.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import queryRoutes from "./routes/query.js";


dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const server = createServer(app);

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://lmsclient-ruddy.vercel.app",
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- PASSPORT ---------------- */

app.use(passport.initialize());

/* ---------------- SOCKET.IO ---------------- */

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://lmsclient-ruddy.vercel.app",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/* ---------------- RAZORPAY ---------------- */

export const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

/* ---------------- 404 ---------------- */

app.use((req, res) => {
  res.status(404).json({ message: "Request not found" });
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

/* ---------------- SERVER START ---------------- */

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});