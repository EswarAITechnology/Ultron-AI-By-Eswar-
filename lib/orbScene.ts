import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export interface OrbSceneApi {
  rotateBy(
    deltaTheta: number,
    deltaPhi: number,
  ): void;

  zoomBy(
    factor: number,
  ): void;

  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  dispose(): void;
}

const HOME_POSITION =
  new THREE.Vector3(
    0,
    0.5,
    5.5,
  );

const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 40;

const TARGET_FPS = 60;

export function createOrbScene(
  container: HTMLElement,
): OrbSceneApi {
  const width =
    Math.max(
      1,
      container.clientWidth,
    );

  const height =
    Math.max(
      1,
      container.clientHeight,
    );

  /*
   * Detect device capability.
   *
   * Important:
   * We do NOT force actual 4K rendering on mobile.
   * Instead, we preserve the 4K-style visual appearance
   * while keeping the internal render resolution sane.
   */
  const isMobile =
    /Android|iPhone|iPad|iPod/i.test(
      navigator.userAgent,
    );

  const deviceMemory =
    (
      navigator as Navigator & {
        deviceMemory?: number;
      }
    ).deviceMemory ?? 4;

  const cores =
    navigator.hardwareConcurrency ??
    4;

  let quality: "high" | "balanced" | "performance";

  if (
    !isMobile &&
    deviceMemory >= 8 &&
    cores >= 8
  ) {
    quality = "high";
  } else if (
    deviceMemory >= 4 &&
    cores >= 6
  ) {
    quality = "balanced";
  } else {
    quality = "performance";
  }

  const pixelRatioLimit =
    quality === "high"
      ? 2
      : quality === "balanced"
        ? 1.5
        : 1.15;

  const textOuterCount =
    quality === "high"
      ? 650
      : quality === "balanced"
        ? 420
        : 280;

  const textAmbientCount =
    quality === "high"
      ? 180
      : quality === "balanced"
        ? 120
        : 80;

  const debrisCount =
    quality === "high"
      ? 180
      : quality === "balanced"
        ? 130
        : 90;

  const dustCount =
    quality === "high"
      ? 1500
      : quality === "balanced"
        ? 1000
        : 650;

  // ─────────────────────────────────────────────
  // SCENE
  // ─────────────────────────────────────────────

  const scene =
    new THREE.Scene();

  const camera =
    new THREE.PerspectiveCamera(
      55,
      width / height,
      0.1,
      500,
    );

  camera.position.copy(
    HOME_POSITION,
  );

  const renderer =
    new THREE.WebGLRenderer({
      antialias:
        quality !== "performance",

      powerPreference:
        "high-performance",

      alpha: false,

      stencil: false,

      depth: true,
    });

  renderer.setSize(
    width,
    height,
    false,
  );

  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      pixelRatioLimit,
    ),
  );

  renderer.toneMapping =
    THREE.ACESFilmicToneMapping;

  renderer.toneMappingExposure =
    0.8;

  renderer.outputColorSpace =
    THREE.SRGBColorSpace;

  renderer.domElement.style.display =
    "block";

  renderer.domElement.style.width =
    "100%";

  renderer.domElement.style.height =
    "100%";

  renderer.domElement.style.touchAction =
    "none";

  container.appendChild(
    renderer.domElement,
  );

  // ─────────────────────────────────────────────
  // POST PROCESSING
  // ─────────────────────────────────────────────

  const composer =
    new EffectComposer(
      renderer,
    );

  composer.addPass(
    new RenderPass(
      scene,
      camera,
    ),
  );

  const bloom =
    new UnrealBloomPass(
      new THREE.Vector2(
        width,
        height,
      ),

      quality === "high"
        ? 1.7
        : quality === "balanced"
          ? 1.45
          : 1.2,

      0.35,

      0.2,
    );

  composer.addPass(
    bloom,
  );

  const chromaticShader = {
    uniforms: {
      tDiffuse: {
        value: null,
      },

      uTime: {
        value: 0,
      },

      uIntensity: {
        value:
          quality === "performance"
            ? 0.0015
            : 0.0025,
      },
    },

    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uIntensity;

      varying vec2 vUv;

      void main() {
        vec2 dir =
          vUv - vec2(0.5);

        float d =
          length(dir);

        float offset =
          uIntensity * d;

        float flicker =
          1.0 +
          0.008 *
          sin(uTime * 12.0);

        vec4 cr =
          texture2D(
            tDiffuse,
            vUv + dir * offset
          );

        vec4 cg =
          texture2D(
            tDiffuse,
            vUv
          );

        vec4 cb =
          texture2D(
            tDiffuse,
            vUv - dir * offset * 0.5
          );

        vec3 result =
          vec3(
            cr.r,
            cg.g * 1.03,
            cb.b * 0.72
          );

        result =
          mix(
            result,
            result *
              vec3(
                1.15,
                0.85,
                0.55
              ),
            0.22
          );

        gl_FragColor =
          vec4(
            result * flicker,
            1.0
          );
      }
    `,
  };

  const chromaticPass =
    new ShaderPass(
      chromaticShader,
    );

  composer.addPass(
    chromaticPass,
  );

  // ─────────────────────────────────────────────
  // CONTROLS
  // ─────────────────────────────────────────────

  const controls =
    new OrbitControls(
      camera,
      renderer.domElement,
    );

  controls.enableDamping =
    true;

  controls.dampingFactor =
    0.045;

  controls.minDistance =
    MIN_DISTANCE;

  controls.maxDistance =
    MAX_DISTANCE;

  controls.zoomSpeed =
    1.2;

  controls.rotateSpeed =
    0.65;

  controls.enablePan =
    false;

  controls.enableZoom =
    true;

  // ─────────────────────────────────────────────
  // COLORS
  // ─────────────────────────────────────────────

  const C_BRIGHT =
    0xffaa30;

  const C_MID =
    0xdd7700;

  const C_DIM =
    0x884400;

  const C_FAINT =
    0x553300;

  const C_HOT =
    0xffcc66;

  // ─────────────────────────────────────────────
  // ORB ROOT
  // ─────────────────────────────────────────────

  const orbGroup =
    new THREE.Group();

  scene.add(
    orbGroup,
  );

  function lineMat(
    color: number,
    opacity = 1,
  ) {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  function latRing(
    radius: number,
    lat: number,
    segs = 96,
  ) {
    const r =
      radius *
      Math.cos(lat);

    const y =
      radius *
      Math.sin(lat);

    const pts: THREE.Vector3[] =
      [];

    for (
      let i = 0;
      i <= segs;
      i++
    ) {
      const a =
        (i / segs) *
        Math.PI *
        2;

      pts.push(
        new THREE.Vector3(
          r * Math.cos(a),
          y,
          r * Math.sin(a),
        ),
      );
    }

    return new THREE.BufferGeometry()
      .setFromPoints(pts);
  }

  function meridian(
    radius: number,
    lon: number,
    segs = 96,
  ) {
    const pts: THREE.Vector3[] =
      [];

    for (
      let i = 0;
      i <= segs;
      i++
    ) {
      const lat =
        (i / segs) *
          Math.PI -
        Math.PI / 2;

      pts.push(
        new THREE.Vector3(
          radius *
            Math.cos(lat) *
            Math.cos(lon),

          radius *
            Math.sin(lat),

          radius *
            Math.cos(lat) *
            Math.sin(lon),
        ),
      );
    }

    return new THREE.BufferGeometry()
      .setFromPoints(pts);
  }

  // ─────────────────────────────────────────────
  // OUTER SHELL
  // ─────────────────────────────────────────────

  const outerShell =
    new THREE.Group();

  const R1 = 2;

  const latitudeStep =
    quality === "performance"
      ? 3
      : 2;

  for (
    let i = -15;
    i <= 15;
    i += latitudeStep
  ) {
    const lat =
      (i / 15) *
      (Math.PI / 2) *
      0.95;

    const opacity =
      i % 3 === 0
        ? 0.45
        : 0.1;

    outerShell.add(
      new THREE.Line(
        latRing(
          R1,
          lat,
        ),
        lineMat(
          i % 3 === 0
            ? C_MID
            : C_FAINT,
          opacity,
        ),
      ),
    );
  }

  const meridianCount =
    quality === "performance"
      ? 18
      : 24;

  for (
    let i = 0;
    i < meridianCount;
    i++
  ) {
    const lon =
      (i / meridianCount) *
      Math.PI *
      2;

    const major =
      i % 6 === 0;

    outerShell.add(
      new THREE.Line(
        meridian(
          R1,
          lon,
        ),
        lineMat(
          major
            ? C_MID
            : C_FAINT,
          major
            ? 0.55
            : 0.1,
        ),
      ),
    );
  }

  // Cross meridians.
  const CROSS_LINES =
    quality === "performance"
      ? 10
      : 14;

  for (
    let i = 0;
    i < 4;
    i++
  ) {
    const lon =
      (i / 4) *
      Math.PI *
      2;

    for (
      let j = 0;
      j < CROSS_LINES;
      j++
    ) {
      const t =
        (j /
          (CROSS_LINES - 1)) *
          2 -
        1;

      const offset =
        (t * 0.25) /
        2;

      const falloff =
        1 -
        Math.abs(t) *
          0.7;

      outerShell.add(
        new THREE.Line(
          meridian(
            R1,
            lon + offset,
            120,
          ),
          lineMat(
            Math.abs(t) <
              0.3
              ? C_BRIGHT
              : C_MID,
            0.7 *
              falloff,
          ),
        ),
      );
    }
  }

  // Equator.
  const EQ_LINES =
    quality === "performance"
      ? 10
      : 16;

  for (
    let j = 0;
    j < EQ_LINES;
    j++
  ) {
    const t =
      (j /
        (EQ_LINES - 1)) *
        2 -
      1;

    const offset =
      (t * 0.35) /
      2;

    outerShell.add(
      new THREE.Line(
        latRing(
          R1,
          offset,
          140,
        ),
        lineMat(
          Math.abs(t) <
            0.3
            ? C_BRIGHT
            : C_MID,
          0.7 *
            (1 -
              Math.abs(t) *
                0.65),
        ),
      ),
    );
  }

  orbGroup.add(
    outerShell,
  );

  // ─────────────────────────────────────────────
  // INNER CORE
  // ─────────────────────────────────────────────

  const innerCore =
    new THREE.Group();

  const R3 = 0.9;

  for (
    let s = 0;
    s < 6;
    s++
  ) {
    const pts: THREE.Vector3[] =
      [];

    const turns =
      3.5 +
      Math.random();

    const segs =
      quality === "performance"
        ? 150
        : 220;

    const phase =
      (s / 6) *
      Math.PI *
      2;

    for (
      let i = 0;
      i <= segs;
      i++
    ) {
      const t =
        i / segs;

      const lat =
        t *
          Math.PI -
        Math.PI / 2;

      const lon =
        t *
          turns *
          Math.PI *
          2 +
        phase;

      pts.push(
        new THREE.Vector3(
          R3 *
            Math.cos(lat) *
            Math.cos(lon),

          R3 *
            Math.sin(lat),

          R3 *
            Math.cos(lat) *
            Math.sin(lon),
        ),
      );
    }

    innerCore.add(
      new THREE.Line(
        new THREE.BufferGeometry()
          .setFromPoints(pts),

        lineMat(
          C_BRIGHT,
          0.32,
        ),
      ),
    );
  }

  for (
    let i = -5;
    i <= 5;
    i++
  ) {
    const lat =
      (i / 5) *
      (Math.PI / 2) *
      0.9;

    innerCore.add(
      new THREE.Line(
        latRing(
          R3,
          lat,
          70,
        ),
        lineMat(
          C_DIM,
          0.18,
        ),
      ),
    );
  }

  orbGroup.add(
    innerCore,
  );

  // ─────────────────────────────────────────────
  // CORE
  // ─────────────────────────────────────────────

  const coreR =
    0.25;

  const icoGeo =
    new THREE.IcosahedronGeometry(
      coreR,
      1,
    );

  const icoEdges =
    new THREE.EdgesGeometry(
      icoGeo,
    );

  const icoWireMat =
    lineMat(
      C_HOT,
      0.9,
    );

  const icoWire =
    new THREE.LineSegments(
      icoEdges,
      icoWireMat,
    );

  orbGroup.add(
    icoWire,
  );

  const coreSphereMat =
    new THREE.MeshBasicMaterial({
      color: C_HOT,
      transparent: true,
      opacity: 0.15,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
    });

  const coreSphere =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.15,
        12,
        12,
      ),
      coreSphereMat,
    );

  orbGroup.add(
    coreSphere,
  );

  const glowSphereMat =
    new THREE.MeshBasicMaterial({
      color: C_MID,
      transparent: true,
      opacity: 0.04,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
    });

  const glowSphere =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.5,
        12,
        12,
      ),
      glowSphereMat,
    );

  orbGroup.add(
    glowSphere,
  );

  // ─────────────────────────────────────────────
  // CODE TEXT
  // ─────────────────────────────────────────────

  const codeSnippets = [
    "sys.init()",
    "0xFF3A",
    "malloc()",
    ">> SCAN",
    "void*",
    "ACK",
    "SYNC OK",
    "ptr_ref",
    "exec()",
    "hash256",
    "::bind",
    "core.0",
    "01101001",
    "10110100",
    ">>> RDY",
    "HEAP 4K",
    "TCP/SYN",
    "mutex.lk",
    "IRQ 0x7",
    "DMA xfer",
    "REG EAX",
    "FAULT 0",
    "kernel.d",
    "pipe |>",
    "chmod +x",
    "fork()",
    "SIGTERM",
    "eth0: UP",
    "AES-256",
    "RSA 4096",
    "TLS 1.3",
    "HTTP/2",
    "latency",
    "200 OK",
    "PATCH /",
    "fn main",
    "use std",
    "impl Orb",
    "async {}",
    "spawn()",
    "arc::new",
    ".unwrap",
  ];

  interface SpriteDrift {
    phi: number;
    theta: number;
    r: number;
    speed: number;
  }

  function makeTextSprite(
    text: string,
    size: number,
  ) {
    const canvas =
      document.createElement(
        "canvas",
      );

    canvas.width = 128;
    canvas.height = 24;

    const ctx =
      canvas.getContext(
        "2d",
      );

    if (!ctx) {
      return new THREE.Sprite();
    }

    ctx.font =
      "bold 11px monospace";

    ctx.textAlign =
      "center";

    ctx.textBaseline =
      "middle";

    ctx.fillStyle =
      `rgba(255,160,40,0.65)`;

    ctx.fillText(
      text,
      64,
      12,
    );

    const texture =
      new THREE.CanvasTexture(
        canvas,
      );

    texture.minFilter =
      THREE.LinearFilter;

    texture.magFilter =
      THREE.LinearFilter;

    const material =
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending:
          THREE.AdditiveBlending,
        depthWrite: false,
      });

    const sprite =
      new THREE.Sprite(
        material,
      );

    sprite.scale.set(
      size * 4.5,
      size * 0.6,
      1,
    );

    return sprite;
  }

  function scatterText(
    count: number,
    sizeFn: () => number,
    rFn: () => number,
    speedMin: number,
    speedMax: number,
  ) {
    const group =
      new THREE.Group();

    for (
      let i = 0;
      i < count;
      i++
    ) {
      const sprite =
        makeTextSprite(
          codeSnippets[
            Math.floor(
              Math.random() *
                codeSnippets.length,
            )
          ],
          sizeFn(),
        );

      const phi =
        Math.acos(
          2 *
            Math.random() -
            1,
        );

      const theta =
        Math.random() *
        Math.PI *
        2;

      const r =
        rFn();

      sprite.position.set(
        r *
          Math.sin(phi) *
          Math.cos(theta),

        r *
          Math.cos(phi),

        r *
          Math.sin(phi) *
          Math.sin(theta),
      );

      sprite.userData = {
        phi,
        theta,
        r,
        speed:
          (
            speedMin +
            Math.random() *
              (speedMax -
                speedMin)
          ) *
          (
            Math.random() >
            0.5
              ? 1
              : -1
          ),
      } satisfies SpriteDrift;

      group.add(
        sprite,
      );
    }

    return group;
  }

  const textOuter =
    scatterText(
      textOuterCount,
      () =>
        0.04 +
        Math.random() *
          0.035,
      () =>
        R1 +
        0.03 +
        Math.random() *
          0.06,
      0.0002,
      0.0007,
    );

  orbGroup.add(
    textOuter,
  );

  const textAmbient =
    scatterText(
      textAmbientCount,
      () => 0.03,
      () =>
        R3 +
        0.2 +
        Math.random() *
          0.7,
      0.0002,
      0.0005,
    );

  orbGroup.add(
    textAmbient,
  );

  // ─────────────────────────────────────────────
  // DEBRIS
  // ─────────────────────────────────────────────

  const debrisGeos = [
    new THREE.IcosahedronGeometry(
      0.012,
      0,
    ),

    new THREE.IcosahedronGeometry(
      0.02,
      0,
    ),

    new THREE.IcosahedronGeometry(
      0.03,
      0,
    ),

    new THREE.TetrahedronGeometry(
      0.015,
      0,
    ),

    new THREE.OctahedronGeometry(
      0.018,
      0,
    ),
  ];

  interface DebrisOrbit {
    orbitR: number;
    speed: number;
    tiltX: number;
    tiltZ: number;
    phase: number;
  }

  const debris:
    THREE.Mesh[] = [];

  /*
   * Reuse materials instead of creating a new
   * material for every debris object.
   */
  const debrisMaterials = [
    new THREE.MeshBasicMaterial({
      color: C_BRIGHT,
      transparent: true,
      opacity: 0.55,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
    }),

    new THREE.MeshBasicMaterial({
      color: C_MID,
      transparent: true,
      opacity: 0.4,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ];

  for (
    let i = 0;
    i < debrisCount;
    i++
  ) {
    const geo =
      debrisGeos[
        Math.floor(
          Math.random() *
            debrisGeos.length,
        )
      ];

    const mat =
      debrisMaterials[
        Math.random() >
        0.7
          ? 0
          : 1
      ];

    const mesh =
      new THREE.Mesh(
        geo,
        mat,
      );

    const orbitR =
      1.2 +
      Math.random() *
        4;

    const speed =
      (
        0.08 +
        Math.random() *
          0.45
      ) *
      (
        Math.random() >
        0.5
          ? 1
          : -1
      );

    const tiltX =
      (
        Math.random() -
        0.5
      ) *
      Math.PI *
      0.9;

    const tiltZ =
      (
        Math.random() -
        0.5
      ) *
      Math.PI *
      0.5;

    const phase =
      Math.random() *
      Math.PI *
      2;

    mesh.userData = {
      orbitR,
      speed,
      tiltX,
      tiltZ,
      phase,
    } satisfies DebrisOrbit;

    debris.push(
      mesh,
    );

    orbGroup.add(
      mesh,
    );
  }

  // ─────────────────────────────────────────────
  // DUST
  // ─────────────────────────────────────────────

  const dustPos =
    new Float32Array(
      dustCount * 3,
    );

  for (
    let i = 0;
    i < dustCount;
    i++
  ) {
    const rr =
      0.5 +
      Math.pow(
        Math.random(),
        0.6,
      ) *
        7;

    const theta =
      Math.random() *
      Math.PI *
      2;

    const phi =
      Math.acos(
        2 *
          Math.random() -
          1,
      );

    dustPos[
      i * 3
    ] =
      rr *
      Math.sin(phi) *
      Math.cos(theta);

    dustPos[
      i * 3 + 1
    ] =
      rr *
      Math.cos(phi);

    dustPos[
      i * 3 + 2
    ] =
      rr *
      Math.sin(phi) *
      Math.sin(theta);
  }

  const dustGeo =
    new THREE.BufferGeometry();

  dustGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      dustPos,
      3,
    ),
  );

  const dotCanvas =
    document.createElement(
      "canvas",
    );

  dotCanvas.width =
    dotCanvas.height =
      32;

  const dotCtx =
    dotCanvas.getContext(
      "2d",
    );

  if (dotCtx) {
    const gradient =
      dotCtx.createRadialGradient(
        16,
        16,
        0,
        16,
        16,
        16,
      );

    gradient.addColorStop(
      0,
      "rgba(255,170,48,1)",
    );

    gradient.addColorStop(
      0.3,
      "rgba(255,120,20,0.45)",
    );

    gradient.addColorStop(
      1,
      "rgba(100,40,0,0)",
    );

    dotCtx.fillStyle =
      gradient;

    dotCtx.fillRect(
      0,
      0,
      32,
      32,
    );
  }

  const dustTexture =
    new THREE.CanvasTexture(
      dotCanvas,
    );

  const dustMat =
    new THREE.PointsMaterial({
      map: dustTexture,
      size:
        quality === "performance"
          ? 0.035
          : 0.04,
      transparent: true,
      opacity: 0.45,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      color: C_BRIGHT,
    });

  const dustPoints =
    new THREE.Points(
      dustGeo,
      dustMat,
    );

  orbGroup.add(
    dustPoints,
  );

  // ─────────────────────────────────────────────
  // SCAN RINGS
  // ─────────────────────────────────────────────

  function makeScanRing(
    radius: number,
    thickness: number,
  ) {
    const geo =
      new THREE.RingGeometry(
        radius -
          thickness,
        radius +
          thickness,
        96,
      );

    const mat =
      new THREE.MeshBasicMaterial({
        color: C_BRIGHT,
        transparent: true,
        opacity: 0,
        blending:
          THREE.AdditiveBlending,
        side:
          THREE.DoubleSide,
        depthWrite: false,
      });

    const mesh =
      new THREE.Mesh(
        geo,
        mat,
      );

    mesh.rotation.x =
      Math.PI / 2;

    return mesh;
  }

  const scanRing1 =
    makeScanRing(
      R1,
      0.01,
    );

  const scanRing2 =
    makeScanRing(
      R1 * 0.7,
      0.008,
    );

  orbGroup.add(
    scanRing1,
    scanRing2,
  );

  // ─────────────────────────────────────────────
  // CAMERA CONTROL
  // ─────────────────────────────────────────────

  const spherical =
    new THREE.Spherical();

  const offset =
    new THREE.Vector3();

  function rotateBy(
    deltaTheta: number,
    deltaPhi: number,
  ) {
    offset
      .copy(camera.position)
      .sub(controls.target);

    spherical.setFromVector3(
      offset,
    );

    spherical.theta -=
      deltaTheta;

    spherical.phi =
      THREE.MathUtils.clamp(
        spherical.phi -
          deltaPhi,
        0.05,
        Math.PI -
          0.05,
      );

    spherical.makeSafe();

    offset.setFromSpherical(
      spherical,
    );

    camera.position.copy(
      controls.target,
    ).add(offset);

    camera.lookAt(
      controls.target,
    );
  }

  function zoomBy(
    factor: number,
  ) {
    offset
      .copy(camera.position)
      .sub(controls.target);

    const distance =
      THREE.MathUtils.clamp(
        offset.length() *
          factor,
        MIN_DISTANCE,
        MAX_DISTANCE,
      );

    offset.setLength(
      distance,
    );

    camera.position.copy(
      controls.target,
    ).add(offset);
  }

  function resetView() {
    camera.position.copy(
      HOME_POSITION,
    );

    controls.target.set(
      0,
      0,
      0,
    );

    camera.lookAt(
      controls.target,
    );

    controls.update();
  }

  // ─────────────────────────────────────────────
  // ANIMATION
  // ─────────────────────────────────────────────

  const clock =
    new THREE.Clock();

  let rafId = 0;
  let disposed = false;

  let frameCounter = 0;

  function animate() {
    if (disposed) return;

    rafId =
      requestAnimationFrame(
        animate,
      );

    const t =
      clock.getElapsedTime();

    // Outer shell.
    outerShell.rotation.y +=
      0.0012;

    outerShell.rotation.x =
      Math.sin(
        t * 0.08,
      ) * 0.045;

    // Inner core.
    innerCore.rotation.y -=
      0.004;

    innerCore.rotation.z +=
      0.0015;

    innerCore.rotation.x =
      Math.cos(
        t * 0.1,
      ) * 0.06;

    // Core.
    icoWire.rotation.x +=
      0.006;

    icoWire.rotation.y +=
      0.009;

    const wave =
      Math.sin(
        t * 1.2,
      );

    const surge =
      Math.pow(
        Math.max(
          0,
          Math.sin(
            t * 0.45,
          ),
        ),
        5,
      );

    const coreScale =
      1 +
      surge * 1.1 +
      Math.sin(
        t * 5,
      ) *
        0.03;

    coreSphere.scale.setScalar(
      coreScale,
    );

    coreSphereMat.opacity =
      Math.max(
        0.03,
        Math.min(
          0.45,
          0.1 +
            wave *
              0.035 +
            surge *
              0.16,
        ),
      );

    glowSphere.scale.setScalar(
      1 +
        surge *
          0.7,
    );

    glowSphereMat.opacity =
      0.025 +
      surge *
        0.055;

    icoWire.scale.setScalar(
      1 +
        surge *
          0.45,
    );

    // Debris.
    for (
      let i = 0;
      i < debris.length;
      i++
    ) {
      const d =
        debris[i];

      const u =
        d.userData as DebrisOrbit;

      const a =
        t *
          u.speed +
        u.phase;

      d.position.set(
        u.orbitR *
          Math.cos(a) *
          Math.cos(
            u.tiltX,
          ),

        u.orbitR *
            Math.sin(
              u.tiltX,
            ) *
            Math.sin(
              a * 0.8,
            ) +
          Math.sin(
            a * 0.3 +
              u.tiltZ,
          ) *
            0.2,

        u.orbitR *
          Math.sin(a) *
          Math.cos(
            u.tiltZ,
          ),
      );

      d.rotation.x +=
        0.01;

      d.rotation.z +=
        0.007;
    }

    // Text drift.
    updateTextGroup(
      textOuter,
      t,
      1,
    );

    updateTextGroup(
      textAmbient,
      t,
      1.15,
    );

    // Scan ring 1.
    const scanY1 =
      Math.sin(
        t * 0.4,
      ) * R1;

    scanRing1.position.y =
      scanY1;

    const scanScale1 =
      Math.sqrt(
        Math.max(
          0,
          R1 * R1 -
            scanY1 *
              scanY1,
        ),
      ) / R1;

    scanRing1.scale.set(
      scanScale1,
      scanScale1,
      1,
    );

    (
      scanRing1.material as THREE.MeshBasicMaterial
    ).opacity =
      0.18 *
      scanScale1;

    // Scan ring 2.
    const scanY2 =
      Math.sin(
        t * 0.6 + 2,
      ) * R3;

    scanRing2.position.y =
      scanY2;

    const scanScale2 =
      Math.sqrt(
        Math.max(
          0,
          R3 * R3 -
            scanY2 *
              scanY2,
        ),
      ) / R3;

    scanRing2.scale.set(
      scanScale2,
      scanScale2,
      1,
    );

    (
      scanRing2.material as THREE.MeshBasicMaterial
    ).opacity =
      0.12 *
      scanScale2;

    // Dust.
    dustPoints.rotation.y +=
      0.00015;

    // Very occasional panel flicker.
    // Kept off the main path for most frames.
    frameCounter++;

    if (
      frameCounter % 12 ===
      0
    ) {
      bloom.strength =
        1.45 +
        Math.sin(
          t * 0.8,
        ) *
          0.2;
    }

    chromaticPass.uniforms.uTime.value =
      t;

    controls.update();

    composer.render();
  }

  animate();

  // ─────────────────────────────────────────────
  // TEXT UPDATE
  // ─────────────────────────────────────────────

  function updateTextGroup(
    group: THREE.Group,
    t: number,
    multiplier: number,
  ) {
    for (
      let i = 0;
      i < group.children.length;
      i++
    ) {
      const sprite =
        group.children[i];

      const u =
        sprite.userData as SpriteDrift;

      u.theta +=
        u.speed *
        multiplier;

      sprite.position.set(
        u.r *
          Math.sin(u.phi) *
          Math.cos(
            u.theta,
          ),

        u.r *
          Math.cos(u.phi),

        u.r *
          Math.sin(u.phi) *
          Math.sin(
            u.theta,
          ),
      );
    }
  }

  // ─────────────────────────────────────────────
  // RESIZE
  // ─────────────────────────────────────────────

  let resizeTimer =
    0;

  function resize() {
    if (disposed) return;

    const w =
      Math.max(
        1,
        container.clientWidth,
      );

    const h =
      Math.max(
        1,
        container.clientHeight,
      );

    camera.aspect =
      w / h;

    camera.updateProjectionMatrix();

    renderer.setSize(
      w,
      h,
      false,
    );

    composer.setSize(
      w,
      h,
    );
  }

  function onResize() {
    window.clearTimeout(
      resizeTimer,
    );

    resizeTimer =
      window.setTimeout(
        resize,
        80,
      );
  }

  window.addEventListener(
    "resize",
    onResize,
    {
      passive: true,
    },
  );

  const resizeObserver =
    new ResizeObserver(
      onResize,
    );

  resizeObserver.observe(
    container,
  );

  // ─────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────

  function dispose() {
    if (disposed) return;

    disposed = true;

    cancelAnimationFrame(
      rafId,
    );

    window.removeEventListener(
      "resize",
      onResize,
    );

    resizeObserver.disconnect();

    controls.dispose();

    scene.traverse(
      (object) => {
        const mesh =
          object as THREE.Mesh;

        if (
          mesh.geometry
        ) {
          mesh.geometry.dispose();
        }

        if (
          mesh.material
        ) {
          const materials =
            Array.isArray(
              mesh.material,
            )
              ? mesh.material
              : [
                  mesh.material,
                ];

          for (
            const material of materials
          ) {
            if (!material)
              continue;

            const mat =
              material as THREE.Material & {
                map?: THREE.Texture;
              };

            mat.map?.dispose();

            mat.dispose();
          }
        }
      },
    );

    for (
      const material of debrisMaterials
    ) {
      material.dispose();
    }

    composer.dispose();

    renderer.dispose();

    renderer.forceContextLoss();

    renderer.domElement.remove();
  }

  return {
    rotateBy,
    zoomBy,

    zoomIn: () =>
      zoomBy(0.72),

    zoomOut: () =>
      zoomBy(1.38),

    resetView,
    dispose,
  };
}