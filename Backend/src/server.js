import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import chatRouter from "./routes/chat.js";
import speechRouter from "./routes/speech.js";
import commandsRouter from "./routes/commands.js";
import voiceRouter from "./routes/voice.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { validateEnvironment } from "./config/env.js";

dotenv.config();
validateEnvironment();

const app = express();
const PORT = process.env.PORT || 3001;

// Security
app.disable("x-powered-by");
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://eswaraitechnology.github.io",
  ...(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    try {
      const parsedUrl = new URL(origin);
      if (
        parsedUrl.hostname === "localhost" ||
        parsedUrl.hostname === "127.0.0.1" ||
        parsedUrl.hostname.endsWith(".github.io") ||
        parsedUrl.hostname.endsWith(".onrender.com") ||
        parsedUrl.hostname.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
    } catch {
      // ignore URL parsing error
    }

    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-fish-api-key"]
}));

// Request parsing: JSON & Twilio form-encoded
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again shortly."
  }
});

app.use("/api", apiLimiter);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "ULTRON AI",
    status: "online",
    greeting: "Welcome, Eswar Sir."
  });
});

// Backend status
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    assistant: "Ultron",
    status: "online",
    user: "Eswar Sir",
    phone: process.env.ULTRON_PHONE_NUMBER || null,
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      fishAudio: Boolean(process.env.FISH_API_KEY),
      voiceWebhook: true
    }
  });
});

// API routes
app.use("/api/chat", chatRouter);
app.use("/api/speech", speechRouter);
app.use("/api/commands", commandsRouter);
app.use("/api/voice", voiceRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------");
  console.log("       ULTRON AI BACKEND");
  console.log("--------------------------------");
  console.log(`Server running on port ${PORT}`);
  console.log("Primary AI: Gemini");
  console.log("Fallback AI: OpenRouter");
  console.log("Voice: Fish Audio & Twilio");
  console.log("User: Eswar Sir");
  console.log("--------------------------------");
});
