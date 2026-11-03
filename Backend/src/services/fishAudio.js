export async function generateSpeech(text) {
  const apiKey = process.env.FISH_API_KEY;

  if (!apiKey) {
    throw new Error("Fish Audio API key is missing");
  }

  // Phonetic correction: Ensure written "Eswar" is pronounced "Eshwar"
  const speechText = text
    .replace(/\bEswar\b/gi, "Eshwar")
    .replace(/\bEswar's\b/gi, "Eshwar's");

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "model": process.env.FISH_MODEL || "s2.1-pro-free"
  };

  // Default to Eswar Sir's chosen exact Fish Audio JARVIS model ID
  const jarvisReferenceId = process.env.FISH_REFERENCE_ID || "29c31f6e158c4c8f84c14f9f3d8ba008";

  const body = {
    text: speechText,
    format: "mp3",
    latency: "balanced",
    normalize: true,
    reference_id: jarvisReferenceId
  };

  const response = await fetch(
    "https://api.fish.audio/v1/tts",
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Fish Audio error ${response.status}: ${details}`
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
