"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { speak, transcribeAudio } from "@/lib/ultronApi";
import { sendMessage } from "@/lib/ultronApi";

interface UltronCallScreenProps {
  onHangup: () => void;
  callerName?: string;
  phoneNumber?: string;
}

export default function UltronCallScreen({
  onHangup,
  callerName = "Ultron AI",
  phoneNumber = "+1 (833) ULTRON-AI",
}: UltronCallScreenProps) {
  const [callState, setCallState] = useState<"dialing" | "connected" | "ended">("dialing");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [statusText, setStatusText] = useState("CALLING...");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastSpeech, setLastSpeech] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isListeningRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Play realistic phone ringing sound using Web Audio API
  const playRingtone = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz
      osc2.frequency.setValueAtTime(480, audioCtx.currentTime); // 480 Hz

      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.8);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 1.8);
      osc2.stop(audioCtx.currentTime + 1.8);
    } catch {
      // AudioContext not allowed before user interaction
    }
  }, []);

  // Continuous speech loop during active call
  const startRecordingLoop = useCallback(async () => {
    if (callState === "ended" || isListeningRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      isListeningRef.current = true;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        isListeningRef.current = false;

        const chunks = audioChunksRef.current;
        if (chunks.length === 0 || callState === "ended") return;

        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (audioBlob.size > 1500) {
          setStatusText("PROCESSING...");
          try {
            const transcript = await transcribeAudio(audioBlob);
            if (transcript && transcript.trim()) {
              setLastSpeech(transcript);
              setStatusText("ULTRON RESPONDING...");
              setIsSpeaking(true);

              const aiResult = await sendMessage(transcript);
              setStatusText("SPEAKING...");
              await speak(aiResult.response);
              setIsSpeaking(false);
            }
          } catch (err) {
            console.warn("Call loop audio error:", err);
          } finally {
            setStatusText("LISTENING...");
            setIsSpeaking(false);
          }
        }

        // Restart recording loop if call is still active
        if (callState !== "ended") {
          setTimeout(() => {
            void startRecordingLoop();
          }, 400);
        }
      };

      recorder.start();
      setStatusText("LISTENING...");

      // Automatically capture in 5-second conversational windows
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 5000);
    } catch (err) {
      console.warn("Call mic access:", err);
    }
  }, [callState]);

  // Handle call initiation sequence
  useEffect(() => {
    playRingtone();
    setStatusText("CALLING...");

    const dialTimeout = setTimeout(async () => {
      setCallState("connected");
      setStatusText("CONNECTED");
      setIsSpeaking(true);

      // J.A.R.V.I.S. Iconic Greeting
      try {
        await speak("Ultron Online Sir! How may I assist you today?");
      } catch (voiceErr) {
        console.warn("Greeting voice error:", voiceErr);
      } finally {
        setIsSpeaking(false);
        setStatusText("LISTENING...");
        void startRecordingLoop();
      }
    }, 2200);

    return () => {
      clearTimeout(dialTimeout);
    };
  }, [playRingtone, startRecordingLoop]);

  // Call duration counter
  useEffect(() => {
    if (callState === "connected") {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  const handleEndCall = () => {
    setCallState("ended");
    setStatusText("CALL ENDED");

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (timerRef.current) clearInterval(timerRef.current);

    void speak("Standing by, Eswar Sir.");

    setTimeout(() => {
      onHangup();
    }, 1200);
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="ultron-call-overlay">
      <div className="ultron-call-container">
        {/* Top Link Status */}
        <div className="ultron-call-satellite">
          <span className="ultron-call-live-dot" />
          <span>SATELLITE LINK // ENCRYPTED QUANTUM CHANNEL</span>
        </div>

        {/* Contact Avatar / Hologram Orb */}
        <div className="ultron-call-avatar-wrapper">
          <div className={`ultron-call-avatar-ring ${isSpeaking ? "active-speaking" : ""}`} />
          <div className="ultron-call-avatar-ring-outer" />
          <div className="ultron-call-avatar-core">
            <span className="ultron-call-core-icon">✦</span>
          </div>
        </div>

        {/* Contact Info */}
        <div className="ultron-call-info">
          <h2 className="ultron-call-name">{callerName}</h2>
          <p className="ultron-call-number">{phoneNumber}</p>
          <div className="ultron-call-status">
            {callState === "connected" ? (
              <span className="ultron-call-timer">{formatDuration(duration)}</span>
            ) : (
              <span className="ultron-call-state-text">{statusText}</span>
            )}
          </div>
          {lastSpeech && (
            <p className="ultron-call-last-speech">&ldquo;{lastSpeech}&rdquo;</p>
          )}
        </div>

        {/* Dynamic Waveform Visualizer */}
        <div className="ultron-call-waveform">
          <div className={`waveform-bar bar-1 ${isSpeaking ? "speaking" : ""}`} />
          <div className={`waveform-bar bar-2 ${isSpeaking ? "speaking" : ""}`} />
          <div className={`waveform-bar bar-3 ${isSpeaking ? "speaking" : ""}`} />
          <div className={`waveform-bar bar-4 ${isSpeaking ? "speaking" : ""}`} />
          <div className={`waveform-bar bar-5 ${isSpeaking ? "speaking" : ""}`} />
          <div className={`waveform-bar bar-6 ${isSpeaking ? "speaking" : ""}`} />
          <div className={`waveform-bar bar-7 ${isSpeaking ? "speaking" : ""}`} />
          <div className={`waveform-bar bar-8 ${isSpeaking ? "speaking" : ""}`} />
        </div>

        {/* In-Call Action Buttons */}
        <div className="ultron-call-controls">
          <button
            type="button"
            className={`ultron-call-action-btn ${isMuted ? "active" : ""}`}
            onClick={() => setIsMuted((m) => !m)}
            title="Mute Mic"
          >
            <span className="action-icon">{isMuted ? "🔇" : "🎙️"}</span>
            <span className="action-label">{isMuted ? "MUTED" : "MUTE"}</span>
          </button>

          <button
            type="button"
            className="ultron-call-hangup-btn"
            onClick={handleEndCall}
            title="End Call"
          >
            <span className="hangup-icon">✕</span>
          </button>

          <button
            type="button"
            className={`ultron-call-action-btn ${speakerOn ? "active" : ""}`}
            onClick={() => setSpeakerOn((s) => !s)}
            title="Speaker"
          >
            <span className="action-icon">🔊</span>
            <span className="action-label">SPEAKER</span>
          </button>
        </div>
      </div>
    </div>
  );
}
