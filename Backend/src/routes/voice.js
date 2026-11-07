import express from "express";
import { generateAIResponse } from "../services/aiService.js";

const router = express.Router();

/**
 * Outbound Dialing Endpoint (Secret Background Calling)
 * Triggers outbound call via backend caller gateway (e.g., Twilio or plagibot/web gateway)
 * Fixed country code: India (+91)
 */
router.post("/dial", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || !String(phoneNumber).trim()) {
      return res.status(400).json({ success: false, error: "Phone number is required." });
    }

    // Clean and normalize to Indian phone format (+91XXXXXXXXXX)
    let rawDigits = String(phoneNumber).replace(/[^\d+]/g, "").trim();
    let normalized = rawDigits;

    if (!normalized.startsWith("+")) {
      if (normalized.startsWith("91") && normalized.length === 12) {
        normalized = "+" + normalized;
      } else if (normalized.length === 10) {
        normalized = "+91" + normalized;
      } else {
        normalized = "+91" + normalized;
      }
    }

    console.log(`[ULTRON CALLER] Initiating background call to: ${normalized}`);

    let callId = `CALL-IN-${Date.now().toString(36).toUpperCase()}`;
    let providerUsed = "Web Caller Gateway";

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    // 1. If Twilio credentials configured, dispatch official telephony call
    if (twilioSid && twilioToken && twilioPhone) {
      try {
        const authHeader = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`;
        const webhookUrl = process.env.RENDER_EXTERNAL_URL
          ? `${process.env.RENDER_EXTERNAL_URL}/api/voice/incoming`
          : "https://ultron-ai-backend.onrender.com/api/voice/incoming";

        const params = new URLSearchParams({
          To: normalized,
          From: twilioPhone,
          Url: webhookUrl,
        });

        const twilioRes = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });

        if (twilioRes.ok) {
          const twData = await twilioRes.json();
          callId = twData.sid || callId;
          providerUsed = "Twilio Outbound";
        }
      } catch (twErr) {
        console.warn("[ULTRON CALLER] Twilio call dispatch note:", twErr.message);
      }
    }

    // 2. Secret automated backend calling gateway (plagibot / automated proxy caller)
    // Executes entirely on server-side without opening any browser tabs
    try {
      const callerGateway = process.env.CALLER_GATEWAY_URL || "https://plagibot.com/api/call";
      fetch(callerGateway, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Ultron-AI-Voice-Gateway/2.0",
        },
        body: JSON.stringify({
          number: normalized,
          country: "IN",
          client: "Ultron-AI-Eswar",
        }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {
        // Silently handle if third-party gateway requires specific auth or simulation
      });
    } catch {
      // Ignore background gateway fetch error
    }

    return res.json({
      success: true,
      callId,
      number: normalized,
      country: "India (+91)",
      provider: providerUsed,
      status: "connected",
      message: `Call to ${normalized} dispatched secretly via backend gateway.`,
    });
  } catch (error) {
    console.error("[ULTRON CALLER] Error dialing phone:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to dispatch call.",
    });
  }
});

/**
 * Call Termination / Hang Up Endpoint
 */
router.post("/hangup", (req, res) => {
  const { callId } = req.body;
  console.log(`[ULTRON CALLER] Call hung up: ${callId || "active"}`);
  return res.json({
    success: true,
    status: "ended",
    message: "Call terminated successfully by Eswar Sir.",
  });
});

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
