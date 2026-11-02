import express from "express";
import { detectWebsiteCommand } from "../utils/websiteCommands.js";

const router = express.Router();

router.post("/", (req, res) => {
  const { command } = req.body;

  if (
    typeof command !== "string" ||
    command.length > 300
  ) {
    return res.status(400).json({
      error: "Invalid command."
    });
  }

  const action = detectWebsiteCommand(command);

  if (!action) {
    return res.status(404).json({
      success: false,
      message: "Website command not recognized."
    });
  }

  res.json({
    success: true,
    action
  });
});

export default router;
