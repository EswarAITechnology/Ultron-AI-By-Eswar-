import { askGemini } from "../providers/gemini.js";
import { askOpenRouter } from "../providers/openrouter.js";
import { identity } from "../config/identity.js";

let geminiCooldownUntil = 0;
let lastProvider = null;

const cooldown = Number(
  process.env.GEMINI_COOLDOWN_MS || 60000
);

export async function generateAIResponse(messages) {
  let answer;
  let provider;
  let notice = null;

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
  const shouldTryGemini = hasGeminiKey && Date.now() >= geminiCooldownUntil;

  if (shouldTryGemini) {
    try {
      answer = await askGemini(
        messages,
        identity.systemInstruction
      );

      provider = "gemini";
      geminiCooldownUntil = 0;

      if (lastProvider === "openrouter") {
        notice = "Gemini is available again. Switching back to Gemini.";
      }
    } catch (error) {
      geminiCooldownUntil = Date.now() + cooldown;
      console.warn("Gemini error, attempting fallback:", error.message);

      if (hasOpenRouterKey) {
        notice = "Gemini temporarily unavailable. Switching to OpenRouter.";
      }
    }
  }

  // Fallback to OpenRouter if Gemini didn't return an answer
  if (!answer && hasOpenRouterKey) {
    try {
      answer = await askOpenRouter(
        messages,
        identity.systemInstruction
      );
      provider = "openrouter";
    } catch (openRouterError) {
      console.warn("OpenRouter also failed:", openRouterError.message);
    }
  }

  // If neither provider succeeded or keys are missing, provide intelligent Ultron response
  if (!answer) {
    provider = "ultron-core";
    if (!hasGeminiKey && !hasOpenRouterKey) {
      answer = "Greetings, Eswar Sir. My interface is active, but I require an AI key to generate responses. Please add your GEMINI_API_KEY to your Render environment variables.";
    } else {
      answer = "My apologies, Eswar Sir. The external AI service encountered a temporary rate limit or connection issue. Systems are recalibrating; please try asking again in a moment.";
    }
  }

  const changed = lastProvider !== null && lastProvider !== provider;
  if (changed && !notice) {
    notice = `Switched to ${provider}.`;
  }

  lastProvider = provider;

  return {
    answer,
    provider,
    notice,
    geminiAvailableForRetry: Date.now() >= geminiCooldownUntil
  };
}
