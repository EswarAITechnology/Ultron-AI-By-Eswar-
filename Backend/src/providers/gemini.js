export async function askGemini(messages, systemInstruction) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Gemini API key is missing. Please add GEMINI_API_KEY in Render environment variables.");
  }

  // Build clean history for Gemini REST API
  const history = [];
  let lastRole = null;

  for (const msg of messages.slice(-14)) {
    const text = (msg.content || "").trim();
    if (!text) continue;

    const role = msg.role === "assistant" ? "model" : "user";
    // Gemini requires strictly alternating roles
    if (role === lastRole) {
      if (history.length > 0) {
        history[history.length - 1].parts[0].text += `\n${text}`;
      }
    } else {
      history.push({
        role,
        parts: [{ text }]
      });
      lastRole = role;
    }
  }

  // Ensure conversation starts with user message
  if (history.length > 0 && history[0].role !== "user") {
    history.shift();
  }

  // Ensure at least one message is present
  if (history.length === 0) {
    history.push({
      role: "user",
      parts: [{ text: "Hello" }]
    });
  }

  // Valid Gemini models to try in order
  const modelsToTry = [
    (process.env.GEMINI_MODEL || "gemini-2.0-flash").replace(/gemini-2\.5-flash|gemini-3\.8-flash|gemini-3\.8-pro/g, "gemini-2.0-flash"),
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      
      const payload = {
        contents: history,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200
        }
      };

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.error?.message || `HTTP ${response.status}`;
        console.warn(`Gemini model ${model} error: ${errorMsg}`);
        lastError = new Error(errorMsg);
        continue;
      }

      const candidate = data.candidates?.[0];
      const answer = candidate?.content?.parts?.[0]?.text;

      if (answer && answer.trim()) {
        return answer.trim();
      }
    } catch (err) {
      lastError = err;
      console.warn(`Gemini model ${model} attempt failed:`, err?.message || err);
    }
  }

  throw lastError || new Error("Gemini returned an empty response");
}

export async function transcribeAudioWithGemini(audioBase64, mimeType = "audio/webm") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Gemini API key is required for direct audio transcription.");
  }

  const cleanMime = (mimeType || "audio/webm").split(";")[0];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey.trim()}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: audioBase64
            }
          },
          {
            text: "Transcribe the spoken audio exactly. Only return the transcript in plain text without any introductory comments or quotes."
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 500
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Audio transcription error: ${errorMsg}`);
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;

  return (text || "").trim();
}
