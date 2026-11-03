const API_URL = (
  process.env.NEXT_PUBLIC_ULTRON_API_URL ||
  "http://localhost:3001"
).replace(/\/$/, "");

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
    body: JSON.stringify({
      message,
      history,
    }),
    signal: AbortSignal.timeout(60000),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Ultron backend error");
  }

  return data;
}

function cleanTextForSpeech(text: string): string {
  return text
    // remove code blocks
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    // remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // remove URLs
    .replace(/https?:\/\/\S+/g, "link")
    // remove markdown asterisks, hashes, underscores, blockquotes
    .replace(/[*#_~>]/g, "")
    // collapse multiple spaces and newlines
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * High-fidelity JARVIS (Iron Man) British speech synthesizer using native browser SpeechSynthesis.
 * Modeled after Paul Bettany's calm, sophisticated, resonant British delivery.
 */
export function speakWithJarvisSynthesis(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    const clean = cleanTextForSpeech(text);
    if (!clean) {
      resolve();
      return;
    }

    // Cancel any previous pending audio
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);

    const pickJarvisVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      // Match British English male voices that mirror Paul Bettany's JARVIS
      const preferredJarvis =
        voices.find(v =>
          (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) &&
          /george|ryan|oliver|daniel|arthur|male/i.test(v.name)
        ) ||
        voices.find(v => /google.*uk.*male|uk english male/i.test(v.name)) ||
        voices.find(v => v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) ||
        voices.find(v => v.lang.startsWith("en") && /male|guy|david/i.test(v.name)) ||
        voices.find(v => v.lang.startsWith("en"));

      if (preferredJarvis) {
        utterance.voice = preferredJarvis;
      }
    };

    pickJarvisVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = pickJarvisVoice;
    }

    // JARVIS acoustic profile: measured, articulate British cadence, calm pitch
    utterance.pitch = 0.93;
    utterance.rate = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

export async function speak(text: string): Promise<void> {
  // Always provide immediate, authentic JARVIS voice synthesis
  try {
    const response = await fetch(`${API_URL}/api/speech/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      try {
        await audio.play();
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("Playback error"));
        });
        return;
      } finally {
        URL.revokeObjectURL(audioUrl);
      }
    }
  } catch {
    // If backend Fish Audio key is absent or fails, seamlessly fall back to JARVIS voice
  }

  // Pure Iron Man JARVIS synthesized speech
  await speakWithJarvisSynthesis(text);
}

export async function checkUltronStatus() {
  const response = await fetch(`${API_URL}/api/status`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error("Ultron backend unavailable");
  }

  return response.json();
}
