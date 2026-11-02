const API_URL =
  process.env.NEXT_PUBLIC_ULTRON_API_URL ||
  "http://localhost:3001";

export interface UltronMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UltronResponse {
  success: boolean;
  assistant: string;
  response: string;
  provider?: string;
  providerNotice?: string | null;
  providerChanged?: boolean;
  action?: {
    type: string;
    name: string;
    url: string;
    message: string;
  };
}

export async function sendMessage(
  message: string,
  history: UltronMessage[] = []
): Promise<UltronResponse> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Ultron request failed");
  }

  return data;
}

export async function speak(text: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/speech/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("Fish Audio speech generation failed");
  }

  const blob = await response.blob();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);

  try {
    await audio.play();

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(
        new Error("Audio playback failed")
      );
    });
  } finally {
    URL.revokeObjectURL(audioUrl);
  }
}

export async function checkUltronStatus() {
  const response = await fetch(`${API_URL}/api/status`);

  if (!response.ok) {
    throw new Error("Ultron backend unavailable");
  }

  return response.json();
}

export async function processUltronMessage(
  message: string,
  history: UltronMessage[] = []
) {
  const result = await sendMessage(message, history);

  if (result.providerNotice) {
    await speak(result.providerNotice);
  }

  if (result.action?.type === "OPEN_WEBSITE") {
    window.open(
      result.action.url,
      "_blank",
      "noopener,noreferrer"
    );

    await speak(result.response);
    return result;
  }

  await speak(result.response);

  return result;
}
