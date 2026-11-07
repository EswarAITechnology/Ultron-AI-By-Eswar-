const API_URL = (
  process.env.NEXT_PUBLIC_ULTRON_API_URL ||
  "http://localhost:3001"
).replace(/\/$/, "");

export interface UltronMessage {
  role: "user" | "assistant";
  content: string;
  actionUrl?: string;
  actionName?: string;
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

export function getStoredFishApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ultron_fish_api_key") || "";
}

export function setStoredFishApiKey(key: string): void {
  if (typeof window === "undefined") return;
  if (key) {
    localStorage.setItem("ultron_fish_api_key", key.trim());
  } else {
    localStorage.removeItem("ultron_fish_api_key");
  }
}

export function getStoredFishRefId(): string {
  if (typeof window === "undefined") return "29c31f6e158c4c8f84c14f9f3d8ba008";
  return localStorage.getItem("ultron_fish_ref_id") || "29c31f6e158c4c8f84c14f9f3d8ba008";
}

export function setStoredFishRefId(id: string): void {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem("ultron_fish_ref_id", id.trim());
  } else {
    localStorage.removeItem("ultron_fish_ref_id");
  }
}

export async function sendMessage(
  message: string,
  history: UltronMessage[] = []
): Promise<UltronResponse> {
  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        history,
      }),
      signal: AbortSignal.timeout(90000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Ultron backend error");
    }

    return data;
  } catch (err: unknown) {
    const errorObj = err as { name?: string; message?: string };
    if (
      errorObj?.name === "TimeoutError" ||
      errorObj?.message?.toLowerCase().includes("timed out") ||
      errorObj?.message?.toLowerCase().includes("aborted")
    ) {
      throw new Error(
        "Render backend is currently waking up from standby (free-tier cold-start takes ~25-30s). Please send your question again in a moment, Eswar Sir."
      );
    }
    throw err;
  }
}

