import { askGemini } from "../providers/gemini.js";
import { askGrok } from "../providers/grok.js";
import { askOpenRouter } from "../providers/openrouter.js";
import { identity } from "../config/identity.js";

let geminiCooldownUntil = 0;
let lastProvider = null;

const cooldown = Number(process.env.GEMINI_COOLDOWN_MS || 45000);

export async function generateAIResponse(messages) {
  let answer;
  let provider;
  let notice = null;

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  const hasGrokKey = Boolean(process.env.GROK_API_KEY && process.env.GROK_API_KEY.trim());
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());

  // 1. Primary: Google Gemini (gemini-2.0-flash)
  if (hasGeminiKey && Date.now() >= geminiCooldownUntil) {
    try {
      answer = await askGemini(messages, identity.systemInstruction);
      provider = "gemini";
      geminiCooldownUntil = 0;
    } catch (geminiError) {
      console.warn("Gemini attempt failed:", geminiError.message);
      geminiCooldownUntil = Date.now() + cooldown;
    }
  }

  // 2. Secondary: Grok (xAI)
  if (!answer && hasGrokKey) {
    try {
      answer = await askGrok(messages, identity.systemInstruction);
      provider = "grok";
    } catch (grokError) {
      console.warn("Grok attempt failed:", grokError.message);
    }
  }

  // 3. Fallback: OpenRouter
  if (!answer && hasOpenRouterKey) {
    try {
      answer = await askOpenRouter(messages, identity.systemInstruction);
      provider = "openrouter";
    } catch (openRouterError) {
      console.warn("OpenRouter attempt failed:", openRouterError.message);
    }
  }

  // 4. Default Persona Answer if no keys configured
  if (!answer) {
    provider = "jarvis-core";
    if (!hasGeminiKey && !hasGrokKey && !hasOpenRouterKey) {
      answer = "Greetings, Eswar Sir. I am online and systems are nominal. To enable live neural queries, please add your GEMINI_API_KEY or GROK_API_KEY to your Render environment variables.";
    } else {
      answer = "At your service, Eswar Sir. The external AI service experienced a temporary network delay. My neural pathways are recalibrating; please try asking again in a few seconds.";
    }
  }

  lastProvider = provider;

  return {
    answer,
    provider,
    notice,
    geminiAvailableForRetry: Date.now() >= geminiCooldownUntil
  };
}
