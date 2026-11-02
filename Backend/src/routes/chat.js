import express from "express";
import { generateAIResponse } from "../services/aiService.js";
import { detectWebsiteCommand } from "../utils/websiteCommands.js";

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 4000
    ) {
      return res.status(400).json({
        error: "A valid message is required."
      });
    }

    if (!Array.isArray(history) || history.length > 30) {
      return res.status(400).json({
        error: "Invalid conversation history."
      });
    }

    const cleanHistory = history
      .filter(item =>
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-20)
      .map(item => ({
        role: item.role,
        content: item.content.slice(0, 4000)
      }));

    const command = detectWebsiteCommand(message);

    if (command) {
      return res.json({
        success: true,
        type: "command",
        assistant: "Ultron",
        response: command.message,
        action: command
      });
    }

    const result = await generateAIResponse([
      ...cleanHistory,
      {
        role: "user",
        content: message.trim()
      }
    ]);

    res.json({
      success: true,
      assistant: "Ultron",
      response: result.answer,
      provider: result.provider,
      providerNotice: result.notice,
      providerChanged: Boolean(result.notice)
    });

  } catch (error) {
    next(error);
  }
});

export default router;
