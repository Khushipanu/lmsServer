import "../config/config.js";
import mongoose from "mongoose";

const RETRY_MS = 5000;

export const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set — the API can't work without a database.");
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("✅ Database connected");
  } catch (err) {
    // Common on Atlas: the server's IP isn't in Network Access → allow 0.0.0.0/0 for Render.
    console.error(`❌ Database connection failed: ${err.message}. Retrying in ${RETRY_MS / 1000}s…`);
    setTimeout(connectDB, RETRY_MS);
  }
};

mongoose.connection.on("disconnected", () => console.warn("⚠️  Database disconnected"));
