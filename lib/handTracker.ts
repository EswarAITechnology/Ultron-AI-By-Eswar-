import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// ─────────────────────────────────────────────
// LANDMARKS
// ─────────────────────────────────────────────

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

// ─────────────────────────────────────────────
// GESTURE TUNING
// ─────────────────────────────────────────────

// Lower = easier to trigger pinch.
const PINCH_ON = 0.30;

// Higher = harder to release pinch.
// This hysteresis prevents flickering.
const PINCH_OFF = 0.46;

// Rotation sensitivity.
const ROTATE_SPEED = 4.8;

// Hand-position smoothing.
// 0.25 = very smooth
// 0.50 = responsive
const POSITION_SMOOTHING = 0.38;

// Maximum movement applied during one frame.
// Prevents sudden tracking jumps.
const MAX_ROTATION_DELTA = 0.12;

// Zoom limits.
const MIN_ZOOM_FACTOR = 0.88;
const MAX_ZOOM_FACTOR = 1.14;

// Maximum tracking FPS.
// 30 is usually much smoother on phones than attempting 60 FPS detection.
const TARGET_TRACKING_FPS = 30;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type GestureMode = "idle" | "spin" | "zoom";

export interface TrackerStatus {
  hands: number;
  mode: GestureMode;
}

export interface HandTrackerCallbacks {
  onRotate(deltaTheta: number, deltaPhi: number): void;
  onZoom(factor: number): void;
  onStatus(status: TrackerStatus): void;
}

interface Point {
  x: number;
  y: number;
}

interface HandState {
  pinching: boolean;
  grab: Point;
  confidence: number;
}

// ─────────────────────────────────────────────
// HAND TRACKER
// ─────────────────────────────────────────────

export class HandTracker {
  private video: HTMLVideoElement;
  private overlay: HTMLCanvasElement;
  private callbacks: HandTrackerCallbacks;

  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;

  private rafId = 0;
  private running = false;

  private lastVideoTime = -1;
  private lastDetectionTime = 0;

  private readonly detectionInterval =
    1000 / TARGET_TRACKING_FPS;

  private handStates = new Map<string, HandState>();

  private prevMode: GestureMode = "idle";
  private prevSpinGrab: Point | null = null;
  private prevZoomDist: number | null = null;

  private lastStatus: TrackerStatus = {
    hands: 0,
    mode: "idle",
  };

  private lastOverlayDraw = 0;

  // ───────────────────────────────────────────
  // CONSTRUCTOR
  // ───────────────────────────────────────────

  constructor(
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
    callbacks: HandTrackerCallbacks,
  ) {
    this.video = video;
    this.overlay = overlay;
    this.callbacks = callbacks;
  }

