import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import chatRouter from "./routes/chat.js";
import speechRouter from "./routes/speech.js";
import commandsRouter from "./routes/commands.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { validateEnvironment } from "./config/env.js";

dotenv.config();
validateEnvironment();

const app = express();
const PORT = process.env.PORT || 3001;

app.disable("x-powered-by");

app.use(helmet());

app.use(cors({
  origin: [
    "https://eswaraitechnology.github.io",
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:3000", "http://127.0.0.1:5500"]
      : [])
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again shortly."
  }
});

app.use("/api", apiLimiter);

app.get("/", (req, res) => {
  res.json({
    name: "ULTRON AI",
    status: "online",
    greeting: "Welcome, Eswar Sir."
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    assistant: "Ultron",
    status: "online",
    user: "Eswar Sir",
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      fishAudio: Boolean(process.env.FISH_API_KEY)
    }
  });
});

app.use("/api/chat", chatRouter);
app.use("/api/speech", speechRouter);
app.use("/api/commands", commandsRouter);

app.use(errorHandler);

app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------");
  console.log("       ULTRON AI BACKEND");
  console.log("--------------------------------");
  console.log(`Server running on port ${PORT}`);
  console.log("Primary AI: Gemini");
  console.log("Fallback AI: OpenRouter");
  console.log("Voice: Fish Audio");
  console.log("User: Eswar Sir");
});
