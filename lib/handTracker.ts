import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// MediaPipe landmark indices
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

// Other fingertip landmarks.
// Useful for explicitly tracking all 10 fingertips.
const FINGER_TIPS = [4, 8, 12, 16, 20];

// ─────────────────────────────────────────────
// PERFORMANCE
// ─────────────────────────────────────────────

// Rendering can run at 120 FPS independently.
// Hand inference is adaptive because MediaPipe inference
// at 120 FPS is unnecessarily expensive on many phones.
const MIN_DETECTION_INTERVAL = 1000 / 60;
const MAX_DETECTION_INTERVAL = 1000 / 30;

// Overlay drawing is intentionally cheaper.
const OVERLAY_INTERVAL = 1000 / 30;

// ─────────────────────────────────────────────
// PINCH
// ─────────────────────────────────────────────

const PINCH_ON = 0.30;
const PINCH_OFF = 0.46;

// ─────────────────────────────────────────────
// MOVEMENT
// ─────────────────────────────────────────────

const ROTATE_SPEED = 5.2;

const POSITION_SMOOTHING = 0.32;

// Prevent one bad MediaPipe frame from causing
// a giant camera jump.
const MAX_HAND_DELTA = 0.08;

// ─────────────────────────────────────────────
// ZOOM
// ─────────────────────────────────────────────

const MIN_ZOOM_FACTOR = 0.82;
const MAX_ZOOM_FACTOR = 1.22;

const MIN_HAND_DISTANCE = 0.025;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type GestureMode =
  | "idle"
  | "spin"
  | "zoom";

export interface TrackerStatus {
  hands: number;
  mode: GestureMode;
}

export interface HandTrackerCallbacks {
  onRotate(
    deltaTheta: number,
    deltaPhi: number,
  ): void;

  onZoom(
    factor: number,
  ): void;

  onStatus(
    status: TrackerStatus,
  ): void;
}

interface Point {
  x: number;
  y: number;
}

interface HandState {
  pinching: boolean;

  grab: Point;

  confidence: number;

  // All five fingertips.
  fingertips: Point[];
}

// ─────────────────────────────────────────────
// HAND TRACKER
// ─────────────────────────────────────────────

export class HandTracker {
  private video: HTMLVideoElement;

  private overlay: HTMLCanvasElement;

  private callbacks: HandTrackerCallbacks;

  private landmarker:
    | HandLandmarker
    | null = null;

  private stream:
    | MediaStream
    | null = null;

  private rafId = 0;

  private running = false;

  private lastVideoTime = -1;

  private lastDetectionTime = 0;

  private lastOverlayTime = 0;

  private detectionInterval =
    MIN_DETECTION_INTERVAL;

  private handStates =
    new Map<string, HandState>();

  private prevMode:
    GestureMode = "idle";

  private prevSpinGrab:
    Point | null = null;

  private prevZoomDistance:
    number | null = null;

