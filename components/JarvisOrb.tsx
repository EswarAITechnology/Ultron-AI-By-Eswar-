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
  type UltronMessage,
} from "@/lib/ultronApi";

type CameraState = "off" | "starting" | "on" | "error";

type SpeechRecognitionResult = {
  transcript: string;
};

type SpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResult>>;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
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
    }, 700);
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
        { role: "assistant", content: reply },
      ];

      messagesRef.current = finalHistory;
      setMessages(finalHistory);

      if (result.action?.type === "OPEN_WEBSITE") {
        window.location.assign(result.action.url);
        return;
      }

      if (voiceEnabled) {
        try {
          await speak(reply);
        } catch (voiceError) {
          console.error("Voice playback failed:", voiceError);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Ultron connection failed";

      setError(message);

      const errorHistory: UltronMessage[] = [
        ...updatedHistory,
        {
          role: "assistant",
          content: `Notice: ${message}`,
        },
      ];
      messagesRef.current = errorHistory;
      setMessages(errorHistory);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [input, voiceEnabled]);

  const startListening = useCallback(() => {
    if (listening || loading) return;

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

    if (!SpeechAPI) {
      setError("VOICE INPUT NOT SUPPORTED IN THIS BROWSER");
      return;
    }

    const recognition = new SpeechAPI();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;

      if (transcript) {
        setInput(transcript);
        void handleSend(transcript);
      }
    };

    recognition.onerror = () => {
      setError("VOICE RECOGNITION FAILED");
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListening(true);

    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("COULD NOT START MICROPHONE");
    }
  }, [handleSend, listening, loading]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
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
        case "Escape":
          if (trackerRef.current) stopGestures();
          stopListening();
          setIsChatOpen(false);
          setIsHovered(false);
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

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <div className="hud hud-title">
        U.L.T.R.O.N.
      </div>

      <div className="hud hud-hint">
        <div>
          <span className="key">DRAG</span> spin&nbsp;&nbsp;
          <span className="key">SCROLL</span> zoom
        </div>

        {cameraOn ? (
          <div>
            <span className="key">PINCH + MOVE</span> spin
            &nbsp;&nbsp;
            <span className="key">PINCH BOTH HANDS</span> zoom
          </div>
        ) : (
          <div>
            <span className="key">G</span> gestures
            &nbsp;&nbsp;
            <span className="key">R</span> reset
            &nbsp;&nbsp;
            <span className="key">+/−</span> zoom
          </div>
        )}
      </div>

      <div className="hud hud-controls">
        <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
          <video
            ref={videoRef}
            muted
            playsInline
            className="camera-video"
          />

          <canvas
            ref={overlayRef}
            width={208}
            height={156}
            className="camera-overlay"
          />

          <div className="camera-status">
            {status.hands > 0
              ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
              : "SHOW HANDS"}
          </div>
        </div>

        {error && (
          <div className="hud-error" role="alert">
            {error}
          </div>
        )}

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
        </div>
      </div>

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
                placeholder="Ask Ultron anything..."
                disabled={loading}
              />

              <button
                type="button"
                className="ultron-icon-btn"
                onClick={listening ? stopListening : startListening}
                disabled={loading}
                title="Speech to Text"
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
    </>
  );
}
