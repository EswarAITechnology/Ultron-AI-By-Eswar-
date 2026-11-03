export async function askGrok(messages, systemInstruction) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Grok API key is missing. Add GROK_API_KEY to Render environment variables.");
  }

  const model = process.env.GROK_MODEL || "grok-2-latest";

  const formattedMessages = [
    { role: "system", content: systemInstruction },
    ...messages.slice(-14).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    }))
  ];

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 1200
    }),
    signal: AbortSignal.timeout(35000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error?.message || `Grok error HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  const answer = data.choices?.[0]?.message?.content;
  if (!answer || !answer.trim()) {
    throw new Error("Grok returned an empty response");
  }

  return answer.trim();
}
