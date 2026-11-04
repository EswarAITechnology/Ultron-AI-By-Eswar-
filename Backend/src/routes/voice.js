import express from "express";
import { generateAIResponse } from "../services/aiService.js";

const router = express.Router();

/**
 * Incoming Twilio Voice Webhook
 * Triggered when Eswar Sir calls the phone number saved as "Ultron AI"
 */
router.all("/incoming", (req, res) => {
  res.type("text/xml");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Brian" language="en-GB">Ultron Online Sir! How may I assist you today?</Say>
    <Gather input="speech" action="/api/voice/respond" method="POST" speechTimeout="auto" timeout="5" language="en-US">
    </Gather>
    <Say voice="Polly.Brian" language="en-GB">Standing by, Eshwar Sir. Have a great day.</Say>
    <Hangup/>
</Response>`;

  res.send(twiml);
});

/**
 * Conversational Voice Response Webhook
 * Twilio sends caller's transcribed speech, Ultron responds in real-time
 */
router.post("/respond", async (req, res) => {
  res.type("text/xml");

  const speech = req.body.SpeechResult || req.query.SpeechResult;

  if (!speech || !speech.trim()) {
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Brian" language="en-GB">I am listening, Eshwar Sir. How may I help you?</Say>
    <Gather input="speech" action="/api/voice/respond" method="POST" speechTimeout="auto" timeout="5" language="en-US">
    </Gather>
    <Say voice="Polly.Brian" language="en-GB">Goodbye, Eshwar Sir.</Say>
    <Hangup/>
</Response>`;
    return res.send(fallbackTwiml);
  }

  try {
    const aiResult = await generateAIResponse([
      {
        role: "user",
        content: speech.trim()
      }
    ]);

    let cleanReply = (aiResult.answer || "At your service, Eswar Sir.")
      .replace(/\bEswar\b/gi, "Eshwar")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*#_~`]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Escape XML special characters
    cleanReply = cleanReply
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    const responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Brian" language="en-GB">${cleanReply}</Say>
    <Gather input="speech" action="/api/voice/respond" method="POST" speechTimeout="auto" timeout="5" language="en-US">
    </Gather>
    <Say voice="Polly.Brian" language="en-GB">Ultron standing by, Eshwar Sir.</Say>
    <Hangup/>
</Response>`;

    res.send(responseTwiml);

  } catch (error) {
    console.error("Twilio Voice AI error:", error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Brian" language="en-GB">Apologies, Eshwar Sir. My core neural processing experienced an interruption. I remain at your command.</Say>
    <Hangup/>
</Response>`;
    res.send(errorTwiml);
  }
});

export default router;
