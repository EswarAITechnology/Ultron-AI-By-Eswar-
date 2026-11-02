export async function generateSpeech(text) {
  const apiKey = process.env.FISH_API_KEY;

  if (!apiKey) {
    throw new Error("Fish Audio API key is missing");
  }

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "model": process.env.FISH_MODEL || "s2.1-pro-free"
  };

  const body = {
    text,
    format: "mp3",
    latency: "balanced",
    normalize: true
  };

  if (process.env.FISH_REFERENCE_ID) {
    body.reference_id = process.env.FISH_REFERENCE_ID;
  }

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
