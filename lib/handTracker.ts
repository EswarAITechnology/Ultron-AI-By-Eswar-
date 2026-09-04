import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

const PINCH_ON = 0.34;
const PINCH_OFF = 0.48;

// Lower than your previous value to reduce shaky/jumpy movement.
const ROTATE_SPEED = 4.2;

// Higher = smoother, lower = more responsive.
const POSITION_SMOOTHING = 0.55;

// Additional movement dead-zone.
const MOVEMENT_DEADZONE = 0.0015;

// Limit maximum movement applied during one camera frame.
const MAX_ROTATION_STEP = 0.12;

// Zoom smoothing.
const ZOOM_SMOOTHING = 0.35;
const MIN_ZOOM_DISTANCE = 0.035;

// Process camera frames at approximately 30 FPS.
// The orb itself can continue rendering at 60 FPS.
const TARGET_TRACKING_FPS = 30;
const MIN_FRAME_INTERVAL = 1000 / TARGET_TRACKING_FPS;

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
  lastSeen: number;
}

export class HandTracker {
  private video: HTMLVideoElement;
  private overlay: HTMLCanvasElement;
  private callbacks: HandTrackerCallbacks;

  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;

  private rafId = 0;

  private running = false;
  private starting = false;

  private lastVideoTime = -1;
  private lastProcessTime = 0;

  private handStates = new Map<string, HandState>();

  private prevMode: GestureMode = "idle";

  private prevSpinGrab: Point | null = null;

  private prevZoomDist: number | null = null;
  private smoothZoomDist: number | null = null;

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

  async start(): Promise<void> {
    if (this.running || this.starting) return;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error("Camera API is not supported");
    }

    this.starting = true;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: {
            ideal: 640,
          },
          height: {
            ideal: 480,
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

      this.video.setAttribute("playsinline", "true");
      this.video.muted = true;

      await this.video.play();

      const fileset =
        await FilesetResolver.forVisionTasks(WASM_CDN);

      const commonOptions = {
        runningMode: "VIDEO" as const,
        numHands: 2,

        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      };

      try {
        this.landmarker =
          await HandLandmarker.createFromOptions(
            fileset,
            {
              ...commonOptions,
              baseOptions: {
                modelAssetPath: MODEL_URL,
                delegate: "GPU",
              },
            },
          );
      } catch (gpuError) {
        console.warn(
          "MediaPipe GPU initialization failed. Falling back to CPU.",
          gpuError,
        );

        this.landmarker =
          await HandLandmarker.createFromOptions(
            fileset,
            {
              ...commonOptions,
              baseOptions: {
                modelAssetPath: MODEL_URL,
                delegate: "CPU",
              },
            },
          );
      }

      this.running = true;
      this.lastVideoTime = -1;
      this.lastProcessTime = 0;

      this.loop();
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    this.running = false;
    this.starting = false;

    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    try {
      this.landmarker?.close();
    } catch (error) {
      console.warn(
        "Failed to close MediaPipe:",
        error,
      );
    }

    this.landmarker = null;

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }

    this.stream = null;

    try {
      this.video.pause();
    } catch {
      // Ignore video cleanup errors.
    }

    this.video.srcObject = null;

    this.handStates.clear();

    this.prevMode = "idle";
    this.prevSpinGrab = null;
    this.prevZoomDist = null;
    this.smoothZoomDist = null;

    this.lastVideoTime = -1;
    this.lastProcessTime = 0;

    this.clearOverlay();

