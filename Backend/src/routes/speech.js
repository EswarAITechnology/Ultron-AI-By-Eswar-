import express from "express";
import { generateSpeech } from "../services/fishAudio.js";
import { transcribeAudioWithGemini } from "../providers/gemini.js";

const router = express.Router();

router.post("/tts", async (req, res, next) => {
  try {
    const { text, apiKey, referenceId } = req.body;

    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 4000
    ) {
      return res.status(400).json({
        error: "Valid speech text is required."
      });
    }

    const effectiveApiKey =
      apiKey ||
      req.headers["x-fish-api-key"] ||
      process.env.FISH_API_KEY;

    const audio = await generateSpeech(text, effectiveApiKey, referenceId);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      "inline; filename=ultron.mp3"
    );

    res.send(audio);

  } catch (error) {
    next(error);
  }
});

router.post("/stt", async (req, res, next) => {
  try {
    const { audio, mimeType } = req.body;

    if (!audio || typeof audio !== "string") {
      return res.status(400).json({
        error: "Base64 audio data is required."
      });
    }

    const transcript = await transcribeAudioWithGemini(audio, mimeType);

    res.json({
      success: true,
      transcript
    });
  } catch (error) {
    next(error);
  }
});

export default router;
