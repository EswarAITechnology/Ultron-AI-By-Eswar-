import { GoogleGenAI } from "@google/genai";

export async function askGemini(messages, systemInstruction) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key is missing");
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  const history = messages.slice(-20).map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: history,
    config: {
      systemInstruction,
      temperature: 0.7,
      maxOutputTokens: 1200
    }
  });

  const answer = response.text;

  if (!answer) {
    throw new Error("Gemini returned an empty response");
  }

  return answer;
}