    this.emitStatus({
      hands: 0,
      mode: "idle",
    });
  }

  private loop = () => {
    if (!this.running) return;

    this.rafId = requestAnimationFrame(this.loop);

    if (!this.landmarker) return;

    if (
      this.video.readyState <
      HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return;
    }

    const now = performance.now();

    // Keep the rendering loop independent from MediaPipe.
    if (
      now - this.lastProcessTime <
      MIN_FRAME_INTERVAL
    ) {
      return;
    }

    if (
      this.video.currentTime ===
      this.lastVideoTime
    ) {
      return;
    }

    this.lastProcessTime = now;
    this.lastVideoTime =
      this.video.currentTime;

    try {
      const result =
        this.landmarker.detectForVideo(
          this.video,
          now,
        );

      const labels =
        result.handedness.map(
          (hand, index) =>
            hand[0]?.categoryName ??
            `hand-${index}`,
        );

      this.processHands(
        result.landmarks,
        labels,
      );

      this.drawOverlay(
        result.landmarks,
      );
    } catch (error) {
      console.warn(
        "MediaPipe frame error:",
        error,
      );
    }
  };

  private processHands(
    landmarks: NormalizedLandmark[][],
    labels: string[],
  ): void {
    const now = performance.now();

    const pinchedGrabs: Point[] = [];

    const seen = new Set<string>();

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];

      const label =
        labels[i] ??
        `hand-${i}`;

      seen.add(label);

      if (
        !lm[WRIST] ||
        !lm[THUMB_TIP] ||
        !lm[INDEX_TIP] ||
        !lm[MIDDLE_MCP]
      ) {
        continue;
      }

      const handScale =
        dist2d(
          lm[WRIST],
          lm[MIDDLE_MCP],
        );

      if (handScale < 0.001) {
        continue;
      }

      const pinchRatio =
        dist2d(
          lm[THUMB_TIP],
          lm[INDEX_TIP],
        ) / handScale;

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
            ...raw,
          },
          lastSeen: now,
        };

        this.handStates.set(
          label,
          state,
        );
      }

      state.lastSeen = now;

      // Pinch hysteresis.
      if (
        state.pinching &&
        pinchRatio > PINCH_OFF
      ) {
        state.pinching = false;
      } else if (
        !state.pinching &&
        pinchRatio < PINCH_ON
      ) {
        state.pinching = true;
      }

      state.grab.x =
        lerp(
          state.grab.x,
          raw.x,
          POSITION_SMOOTHING,
        );

      state.grab.y =
        lerp(
          state.grab.y,
          raw.y,
          POSITION_SMOOTHING,
        );

      if (state.pinching) {
        pinchedGrabs.push({
          ...state.grab,
        });
      }
    }

    // Remove stale hands.
    for (const [
      key,
      state,
    ] of this.handStates) {
      if (
        !seen.has(key) ||
        now - state.lastSeen > 300
      ) {
        this.handStates.delete(key);
      }
    }

    const mode: GestureMode =
      pinchedGrabs.length >= 2
        ? "zoom"
        : pinchedGrabs.length === 1
          ? "spin"
          : "idle";

    // Reset reference points whenever the gesture changes.
    if (mode !== this.prevMode) {
      this.prevSpinGrab = null;
      this.prevZoomDist = null;
      this.smoothZoomDist = null;
      this.prevMode = mode;
    }

    if (mode === "spin") {
      const grab =
        pinchedGrabs[0];

      if (this.prevSpinGrab) {
        const dx =
          grab.x -
          this.prevSpinGrab.x;

        const dy =
          grab.y -
          this.prevSpinGrab.y;

        const filteredDx =
          Math.abs(dx) <
          MOVEMENT_DEADZONE
            ? 0
            : dx;

        const filteredDy =
          Math.abs(dy) <
          MOVEMENT_DEADZONE
            ? 0
            : dy;

        if (
          filteredDx !== 0 ||
          filteredDy !== 0
        ) {
          const theta =
            clamp(
              filteredDx *
                ROTATE_SPEED,
              -MAX_ROTATION_STEP,
              MAX_ROTATION_STEP,
            );

          const phi =
            clamp(
              filteredDy *
                ROTATE_SPEED,
              -MAX_ROTATION_STEP,
              MAX_ROTATION_STEP,
            );

          this.callbacks.onRotate(
            theta,
            phi,
          );
        }
      }

      this.prevSpinGrab = {
        ...grab,
      };
    }

    if (mode === "zoom") {
      const dx =
        pinchedGrabs[0].x -
        pinchedGrabs[1].x;

      const dy =
        pinchedGrabs[0].y -
        pinchedGrabs[1].y;

      const distance =
        Math.hypot(dx, dy);

      if (
        this.smoothZoomDist === null
      ) {
        this.smoothZoomDist =
          distance;
      } else {
        this.smoothZoomDist =
          lerp(
            this.smoothZoomDist,
            distance,
            ZOOM_SMOOTHING,
          );
      }

      if (
        this.prevZoomDist !== null &&
        this.smoothZoomDist >
          MIN_ZOOM_DISTANCE
      ) {
        const ratio =
          this.prevZoomDist /
          this.smoothZoomDist;

        const factor =
          clamp(
            ratio,
            0.94,
            1.06,
          );

        if (
          Math.abs(
            factor - 1,
          ) > 0.003
        ) {
          this.callbacks.onZoom(
            factor,
          );
        }
      }

      this.prevZoomDist =
        this.smoothZoomDist;
    }

    this.emitStatus({
      hands: landmarks.length,
      mode,
    });
  }

  private emitStatus(
    status: TrackerStatus,
  ): void {
    if (
      status.hands ===
        this.lastStatus.hands &&
      status.mode ===
        this.lastStatus.mode
    ) {
      return;
    }

    this.lastStatus = status;

    this.callbacks.onStatus(
      status,
    );
  }

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

    for (const lm of landmarks) {
      const thumb =
        lm[THUMB_TIP];

      const index =
        lm[INDEX_TIP];

      if (!thumb || !index) {
        continue;
      }

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

      const pinched =
        handScale > 0.001 &&
        dist2d(
          thumb,
          index,
        ) /
          handScale <
          PINCH_ON;

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

  private clearOverlay(): void {
    const ctx =
      this.overlay.getContext("2d");

    ctx?.clearRect(
      0,
      0,
      this.overlay.width,
      this.overlay.height,
    );
  }
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

function lerp(
  a: number,
  b: number,
  amount: number,
): number {
  return a + (b - a) * amount;
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    max,
    Math.max(min, value),
  );
}

function dist2d(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
): number {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
  );
}