export function cleanTextForSpeech(text: string): string {
  return text
    // Phonetic pronunciation fix: ensure "Eswar" is clearly pronounced "Esh-wahr" (not "aswar")
    .replace(/\bEswar\b/gi, "Esh-wahr")
    .replace(/\bEswar's\b/gi, "Esh-wahr's")
    // remove markdown code blocks
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    // remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // remove URLs
    .replace(/https?:\/\/\S+/g, "link")
    // remove markdown asterisks, hashes, underscores, blockquotes
    .replace(/[*#_~>]/g, "")
    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

let lockedJarvisVoice: SpeechSynthesisVoice | null = null;

async function getLockedJarvisVoiceAsync(): Promise<SpeechSynthesisVoice | null> {
  if (lockedJarvisVoice) return lockedJarvisVoice;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;

  let voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    await new Promise<void>((resolve) => {
      let done = false;
      const handler = () => {
        if (!done) {
          done = true;
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          resolve();
        }
      };
      window.speechSynthesis.addEventListener("voiceschanged", handler);
      setTimeout(() => {
        if (!done) {
          done = true;
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          resolve();
        }
      }, 1000);
    });
    voices = window.speechSynthesis.getVoices();
  }

  // Strictly lock to authentic British J.A.R.V.I.S. voice profiles
  lockedJarvisVoice =
    voices.find(v => (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) && /george|ryan|oliver|daniel|arthur|male/i.test(v.name)) ||
    voices.find(v => /google.*uk.*male|uk english male/i.test(v.name)) ||
    voices.find(v => (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) && !/female|zira|susan|hazel/i.test(v.name)) ||
    voices.find(v => (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB"))) ||
    voices.find(v => v.lang.startsWith("en") && /male|guy|david/i.test(v.name)) ||
    voices.find(v => v.lang.startsWith("en")) ||
    null;

  return lockedJarvisVoice;
}

function getLockedJarvisVoice(): SpeechSynthesisVoice | null {
  if (lockedJarvisVoice) return lockedJarvisVoice;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  lockedJarvisVoice =
    voices.find(v => (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) && /george|ryan|oliver|daniel|arthur|male/i.test(v.name)) ||
    voices.find(v => /google.*uk.*male|uk english male/i.test(v.name)) ||
    voices.find(v => (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB"))) ||
    null;
  return lockedJarvisVoice;
}

function _old_getLocked(): SpeechSynthesisVoice | null {
  if (lockedJarvisVoice) return lockedJarvisVoice;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  lockedJarvisVoice =
    voices.find(v =>
      (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) &&
      /george|ryan|oliver|daniel|arthur|male/i.test(v.name)
    ) ||
    voices.find(v => /google.*uk.*male|uk english male/i.test(v.name)) ||
    voices.find(v => v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) ||
    voices.find(v => v.lang.startsWith("en") && /male|guy|david/i.test(v.name)) ||
    voices.find(v => v.lang.startsWith("en")) ||
    null;

  return lockedJarvisVoice;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    getLockedJarvisVoice();
  };
}

/**
 * Authentic J.A.R.V.I.S. (Iron Man) British voice synthesis via Web Speech API fallback.
 * Strictly maintains consistent voice across all questions.
 */
export async function speakWithJarvisSynthesis(text: string): Promise<void> {
  const voice = await getLockedJarvisVoiceAsync();
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

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);

    // voice applied
    if (voice) {
      utterance.voice = voice;
    }

    utterance.pitch = 0.93;
    utterance.rate = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Primary Voice Synthesizer:
 * 1. Calls Fish Audio TTS using exact model ID 29c31f6e158c4c8f84c14f9f3d8ba008
 * 2. If Fish Audio is unavailable, seamlessly falls back to British J.A.R.V.I.S. speech synthesis
 */
export async function speak(
  text: string,
  customApiKey?: string,
  customReferenceId?: string
): Promise<void> {
  const speechText = cleanTextForSpeech(text);
  if (!speechText) return;

  const apiKey = (customApiKey || getStoredFishApiKey()).trim();
  const refId = (customReferenceId || getStoredFishRefId()).trim();

  // Try Fish Audio neural voice synthesis first
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-fish-api-key"] = apiKey;
    }

    const response = await fetch(`${API_URL}/api/speech/tts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: speechText,
        apiKey: apiKey || undefined,
        referenceId: refId || "29c31f6e158c4c8f84c14f9f3d8ba008",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = (e) => {
          URL.revokeObjectURL(audioUrl);
          reject(e);
        };
        audio.play().catch(reject);
      });
      return;
    }
  } catch (fishError) {
    console.warn("Fish Audio TTS failed or key missing, falling back to local J.A.R.V.I.S. voice:", fishError);
  }

  // Fallback to local high-fidelity British J.A.R.V.I.S. synthesizer
  await speakWithJarvisSynthesis(speechText);
}

/**
 * Direct Audio Transcription via Gemini 2.0 Flash
 * Works 100% in Brave, Chrome, Edge, Firefox, and Safari using native MediaRecorder
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const reader = new FileReader();
  const base64Promise = new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64String = dataUrl.split(",")[1];
      resolve(base64String);
    };
    reader.onerror = reject;
  });
  reader.readAsDataURL(audioBlob);
  const base64Audio = await base64Promise;

  const response = await fetch(`${API_URL}/api/speech/stt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio: base64Audio,
      mimeType: audioBlob.type || "audio/webm",
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Speech transcription failed");
  }

  return (data.transcript || "").trim();
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

export interface DialResult {
  success: boolean;
  callId?: string;
  number?: string;
  country?: string;
  provider?: string;
  status?: string;
  message?: string;
  error?: string;
}

/**
 * Initiates an outbound phone call via the backend caller gateway.
 * Runs 100% in the backend in secret without opening tabs or windows.
 */
export async function dialCall(phoneNumber: string): Promise<DialResult> {
  try {
    const response = await fetch(`${API_URL}/api/voice/dial`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phoneNumber }),
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Call dispatch failed");
    }

    return data;
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    return {
      success: false,
      error: errorObj?.message || "Failed to initiate background call",
    };
  }
}

/**
 * Terminates the active call in secret via the backend.
 */
export async function hangupCall(callId?: string | null): Promise<void> {
  try {
    await fetch(`${API_URL}/api/voice/hangup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ callId }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.warn("Hangup request error:", err);
  }
}
