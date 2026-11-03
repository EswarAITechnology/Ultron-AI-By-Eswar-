import { GoogleGenAI } from "@google/genai";

export async function askGemini(messages, systemInstruction) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Please add GEMINI_API_KEY in Render environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const history = messages.slice(-20).map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));

  // Sanitize model name: If it's the deprecated gemini-2.5-flash, upgrade automatically
  let preferred = (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  if (preferred === "gemini-2.5-flash" || preferred.includes("2.5")) {
    preferred = "gemini-3.8-flash";
  }

  const modelsToTry = [
    preferred,
    "gemini-3.8-flash",
    "gemini-3.8-pro",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: history,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 1200
        }
      });

      const answer = response.text;
      if (answer && answer.trim()) {
        return answer.trim();
      }
    } catch (err) {
      lastError = err;
      console.warn(`Gemini model ${model} failed, trying next candidate if available:`, err?.message || err);
    }
  }

  throw lastError || new Error("Gemini returned an empty response");
}
