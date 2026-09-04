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

const PINCH_ON = 0.32;
const PINCH_OFF = 0.45;

const ROTATE_SPEED = 5.0;
const SMOOTHING = 0.4;

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

  private handStates = new Map<string, HandState>();

  private prevMode: GestureMode = "idle";
  private prevSpinGrab: Point | null = null;
  private prevZoomDist: number | null = null;

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
          facingMode: "user",
        },
        audio: false,
      });

      if (!this.stream) {
        throw new Error("Camera stream unavailable");
      }

      this.video.srcObject = this.stream;

      await this.video.play();

      const fileset =
        await FilesetResolver.forVisionTasks(WASM_CDN);

      const baseOptions = {
        modelAssetPath: MODEL_URL,
      };

      try {
        this.landmarker =
          await HandLandmarker.createFromOptions(
            fileset,
            {
              baseOptions: {
                ...baseOptions,
                delegate: "GPU",
              },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.6,
              minHandPresenceConfidence: 0.6,
              minTrackingConfidence: 0.6,
            },
          );
      } catch (gpuError) {
        console.warn(
          "GPU delegate failed. Falling back to CPU.",
          gpuError,
        );

        this.landmarker =
          await HandLandmarker.createFromOptions(
            fileset,
            {
              baseOptions: {
                ...baseOptions,
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.6,
              minHandPresenceConfidence: 0.6,
              minTrackingConfidence: 0.6,
            },
          );
      }

      this.running = true;
      this.lastVideoTime = -1;

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

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    try {
      this.landmarker?.close();
    } catch (error) {
      console.warn(
        "Failed to close MediaPipe landmarker:",
        error,
      );
    }

    this.landmarker = null;

    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });

    this.stream = null;

    this.video.pause();
    this.video.srcObject = null;

    this.handStates.clear();

    this.prevMode = "idle";
    this.prevSpinGrab = null;
    this.prevZoomDist = null;

    this.lastVideoTime = -1;

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

  private loop = () => {
    if (!this.running) return;

    this.rafId = requestAnimationFrame(this.loop);

    if (
      !this.landmarker ||
      this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return;
    }

    this.lastVideoTime = this.video.currentTime;

    try {
      const result = this.landmarker.detectForVideo(
        this.video,
        performance.now(),
      );

      const labels = result.handedness.map(
        (hand) =>
          hand[0]?.categoryName ?? "?",
      );

      this.processHands(
        result.landmarks,
        labels,
      );

      this.drawOverlay(result.landmarks);
    } catch (error) {
      console.error(
        "MediaPipe frame processing error:",
        error,
      );
    }
  };

  private processHands(
    landmarks: NormalizedLandmark[][],
    labels: string[],
  ): void {
    const pinchedGrabs: Point[] = [];
    const seen = new Set<string>();

    landmarks.forEach((lm, i) => {
      const label = labels[i] ?? `hand-${i}`;

      seen.add(label);

      const handScale = dist2d(
        lm[WRIST],
        lm[MIDDLE_MCP],
      );

      if (handScale < 1e-6) {
        return;
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
          grab: raw,
        };

        this.handStates.set(
          label,
          state,
        );
      }

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

      state.grab = {
        x:
          state.grab.x +
          (raw.x - state.grab.x) *
            SMOOTHING,

        y:
          state.grab.y +
          (raw.y - state.grab.y) *
            SMOOTHING,
      };

      if (state.pinching) {
        pinchedGrabs.push(
          state.grab,
        );
      }
    });

    for (const key of this.handStates.keys()) {
      if (!seen.has(key)) {
        this.handStates.delete(key);
      }
    }

    const mode: GestureMode =
      pinchedGrabs.length >= 2
        ? "zoom"
        : pinchedGrabs.length === 1
          ? "spin"
          : "idle";

    if (mode !== this.prevMode) {
      this.prevSpinGrab = null;
      this.prevZoomDist = null;
      this.prevMode = mode;
    }

    if (mode === "spin") {
      const grab = pinchedGrabs[0];

      if (this.prevSpinGrab) {
        const dx =
          grab.x -
          this.prevSpinGrab.x;

        const dy =
          grab.y -
          this.prevSpinGrab.y;

        if (
          Math.abs(dx) > 1e-4 ||
          Math.abs(dy) > 1e-4
        ) {
          this.callbacks.onRotate(
            dx * ROTATE_SPEED,
            dy * ROTATE_SPEED,
          );
        }
      }

      this.prevSpinGrab = {
        ...grab,
      };
    }

    if (mode === "zoom") {
      const d = Math.hypot(
        pinchedGrabs[0].x -
          pinchedGrabs[1].x,

        pinchedGrabs[0].y -
          pinchedGrabs[1].y,
      );

      if (
        this.prevZoomDist !== null &&
        d > 1e-4
      ) {
        const factor = Math.min(
          1.18,
          Math.max(
            0.85,
            this.prevZoomDist / d,
          ),
        );

        this.callbacks.onZoom(
          factor,
        );
      }

      this.prevZoomDist = d;
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
      status.hands !==
        this.lastStatus.hands ||
      status.mode !==
        this.lastStatus.mode
    ) {
      this.lastStatus = status;
      this.callbacks.onStatus(
        status,
      );
    }
  }

  private drawOverlay(
    landmarks: NormalizedLandmark[][],
  ): void {
    const ctx =
      this.overlay.getContext("2d");

    if (!ctx) return;

    const {
      width,
      height,
    } = this.overlay;

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
        handScale > 1e-6 &&
        dist2d(
          thumb,
          index,
        ) /
          handScale <
          PINCH_ON;

      ctx.strokeStyle =
        pinched
          ? "#ffcc66"
          : "rgba(255,170,48,0.5)";

      ctx.lineWidth =
        pinched ? 2 : 1;

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(ix, iy);
      ctx.stroke();

      ctx.fillStyle =
        pinched
          ? "#ffcc66"
          : "rgba(255,170,48,0.7)";

      for (const [x, y] of [
        [tx, ty],
        [ix, iy],
      ]) {
        ctx.beginPath();

        ctx.arc(
          x,
          y,
          pinched ? 5 : 3,
          0,
          Math.PI * 2,
        );

        ctx.fill();
      }
    }
  }
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