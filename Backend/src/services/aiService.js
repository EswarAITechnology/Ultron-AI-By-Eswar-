import { askGemini } from "../providers/gemini.js";
import { askOpenRouter } from "../providers/openrouter.js";
import { identity } from "../config/identity.js";

let geminiCooldownUntil = 0;
let lastProvider = null;

const cooldown = Number(
  process.env.GEMINI_COOLDOWN_MS || 60000
);

function isTemporaryProviderError(error) {
  const status = Number(error.status || error.code);

  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /resource_exhausted|rate.?limit|quota exceeded|temporarily unavailable/i
      .test(error.message || "")
  );
}

export async function generateAIResponse(messages) {
  let answer;
  let provider;
  let notice = null;

  const shouldTryGemini =
    Date.now() >= geminiCooldownUntil;

  if (shouldTryGemini) {
    try {
      answer = await askGemini(
        messages,
        identity.systemInstruction
      );

      provider = "gemini";
      geminiCooldownUntil = 0;

      if (lastProvider === "openrouter") {
        notice =
          "Gemini is available again. Switching back to Gemini.";
      }
    } catch (error) {
      if (!isTemporaryProviderError(error)) {
        throw error;
      }

      geminiCooldownUntil = Date.now() + cooldown;

      console.warn(
        "Gemini temporarily unavailable:",
        error.message
      );

      notice =
        "Gemini is temporarily unavailable. Switching to OpenRouter.";
    }
  } else {
    notice =
      "Gemini is in cooldown. Using OpenRouter.";
  }

  if (!answer) {
    answer = await askOpenRouter(
      messages,
      identity.systemInstruction
    );

    provider = "openrouter";
  }

  const changed = lastProvider !== null &&
    lastProvider !== provider;

  if (changed && !notice) {
    notice = `Switched to ${provider}.`;
  }

  lastProvider = provider;

  return {
    answer,
    provider,
    notice,
    geminiAvailableForRetry:
      Date.now() >= geminiCooldownUntil
  };
}
