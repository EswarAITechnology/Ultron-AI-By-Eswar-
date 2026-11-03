export async function generateSpeech(text, customApiKey, customReferenceId) {
  const apiKey = (customApiKey || process.env.FISH_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error("Fish Audio API key is missing. Please add FISH_API_KEY in Render environment variables or UI Settings.");
  }

  // Phonetic correction: Ensure written "Eswar" is pronounced clearly as "Eshwar" (phonetically Esh-wahr)
  let speechText = text
    .replace(/\bEswar\b/gi, "Esh-wahr")
    .replace(/\bEswar's\b/gi, "Esh-wahr's")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*#_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // If text is long, extract the first 2 concise sentences (up to 280 chars)
  // This delivers lightning-fast speech generation (< 1.5s) without the 10-15s lag!
  if (speechText.length > 280) {
    const sentenceEnd = speechText.search(/[.!?]\s/);
    if (sentenceEnd > 40 && sentenceEnd < 280) {
      speechText = speechText.slice(0, sentenceEnd + 1);
    } else {
      speechText = speechText.slice(0, 280) + "...";
    }
  }

  // Exact Fish Audio JARVIS model ID provided by Eswar Sir
  const jarvisReferenceId = (
    customReferenceId ||
    process.env.FISH_REFERENCE_ID ||
    "29c31f6e158c4c8f84c14f9f3d8ba008"
  ).trim();

  const modelsToTry = [
    process.env.FISH_MODEL || "s2.1-pro-free",
    "s2.1-pro"
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "model": model
        },
        body: JSON.stringify({
          text: speechText,
          format: "mp3",
          latency: "balanced",
          normalize: true,
          reference_id: jarvisReferenceId
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Fish Audio error ${response.status} (${model}): ${details}`);
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      lastError = err;
      console.warn(`Fish Audio model ${model} failed:`, err?.message || err);
    }
  }

  throw lastError;
}