  private lastStatus: TrackerStatus = {
    hands: 0,
    mode: "idle",
  };

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

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(
        "Camera API unavailable",
      );
    }

    this.stream =
      await navigator.mediaDevices.getUserMedia(
        {
          video: {
            facingMode: "user",

            width: {
              ideal: 1280,
              max: 1920,
            },

            height: {
              ideal: 720,
              max: 1080,
            },

            frameRate: {
              ideal: 60,
              max: 60,
            },
          },

          audio: false,
        },
      );

    this.video.srcObject =
      this.stream;

    this.video.muted = true;

    this.video.playsInline = true;

    await this.video.play();

    const fileset =
      await FilesetResolver.forVisionTasks(
        WASM_CDN,
      );

    const commonOptions = {
      runningMode:
        "VIDEO" as const,

      numHands: 2,

      minHandDetectionConfidence:
        0.55,

      minHandPresenceConfidence:
        0.55,

      minTrackingConfidence:
        0.55,
    };

    // GPU first.
    try {
      this.landmarker =
        await HandLandmarker.createFromOptions(
          fileset,
          {
            ...commonOptions,

            baseOptions: {
              modelAssetPath:
                MODEL_URL,

              delegate:
                "GPU" as const,
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
              modelAssetPath:
                MODEL_URL,

              delegate:
                "CPU" as const,
            },
          },
        );
    }

    this.running = true;

    this.lastVideoTime = -1;

    this.lastDetectionTime = 0;

    this.detectionInterval =
      MIN_DETECTION_INTERVAL;

    this.loop();
  }

  // ───────────────────────────────────────────
  // STOP
  // ───────────────────────────────────────────

  stop(): void {
    this.running = false;

    cancelAnimationFrame(
      this.rafId,
    );

    this.rafId = 0;

    this.landmarker?.close();

    this.landmarker = null;

    this.stream
      ?.getTracks()
      .forEach((track) =>
        track.stop(),
      );

    this.stream = null;

    this.video.pause();

    this.video.srcObject = null;

    this.handStates.clear();

    this.prevMode = "idle";

    this.prevSpinGrab = null;

    this.prevZoomDistance =
      null;

    const ctx =
      this.overlay.getContext("2d");

    ctx?.clearRect(
      0,
      0,
      this.overlay.width,
      this.overlay.height,
    );

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
      requestAnimationFrame(
        this.loop,
      );

    if (!this.landmarker)
      return;

    if (
      this.video.readyState < 2
    ) {
      return;
    }

    const now =
      performance.now();

    if (
      now -
        this.lastDetectionTime <
      this.detectionInterval
    ) {
      return;
    }

    if (
      this.video.currentTime ===
      this.lastVideoTime
    ) {
      return;
    }

    this.lastVideoTime =
      this.video.currentTime;

    const detectionStart =
      performance.now();

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

    const detectionTime =
      performance.now() -
      detectionStart;

    this.lastDetectionTime =
      now;

    // Adaptive detection.
    //
    // If inference becomes expensive,
    // reduce inference frequency.
    if (detectionTime > 18) {
      this.detectionInterval =
        Math.min(
          MAX_DETECTION_INTERVAL,
          this.detectionInterval +
            4,
        );
    } else if (
      detectionTime < 10
    ) {
      this.detectionInterval =
        Math.max(
          MIN_DETECTION_INTERVAL,
          this.detectionInterval -
            2,
        );
    }

    const labels =
      result.handedness.map(
        (hand) =>
          hand[0]?.categoryName ??
          "?",
      );

    this.processHands(
      result.landmarks,
      labels,
    );

    if (
      now -
        this.lastOverlayTime >=
      OVERLAY_INTERVAL
    ) {
      this.lastOverlayTime =
        now;

      this.drawOverlay(
        result.landmarks,
      );
    }
  };

  // ───────────────────────────────────────────
  // PROCESS BOTH HANDS
  // ───────────────────────────────────────────

  private processHands(
    landmarks: NormalizedLandmark[][],
    labels: string[],
  ): void {
    const pinchedGrabs: Point[] =
      [];

    const seen =
      new Set<string>();

    for (
      let i = 0;
      i < landmarks.length;
      i++
    ) {
      const lm =
        landmarks[i];

      if (
        !lm ||
        lm.length < 21
      ) {
        continue;
      }

      const label =
        labels[i] ||
        `hand-${i}`;

      seen.add(label);

      // ─────────────────────────────────────
      // HAND SIZE
      // ─────────────────────────────────────

      const handScale =
        dist2d(
          lm[WRIST],
          lm[MIDDLE_MCP],
        );

      if (
        handScale < 0.0001
      ) {
        continue;
      }

      // ─────────────────────────────────────
      // PINCH
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
      // MIRRORED GRAB POINT
      // ─────────────────────────────────────

      const rawGrab: Point = {
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

      // ─────────────────────────────────────
      // ALL FIVE FINGERTIPS
      // ─────────────────────────────────────

      const fingertips =
        FINGER_TIPS.map(
          (tipIndex) => ({
            x:
              1 -
              lm[tipIndex].x,

            y:
              lm[tipIndex].y,
          }),
        );

      let state =
        this.handStates.get(
          label,
        );

      if (!state) {
        state = {
          pinching: false,

          grab: {
            ...rawGrab,
          },

          confidence: 0,

          fingertips,
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
      // SMOOTH GRAB POSITION
      // ─────────────────────────────────────

      state.grab.x +=
        (rawGrab.x -
          state.grab.x) *
        POSITION_SMOOTHING;

      state.grab.y +=
        (rawGrab.y -
          state.grab.y) *
        POSITION_SMOOTHING;

      // Smooth all fingertips too.
      for (
        let f = 0;
        f <
        state.fingertips.length;
        f++
      ) {
        state.fingertips[f].x +=
          (fingertips[f].x -
            state.fingertips[f].x) *
          POSITION_SMOOTHING;

        state.fingertips[f].y +=
          (fingertips[f].y -
            state.fingertips[f].y) *
          POSITION_SMOOTHING;
      }

      state.confidence =
        clamp(
          1 -
            pinchRatio *
              0.15,
          0,
          1,
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
        this.handStates.delete(
          key,
        );
      }
    }

    // ─────────────────────────────────────────
    // MODE
    // ─────────────────────────────────────────

    const mode: GestureMode =
      pinchedGrabs.length >= 2
        ? "zoom"
        : pinchedGrabs.length === 1
          ? "spin"
          : "idle";

    // ─────────────────────────────────────────
    // RESET REFERENCES WHEN MODE CHANGES
    // ─────────────────────────────────────────

    if (
      mode !== this.prevMode
    ) {
      this.prevSpinGrab =
        null;

      this.prevZoomDistance =
        null;

      this.prevMode = mode;
    }

    // ─────────────────────────────────────────
    // ONE HAND = 360° ROTATION
    // ─────────────────────────────────────────

    if (
      mode === "spin" &&
      pinchedGrabs[0]
    ) {
      const grab =
        pinchedGrabs[0];

      if (this.prevSpinGrab) {
        let dx =
          grab.x -
          this.prevSpinGrab.x;

        let dy =
          grab.y -
          this.prevSpinGrab.y;

        dx = clamp(
          dx,
          -MAX_HAND_DELTA,
          MAX_HAND_DELTA,
        );

        dy = clamp(
          dy,
          -MAX_HAND_DELTA,
          MAX_HAND_DELTA,
        );

        if (
          Math.abs(dx) >
            0.0003 ||
          Math.abs(dy) >
            0.0003
        ) {
          this.callbacks.onRotate(
            dx * ROTATE_SPEED,
            dy * ROTATE_SPEED,
          );
        }
      }

      this.prevSpinGrab = {
        x: grab.x,
        y: grab.y,
      };
    }

    // ─────────────────────────────────────────
    // TWO HANDS = CONTINUOUS ZOOM
    // ─────────────────────────────────────────

    if (
      mode === "zoom" &&
      pinchedGrabs.length >= 2
    ) {
      const a =
        pinchedGrabs[0];

      const b =
        pinchedGrabs[1];

      const distance =
        Math.hypot(
          a.x - b.x,
          a.y - b.y,
        );

      if (
        distance >
        MIN_HAND_DISTANCE
      ) {
        if (
          this.prevZoomDistance !==
            null &&
          this.prevZoomDistance >
            MIN_HAND_DISTANCE
        ) {
          let factor =
            this.prevZoomDistance /
            distance;

          factor = clamp(
            factor,
            MIN_ZOOM_FACTOR,
            MAX_ZOOM_FACTOR,
          );

          if (
            Math.abs(
              factor - 1,
            ) > 0.001
          ) {
            this.callbacks.onZoom(
              factor,
            );
          }
        }

        this.prevZoomDistance =
          distance;
      }
    }

    // ─────────────────────────────────────────
    // STATUS
    // ─────────────────────────────────────────

    this.emitStatus({
      hands: Math.min(
        landmarks.length,
        2,
      ),
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
  // VISUAL OVERLAY
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
        lm.length < 21
      ) {
        continue;
      }

      // Draw all 10 fingertips.
      for (
        const tipIndex of FINGER_TIPS
      ) {
        const tip =
          lm[tipIndex];

        const x =
          (1 - tip.x) *
          width;

        const y =
          tip.y *
          height;

        ctx.fillStyle =
          "rgba(255,170,48,0.8)";

        drawDot(
          ctx,
          x,
          y,
          3,
        );
      }

      // Thumb → index pinch line.
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
          : Infinity;

      const pinched =
        pinchRatio <
        PINCH_ON;

      ctx.strokeStyle =
        pinched
          ? "#ffcc66"
          : "rgba(255,170,48,0.5)";

      ctx.lineWidth =
        pinched ? 2 : 1;

      ctx.beginPath();

      ctx.moveTo(
        tx,
        ty,
      );

      ctx.lineTo(
        ix,
        iy,
      );

      ctx.stroke();

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