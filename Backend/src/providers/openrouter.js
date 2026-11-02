export async function askOpenRouter(messages, systemInstruction) {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error("OpenRouter API key is missing");
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.OPENROUTER_SITE_URL || "",
        "X-Title":
          process.env.OPENROUTER_APP_NAME || "Ultron AI"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: systemInstruction
          },
          ...messages.slice(-20)
        ],
        temperature: 0.7,
        max_tokens: 1200
      }),
      signal: AbortSignal.timeout(45000)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.error?.message || "OpenRouter request failed"
    );

    error.status = response.status;
    throw error;
  }

  const answer = data.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error("OpenRouter returned an empty response");
  }

  return answer;
}
