import "../../config/config.js";
import { GoogleGenAI } from "@google/genai";

// Tried in order until one answers. Override the first choice with GEMINI_MODEL
// when Google retires a model. "*-latest" are Google's auto-updating aliases.
const MODELS = [
  ...new Set([process.env.GEMINI_MODEL, "gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-flash-latest"]),
].filter(Boolean);
const MODEL_TIMEOUT_MS = 25000; // an overloaded model can otherwise hang for minutes

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))]);

const SYSTEM_PROMPT =
  "You are a friendly, concise AI tutor inside an online learning platform. " +
  "Help students understand programming, data, design and other course topics. " +
  "Explain step by step, use short examples and Markdown code blocks when useful, " +
  "and keep answers focused. If asked something unrelated to learning, answer briefly and politely.";

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export const isAiConfigured = () => Boolean(ai);

export const generateResponse = async (chatHistory) => {
  if (!ai) return "The AI tutor isn't configured on the server yet (missing GEMINI_API_KEY).";

  for (const model of MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({ model, contents: chatHistory, config: { systemInstruction: SYSTEM_PROMPT } }),
        MODEL_TIMEOUT_MS
      );
      if (response.text) return response.text;
    } catch (err) {
      console.warn(`Gemini model "${model}" failed:`, err.message);
    }
  }
  return "I'm having trouble thinking right now — please try again in a moment.";
};
