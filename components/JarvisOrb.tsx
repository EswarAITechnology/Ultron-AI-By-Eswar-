"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createOrbScene,
  type OrbSceneApi,
} from "@/lib/orbScene";

import {
  HandTracker,
  type TrackerStatus,
} from "@/lib/handTracker";

import {
  sendMessage,
  speak,
  transcribeAudio,
  getStoredFishApiKey,
  setStoredFishApiKey,
  getStoredFishRefId,
  setStoredFishRefId,
  type UltronMessage,
} from "@/lib/ultronApi";

import { detectWebsiteCommand } from "@/lib/commands";
import UltronCallScreen from "./UltronCallScreen";

type CameraState = "off" | "starting" | "on" | "error";

type SpeechRecognitionResult = {
  transcript: string;
};

type SpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResult>>;
};

type SpeechRecognitionErrorEvent = {
  error?: string;
  message?: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event?: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

export default function JarvisOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const hasWebSpeechResultRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState<CameraState>("off");

  const [status, setStatus] = useState<TrackerStatus>({
    hands: 0,
    mode: "idle",
  });

  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<UltronMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [provider, setProvider] = useState("Online");
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Phone Call Screen State
  const [isCallOpen, setIsCallOpen] = useState(false);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fishKey, setFishKey] = useState("");
  const [fishRefId, setFishRefId] = useState("29c31f6e158c4c8f84c14f9f3d8ba008");
  const [testVoiceLoading, setTestVoiceLoading] = useState(false);

  useEffect(() => {
    setFishKey(getStoredFishApiKey());
    setFishRefId(getStoredFishRefId());
    if (typeof window !== "undefined" && window.location.search.includes("call=true")) {
      setIsCallOpen(true);
    }
  }, []);

  const handleSaveSettings = () => {
    setStoredFishApiKey(fishKey);
    setStoredFishRefId(fishRefId);
    setIsSettingsOpen(false);
  };

  const handleTestVoice = async () => {
    setTestVoiceLoading(true);
    try {
      await speak(
        "Greetings Eswar Sir. All systems are operational. I am ready for your command.",
        fishKey,
        fishRefId
      );
    } catch (err) {
      console.error(err);
    } finally {
      setTestVoiceLoading(false);
    }
  };

  // Dynamic Glassy Morphing Chat state (Cursor hover & ball collapse)
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 250);
  }, []);

  const isExpanded = isHovered || isInputFocused || isChatOpen;

  const messagesRef = useRef<UltronMessage[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    try {
      const scene = createOrbScene(container);
      sceneRef.current = scene;

      return () => {
        trackerRef.current?.stop();
        recognitionRef.current?.stop();

        scene.dispose();
        sceneRef.current = null;
      };
    } catch (err) {
      console.error(err);
      setError("3D ENGINE INITIALIZATION FAILED");
    }
  }, []);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;

    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    if (camera === "starting") return;

    const video = videoRef.current;
    const overlay = overlayRef.current;

    if (!video || !overlay) {
      setError("CAMERA ELEMENTS NOT READY");
      setCamera("error");
      return;
    }

    if (trackerRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("CAMERA API NOT SUPPORTED");
      setCamera("error");
      return;
    }

    setCamera("starting");
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => {
        sceneRef.current?.rotateBy(dt, dp);
      },
      onZoom: (factor) => {
        sceneRef.current?.zoomBy(factor);
      },
      onStatus: setStatus,
    });

    trackerRef.current = tracker;

    try {
      await tracker.start();

      if (trackerRef.current !== tracker) {
        tracker.stop();
        return;
      }

      setCamera("on");
    } catch (err) {
      console.error(err);
      tracker.stop();
      trackerRef.current = null;
      setCamera("error");
      setError("CAMERA INITIALIZATION FAILED");
    }
  }, [camera]);

  const toggleGestures = useCallback(() => {
    if (camera === "starting") return;

    if (trackerRef.current) {
      stopGestures();
    } else {
      void startGestures();
    }
  }, [camera, startGestures, stopGestures]);

  const handleSend = useCallback(async (value?: string) => {
    const message = (value ?? input).trim();

    if (!message || busyRef.current) return;

    busyRef.current = true;
    setLoading(true);
    setInput("");
    setError(null);
    setIsChatOpen(true);

    const previousHistory = messagesRef.current;

    // 1. Synchronous Client-Side Intent Detection (Bypasses Brave/Chrome Popup Blockers 100%)
    const directAction = detectWebsiteCommand(message);
    if (directAction) {
      if (directAction.type === "TRIGGER_CALL") {
        setIsCallOpen(true);
        busyRef.current = false;
        setLoading(false);
        return;
      }

      try {
        window.open(directAction.url, "_blank");
      } catch (openErr) {
        console.warn("Direct window.open blocked:", openErr);
      }

      const updatedHistory: UltronMessage[] = [
        ...previousHistory,
        { role: "user", content: message },
        {
          role: "assistant",
          content: directAction.message,
          actionUrl: directAction.url,
          actionName: directAction.name,
        },
      ];

      messagesRef.current = updatedHistory;
      setMessages(updatedHistory);
      busyRef.current = false;
      setLoading(false);

      if (voiceEnabled) {
        try {
          await speak(directAction.message);
        } catch (vErr) {
          console.error("Voice playback error:", vErr);
        }
      }
      return;
    }

    const updatedHistory: UltronMessage[] = [
      ...previousHistory,
      { role: "user", content: message },
    ];

    messagesRef.current = updatedHistory;
    setMessages(updatedHistory);

    try {
      const result = await sendMessage(
        message,
        previousHistory
      );

      if (result.provider) {
        setProvider(
          result.provider === "gemini"
            ? "GEMINI"
            : result.provider === "openrouter"
              ? "OPENROUTER"
              : "ULTRON"
        );
      }

      if (result.providerNotice) {
        if (voiceEnabled) {
          try {
            await speak(result.providerNotice);
          } catch (voiceError) {
            console.error("Announcement failed:", voiceError);
          }
        }
      }

      const reply = result.response;

      const finalHistory: UltronMessage[] = [
        ...updatedHistory,
        {
          role: "assistant",
          content: reply,
          actionUrl: result.action?.url,
          actionName: result.action?.name,
        },
      ];

      messagesRef.current = finalHistory;
      setMessages(finalHistory);

      if (result.action?.type === "OPEN_WEBSITE" && result.action.url) {
        window.open(result.action.url, "_blank");
      }

      if (voiceEnabled) {
        try {
          await speak(reply);
        } catch (voiceError) {
          console.error("Voice playback failed:", voiceError);
        }
      }
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Ultron connection failed";

      setError(errMsg);

      const errorHistory: UltronMessage[] = [
        ...updatedHistory,
        {
          role: "assistant",
          content: `Notice: ${errMsg}`,
        },
      ];
      messagesRef.current = errorHistory;
      setMessages(errorHistory);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [input, voiceEnabled]);

  const startListening = useCallback(async () => {
    if (listening || loading) return;

    setError(null);
    hasWebSpeechResultRef.current = false;
    audioChunksRef.current = [];

    let micStream: MediaStream | null = null;

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (micErr: unknown) {
      console.warn("Microphone permission notice:", micErr);
      const errorObj = micErr as { name?: string };
      if (errorObj?.name === "NotAllowedError" || errorObj?.name === "PermissionDeniedError") {
        setError("MICROPHONE ACCESS DENIED: Please allow microphone access in your browser address bar.");
        return;
      }
    }

    if (!micStream) {
      setError("NO MICROPHONE DETECTED: Please verify your microphone is connected.");
      return;
    }

    // 1. Native MediaRecorder for 100% Brave / Chrome / Edge compatibility
    try {
      const recorder = new MediaRecorder(micStream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        micStream?.getTracks().forEach(track => track.stop());

        if (hasWebSpeechResultRef.current) return;

        const chunks = audioChunksRef.current;
        if (chunks.length === 0) return;

        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (audioBlob.size < 1200) return;

        setLoading(true);
        try {
          const transcript = await transcribeAudio(audioBlob);
          if (transcript && transcript.trim()) {
            setInput(transcript);
            void handleSend(transcript);
          }
        } catch (transcribeError) {
          console.warn("MediaRecorder STT fallback:", transcribeError);
        } finally {
          setLoading(false);
        }
      };

      recorder.start();
    } catch (recErr) {
      console.warn("MediaRecorder start notice:", recErr);
    }

    // 2. Parallel Web Speech API for instant streaming in Chrome/Edge
    const SpeechAPI = (
      window as Window & {
        SpeechRecognition?: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
      }
    ).SpeechRecognition || (
      window as Window & {
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
      }
    ).webkitSpeechRecognition;

    if (SpeechAPI) {
      try {
        const recognition = new SpeechAPI();
        recognition.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript && transcript.trim()) {
            hasWebSpeechResultRef.current = true;
            setInput(transcript);
            void handleSend(transcript);
            stopListening();
          }
        };

        recognition.onerror = () => {
          // In Brave, SpeechAPI fails with network error because Brave disables Google Speech.
          // MediaRecorder seamlessly captures and transcribes via Gemini STT!
        };

        recognition.onend = () => {
          if (!hasWebSpeechResultRef.current && listening) {
            stopListening();
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (speechErr) {
        console.warn("WebSpeech API start notice:", speechErr);
      }
    }

    setListening(true);
  }, [handleSend, listening, loading]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (stopErr) {
        console.warn("MediaRecorder stop notice:", stopErr);
      }
      mediaRecorderRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (recStopErr) {
        console.warn("Recognition stop notice:", recStopErr);
      }
      recognitionRef.current = null;
    }

    setListening(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
        case "c":
        case "C":
          setIsCallOpen(prev => !prev);
          break;
        case "Escape":
          if (trackerRef.current) stopGestures();
          stopListening();
          setIsChatOpen(false);
          setIsHovered(false);
          setIsSettingsOpen(false);
          setIsCallOpen(false);
          break;
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [toggleGestures, stopGestures, stopListening]);

  const cameraOn = camera === "on";

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-grain" />
      <div className="overlay-scanlines" />
      <div className="overlay-vignette" />

      <div className="hud hud-title">ULTRON // SYSTEM ONLINE</div>

      <div className="hud hud-hint">
        <span className="key">DRAG</span> ROTATE &nbsp;
        <span className="key">+/-</span> ZOOM &nbsp;
        <span className="key">R</span> RESET &nbsp;
        <span className="key">G</span> GESTURES
      </div>

      <div className="hud hud-controls">
        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            onClick={toggleGestures}
            disabled={camera === "starting"}
          >
            {camera === "starting"
              ? "INITIALIZING..."
              : cameraOn
                ? "GESTURES ON"
                : "GESTURES OFF"}
          </button>
        </div>

        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            onClick={() => sceneRef.current?.zoomIn()}
            title="Zoom In"
          >
            +
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => sceneRef.current?.zoomOut()}
            title="Zoom Out"
          >
            −
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => sceneRef.current?.resetView()}
            title="Reset View"
          >
            RESET
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Voice & API Settings"
          >
            ⚙
          </button>
        </div>

        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            onClick={() => setIsCallOpen(true)}
            title="Start Holographic Phone Call with Ultron AI"
            style={{ color: "#34d399", borderColor: "rgba(52, 211, 153, 0.6)" }}
          >
            📞 CALL
          </button>
        </div>
      </div>

      {/* HOLOGRAPHIC PHONE CALL OVERLAY */}
      {isCallOpen && (
        <UltronCallScreen
          onHangup={() => setIsCallOpen(false)}
          callerName="Ultron AI"
          phoneNumber="+1 (833) ULTRON-AI"
        />
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div
          className="ultron-settings-overlay"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="ultron-settings-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="ultron-settings-header">
              <h3>SYSTEM & VOICE CONFIGURATION</h3>
              <button
                type="button"
                className="ultron-close-btn"
                onClick={() => setIsSettingsOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ultron-settings-field">
              <label>Fish Audio API Key</label>
              <input
                type="password"
                value={fishKey}
                onChange={e => setFishKey(e.target.value)}
                placeholder="Enter your Fish Audio API Key"
              />
              <p className="ultron-settings-hint">
                Enables neural J.A.R.V.I.S. speech synthesis via your Fish Audio account.
              </p>
            </div>

            <div className="ultron-settings-field">
              <label>Voice Model Reference ID</label>
              <input
                type="text"
                value={fishRefId}
                onChange={e => setFishRefId(e.target.value)}
                placeholder="29c31f6e158c4c8f84c14f9f3d8ba008"
              />
              <p className="ultron-settings-hint">
                Default: 29c31f6e158c4c8f84c14f9f3d8ba008 (Eswar Sir&apos;s custom J.A.R.V.I.S. voice).
              </p>
            </div>

            <div className="ultron-settings-field">
              <label>Brave Browser Voice Typing</label>
              <p className="ultron-settings-hint">
                Brave blocks Google speech services by default. You can enable it at{" "}
                <code style={{ color: "#ffaa30" }}>brave://settings/privacy</code> &rarr; toggle ON &quot;Use Google services for speech recognition&quot;, or press <strong style={{ color: "#ffcc66" }}>Win + H</strong> (or <strong style={{ color: "#ffcc66" }}>Fn</strong>) to dictate directly into the chatbox!
              </p>
            </div>

            <div className="ultron-settings-actions">
              <button
                type="button"
                className="ultron-icon-btn"
                onClick={handleTestVoice}
                disabled={testVoiceLoading}
              >
                {testVoiceLoading ? "TESTING..." : "🔊 TEST VOICE"}
              </button>
              <button
                type="button"
                className="ultron-send-btn"
                onClick={handleSaveSettings}
              >
                SAVE SETTINGS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC TRANSLUCENT GLASSY CHAT / GLOWING MINI ORB BALL */}
      <div
        className={`ultron-chat-container ${isExpanded ? "expanded" : "collapsed"}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {!isExpanded ? (
          <button
            type="button"
            className="ultron-ball-trigger"
            onClick={() => setIsChatOpen(true)}
            aria-label="Open Ultron AI Chat"
            title="Move cursor here or click to chat with Ultron"
          >
            <div className="ultron-ball-core" />
            <div className="ultron-ball-ring" />
            <div className="ultron-ball-ring-outer" />
            <span className="ultron-ball-icon">✦</span>
          </button>
        ) : (
          <section className="ultron-chat">
            <header className="ultron-chat-header">
              <div className="ultron-header-info">
                <div className="ultron-avatar-dot" />
                <div>
                  <strong>ULTRON AI</strong>
                  <small>HOLOGRAPHIC INTELLIGENCE SYSTEM</small>
                </div>
              </div>

              <div className="ultron-header-actions">
                <span className="ultron-provider">
                  {provider}
                </span>
                <button
                  type="button"
                  className="ultron-close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsChatOpen(false);
                    setIsHovered(false);
                    setIsInputFocused(false);
                  }}
                  title="Minimize to orb ball"
                  aria-label="Minimize"
                >
                  ✕
                </button>
              </div>
            </header>

            <div className="ultron-messages" aria-live="polite">
              {error && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(255, 70, 70, 0.15)",
                    border: "1px solid rgba(255, 100, 100, 0.4)",
                    borderRadius: "8px",
                    color: "#ff8888",
                    fontSize: "11px",
                    lineHeight: "1.5",
                  }}
                >
                  {error}
                </div>
              )}

              {messages.length === 0 && (
                <div className="ultron-welcome">
                  <strong>Welcome, Eswar Sir.</strong>
                  <p>How may I assist you today?</p>
                </div>
              )}

              {messages.map((item, index) => (
                <div
                  key={index}
                  className={`ultron-message ${item.role}`}
                >
                  <small>
                    {item.role === "user" ? "YOU" : "ULTRON"}
                  </small>
                  <p>{item.content}</p>
                  {item.actionUrl && (
                    <a
                      href={item.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ultron-action-link"
                    >
                      ↗ Open {item.actionName || "Website"}
                    </a>
                  )}
                </div>
              ))}

              {loading && (
                <div className="ultron-thinking">
                  <span className="pulse-dot" />
                  ULTRON IS THINKING...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form
              className="ultron-input-row"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              <button
                type="button"
                className="ultron-icon-btn"
                onClick={() => setVoiceEnabled(v => !v)}
                aria-label="Toggle voice"
                title="Toggle voice"
              >
                {voiceEnabled ? "VOICE ON" : "VOICE OFF"}
              </button>

              <input
                value={input}
                onChange={event => setInput(event.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="Ask Ultron or say 'open hi5 gamer channel'..."
                disabled={loading}
              />

              <button
                type="button"
                className="ultron-icon-btn"
                onClick={listening ? stopListening : startListening}
                disabled={loading}
                title="Speech to Text (or press Win+H / Fn)"
              >
                {listening ? "STOP MIC" : "MIC"}
              </button>

              <button
                type="submit"
                className="ultron-send-btn"
                disabled={loading || !input.trim()}
              >
                SEND
              </button>
            </form>
          </section>
        )}
      </div>

      <video
        ref={videoRef}
        playsInline
        muted
        style={{ display: "none" }}
      />
      <canvas
        ref={overlayRef}
        style={{ display: "none" }}
      />
    </>
  );
}