  // ───────────────────────────────────────────
  // START
  // ───────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API unavailable");
    }

    // Camera stream.
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: {
          ideal: 640,
          max: 1280,
        },
        height: {
          ideal: 480,
          max: 720,
        },
        frameRate: {
          ideal: 30,
          max: 30,
        },
        facingMode: "user",
      },
      audio: false,
    });

    this.video.srcObject = this.stream;

    // Don't let the video element create unnecessary layout work.
    this.video.muted = true;
    this.video.playsInline = true;

    await this.video.play();

    const fileset =
      await FilesetResolver.forVisionTasks(WASM_CDN);

    const commonOptions = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
      },

      runningMode: "VIDEO" as const,

      numHands: 2,

      minHandDetectionConfidence: 0.55,

      minHandPresenceConfidence: 0.55,

      minTrackingConfidence: 0.55,
    };

    // Try GPU first.
    try {
      this.landmarker =
        await HandLandmarker.createFromOptions(
          fileset,
          {
            ...commonOptions,
            baseOptions: {
              ...commonOptions.baseOptions,
              delegate: "GPU" as const,
            },
          },
        );
    } catch {
      // CPU fallback.
      this.landmarker =
        await HandLandmarker.createFromOptions(
          fileset,
          {
            ...commonOptions,
            baseOptions: {
              ...commonOptions.baseOptions,
              delegate: "CPU" as const,
            },
          },
        );
    }

    this.running = true;

    this.lastVideoTime = -1;
    this.lastDetectionTime = 0;

    this.loop();
  }

  // ───────────────────────────────────────────
  // STOP
  // ───────────────────────────────────────────

  stop(): void {
    this.running = false;

    cancelAnimationFrame(this.rafId);

    this.rafId = 0;

    this.landmarker?.close();

    this.landmarker = null;

    this.stream
      ?.getTracks()
      .forEach((track) => track.stop());

    this.stream = null;

    this.video.pause();
    this.video.srcObject = null;

    this.handStates.clear();

    this.prevMode = "idle";
    this.prevSpinGrab = null;
    this.prevZoomDist = null;

    const ctx = this.overlay.getContext("2d");

    if (ctx) {
      ctx.clearRect(
        0,
        0,
        this.overlay.width,
        this.overlay.height,
      );
    }

    this.emitStatus({
      hands: 0,
      mode: "idle",
    });
  }

  // ───────────────────────────────────────────
  // MAIN LOOP
  // ───────────────────────────────────────────

  private loop = () => {
    if (!this.running) return;

    this.rafId =
      requestAnimationFrame(this.loop);

    if (!this.landmarker) return;

    if (this.video.readyState < 2) return;

    const now = performance.now();

    // Limit expensive MediaPipe detection.
    if (
      now - this.lastDetectionTime <
      this.detectionInterval
    ) {
      return;
    }

    // Don't process identical video frames.
    if (
      this.video.currentTime ===
      this.lastVideoTime
    ) {
      return;
    }

    this.lastVideoTime =
      this.video.currentTime;

    this.lastDetectionTime = now;

    let result;

    try {
      result =
        this.landmarker.detectForVideo(
          this.video,
          now,
        );
    } catch {
      return;
    }

    const labels =
      result.handedness.map(
        (hand) =>
          hand[0]?.categoryName ?? "?",
      );

    this.processHands(
      result.landmarks,
      labels,
    );

    // Draw the preview less frequently than tracking.
    // This reduces canvas work.
    if (
      now - this.lastOverlayDraw >
      1000 / 20
    ) {
      this.lastOverlayDraw = now;

      this.drawOverlay(
        result.landmarks,
      );
    }
  };

  // ───────────────────────────────────────────
  // PROCESS HANDS
  // ───────────────────────────────────────────

  private processHands(
    landmarks: NormalizedLandmark[][],
    labels: string[],
  ): void {
    const pinchedGrabs: Point[] = [];

    const seen = new Set<string>();

    for (
      let i = 0;
      i < landmarks.length;
      i++
    ) {
      const lm = landmarks[i];

      const label =
        labels[i] ||
        `hand-${i}`;

      seen.add(label);

      if (!lm || lm.length <= MIDDLE_MCP) {
        continue;
      }

      // ─────────────────────────────────────
      // HAND SCALE
      // ─────────────────────────────────────

      const handScale =
        dist2d(
          lm[WRIST],
          lm[MIDDLE_MCP],
        );

      if (handScale < 0.0001) {
        continue;
      }

      // ─────────────────────────────────────
      // PINCH DISTANCE
      // ─────────────────────────────────────

      const pinchDistance =
        dist2d(
          lm[THUMB_TIP],
          lm[INDEX_TIP],
        );

      const pinchRatio =
        pinchDistance /
        handScale;

      // ─────────────────────────────────────
      // MIRRORED POSITION
      // ─────────────────────────────────────

      const raw: Point = {
        x:
          1 -
          (lm[THUMB_TIP].x +
            lm[INDEX_TIP].x) /
            2,

        y:
          (lm[THUMB_TIP].y +
            lm[INDEX_TIP].y) /
            2,
      };

      let state =
        this.handStates.get(label);

      if (!state) {
        state = {
          pinching: false,

          grab: {
            x: raw.x,
            y: raw.y,
          },

          confidence: 0,
        };

        this.handStates.set(
          label,
          state,
        );
      }

      // ─────────────────────────────────────
      // PINCH HYSTERESIS
      // ─────────────────────────────────────

      if (state.pinching) {
        if (
          pinchRatio >
          PINCH_OFF
        ) {
          state.pinching = false;
        }
      } else {
        if (
          pinchRatio <
          PINCH_ON
        ) {
          state.pinching = true;
        }
      }

      // ─────────────────────────────────────
      // POSITION SMOOTHING
      // ─────────────────────────────────────

      state.grab.x +=
        (raw.x - state.grab.x) *
        POSITION_SMOOTHING;

      state.grab.y +=
        (raw.y - state.grab.y) *
        POSITION_SMOOTHING;

      // Simple confidence estimate.
      state.confidence =
        Math.max(
          0,
          Math.min(
            1,
            1 -
              Math.abs(
                pinchRatio - 0.3,
              ),
          ),
        );

      if (state.pinching) {
        pinchedGrabs.push({
          x: state.grab.x,
          y: state.grab.y,
        });
      }
    }

    // ─────────────────────────────────────────
    // REMOVE LOST HANDS
    // ─────────────────────────────────────────

    for (
      const key of this.handStates.keys()
    ) {
      if (!seen.has(key)) {
        this.handStates.delete(key);
      }
    }

    // ─────────────────────────────────────────
    // DETERMINE MODE
    // ─────────────────────────────────────────

    const mode: GestureMode =
      pinchedGrabs.length >= 2
        ? "zoom"
        : pinchedGrabs.length === 1
          ? "spin"
          : "idle";

    // ─────────────────────────────────────────
    // MODE CHANGE
    // ─────────────────────────────────────────

    if (mode !== this.prevMode) {
      this.prevSpinGrab = null;
      this.prevZoomDist = null;

      this.prevMode = mode;
    }

    // ─────────────────────────────────────────
    // SINGLE-HAND SPIN
    // ─────────────────────────────────────────

    if (mode === "spin") {
      const grab =
        pinchedGrabs[0];

      if (grab && this.prevSpinGrab) {
        let dx =
          grab.x -
          this.prevSpinGrab.x;

        let dy =
          grab.y -
          this.prevSpinGrab.y;

        // Prevent tracking glitches from
        // creating giant camera jumps.
        dx = clamp(
          dx,
          -MAX_ROTATION_DELTA,
          MAX_ROTATION_DELTA,
        );

        dy = clamp(
          dy,
          -MAX_ROTATION_DELTA,
          MAX_ROTATION_DELTA,
        );

        if (
          Math.abs(dx) > 0.0005 ||
          Math.abs(dy) > 0.0005
        ) {
          this.callbacks.onRotate(
            dx * ROTATE_SPEED,
            dy * ROTATE_SPEED,
          );
        }
      }

      if (grab) {
        this.prevSpinGrab = {
          x: grab.x,
          y: grab.y,
        };
      }
    }

    // ─────────────────────────────────────────
    // TWO-HAND ZOOM
    // ─────────────────────────────────────────

    if (mode === "zoom") {
      const a =
        pinchedGrabs[0];

      const b =
        pinchedGrabs[1];

      if (a && b) {
        const distance =
          Math.hypot(
            a.x - b.x,
            a.y - b.y,
          );

        if (
          this.prevZoomDist !== null &&
          distance > 0.01
        ) {
          let factor =
            this.prevZoomDist /
            distance;

          factor = clamp(
            factor,
            MIN_ZOOM_FACTOR,
            MAX_ZOOM_FACTOR,
          );

          // Ignore extremely tiny movements.
          if (
            Math.abs(factor - 1) >
            0.003
          ) {
            this.callbacks.onZoom(
              factor,
            );
          }
        }

        this.prevZoomDist =
          distance;
      }
    }

    // ─────────────────────────────────────────
    // STATUS
    // ─────────────────────────────────────────

    this.emitStatus({
      hands: landmarks.length,
      mode,
    });
  }

  // ───────────────────────────────────────────
  // STATUS
  // ───────────────────────────────────────────

  private emitStatus(
    status: TrackerStatus,
  ): void {
    if (
      status.hands !==
        this.lastStatus.hands ||
      status.mode !==
        this.lastStatus.mode
    ) {
      this.lastStatus =
        status;

      this.callbacks.onStatus(
        status,
      );
    }
  }

  // ───────────────────────────────────────────
  // CAMERA OVERLAY
  // ───────────────────────────────────────────

  private drawOverlay(
    landmarks: NormalizedLandmark[][],
  ): void {
    const ctx =
      this.overlay.getContext("2d");

    if (!ctx) return;

    const width =
      this.overlay.width;

    const height =
      this.overlay.height;

    ctx.clearRect(
      0,
      0,
      width,
      height,
    );

    ctx.lineCap = "round";

    for (const lm of landmarks) {
      if (
        lm.length <=
        INDEX_TIP
      ) {
        continue;
      }

      const thumb =
        lm[THUMB_TIP];

      const index =
        lm[INDEX_TIP];

      const tx =
        (1 - thumb.x) *
        width;

      const ty =
        thumb.y *
        height;

      const ix =
        (1 - index.x) *
        width;

      const iy =
        index.y *
        height;

      const handScale =
        dist2d(
          lm[WRIST],
          lm[MIDDLE_MCP],
        );

      const pinchRatio =
        handScale > 0.0001
          ? dist2d(
              thumb,
              index,
            ) /
            handScale
          : 999;

      const pinched =
        pinchRatio <
        PINCH_ON;

      // ─────────────────────────────────────
      // PINCH CONNECTION
      // ─────────────────────────────────────

      ctx.strokeStyle =
        pinched
          ? "#ffcc66"
          : "rgba(255,170,48,0.55)";

      ctx.lineWidth =
        pinched ? 2 : 1;

      ctx.beginPath();

      ctx.moveTo(tx, ty);

      ctx.lineTo(ix, iy);

      ctx.stroke();

      // ─────────────────────────────────────
      // FINGERTIP DOTS
      // ─────────────────────────────────────

      ctx.fillStyle =
        pinched
          ? "#ffcc66"
          : "rgba(255,170,48,0.75)";

      drawDot(
        ctx,
        tx,
        ty,
        pinched ? 5 : 3,
      );

      drawDot(
        ctx,
        ix,
        iy,
        pinched ? 5 : 3,
      );
    }
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function dist2d(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
): number {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
  );
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(
    min,
    Math.min(max, value),
  );
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();

  ctx.arc(
    x,
    y,
    radius,
    0,
    Math.PI * 2,
  );

  ctx.fill();
}