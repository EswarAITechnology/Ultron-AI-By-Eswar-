import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    name: "ULTRON AI",
    status: "online",
    message: "Welcome, Eswar Sir."
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    assistant: "Ultron",
    user: "Eswar Sir",
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      fishAudio: Boolean(process.env.FISH_API_KEY)
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ULTRON AI running on port ${PORT}`);
});
