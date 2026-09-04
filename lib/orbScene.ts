import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export interface OrbSceneApi {
  rotateBy(deltaTheta: number, deltaPhi: number): void;
  zoomBy(factor: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  dispose(): void;
}

const HOME_POSITION = new THREE.Vector3(0, 0.5, 5.5);
const MIN_DISTANCE = 0.55;
const MAX_DISTANCE = 40;

export function createOrbScene(container: HTMLElement): OrbSceneApi {
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);

  // =========================================================
  // SCENE
  // =========================================================

  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0x010207);

  const camera = new THREE.PerspectiveCamera(
    55,
    width / height,
    0.05,
    500,
  );

  camera.position.copy(HOME_POSITION);

  // =========================================================
  // RENDERER
  // =========================================================

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });

  renderer.setSize(width, height, false);

  // Avoid unnecessarily high GPU load.
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.5),
  );

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  renderer.outputColorSpace = THREE.SRGBColorSpace;

  container.appendChild(renderer.domElement);

  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";

  // =========================================================
  // POST PROCESSING
  // =========================================================

  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  /*
   * Soft bloom creates the blurred neon/orb effect.
   */
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.45,
    0.75,
    0.08,
  );

  composer.addPass(bloom);

  /*
   * Final soft color/glow shader.
   *
   * This gives the orb:
   * - soft amber glow
   * - slight RGB separation
   * - subtle edge haze
   * - cinematic blur
   */
  const glowShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uGlow: { value: 0.18 },
      uChromatic: { value: 0.0018 },
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
      uniform float uGlow;
      uniform float uChromatic;

      varying vec2 vUv;

      void main() {

        vec2 center = vec2(0.5);

        vec2 direction = vUv - center;

        float distanceFromCenter = length(direction);

        // Gentle chromatic separation.
        float chroma =
          uChromatic *
          distanceFromCenter *
          2.0;

        vec4 redSample = texture2D(
          tDiffuse,
          vUv + direction * chroma
        );

        vec4 greenSample = texture2D(
          tDiffuse,
          vUv
        );

        vec4 blueSample = texture2D(
          tDiffuse,
          vUv - direction * chroma
        );

        vec3 color = vec3(
          redSample.r,
          greenSample.g,
          blueSample.b
        );

        /*
         * Very subtle animated breathing glow.
         */
        float pulse =
          1.0 +
          sin(uTime * 1.5) * 0.025;

        color *= pulse;

        /*
         * Soft center haze.
         */
        float centerGlow =
          1.0 -
          smoothstep(
            0.05,
            0.85,
            distanceFromCenter
          );

        color +=
          vec3(1.0, 0.42, 0.08) *
          centerGlow *
          uGlow;

        /*
         * Slight warm color grade.
         */
        vec3 warmColor =
          color *
          vec3(1.10, 0.90, 0.68);

        color =
          mix(
            color,
            warmColor,
            0.20
          );

        gl_FragColor =
          vec4(color, 1.0);
      }
    `,
  };

  const glowPass = new ShaderPass(glowShader);

  composer.addPass(glowPass);

  // =========================================================
  // ORBIT CONTROLS
  // =========================================================

  const controls = new OrbitControls(
    camera,
    renderer.domElement,
  );

  controls.enableDamping = true;
  controls.dampingFactor = 0.045;

  controls.enablePan = false;

  controls.enableZoom = true;

  controls.zoomSpeed = 1.5;

  controls.rotateSpeed = 0.85;

  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;

  controls.target.set(0, 0, 0);

  // =========================================================
  // COLORS
  // =========================================================

  const C_BRIGHT = 0xffb347;
  const C_MID = 0xff8c1a;
  const C_DIM = 0xb85c00;
  const C_FAINT = 0x633300;
  const C_HOT = 0xffd27a;

  // =========================================================
  // ORB ROOT
  // =========================================================

  const orbGroup = new THREE.Group();

  scene.add(orbGroup);

  // =========================================================
  // MATERIAL HELPERS
  // =========================================================

  function lineMat(
    color: number,
    opacity = 1,
  ) {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  // =========================================================
  // SPHERE GEOMETRY HELPERS
  // =========================================================

  function latRing(
    radius: number,
    lat: number,
    segs = 96,
  ) {
    const r = radius * Math.cos(lat);
    const y = radius * Math.sin(lat);

    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segs; i++) {
      const a =
        (i / segs) *
        Math.PI *
        2;

      points.push(
        new THREE.Vector3(
          r * Math.cos(a),
          y,
          r * Math.sin(a),
        ),
      );
    }

    return new THREE.BufferGeometry()
      .setFromPoints(points);
  }

  function meridian(
    radius: number,
    lon: number,
    segs = 96,
  ) {
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segs; i++) {
      const lat =
        (i / segs) *
          Math.PI -
        Math.PI / 2;

      points.push(
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
      .setFromPoints(points);
  }

  // =========================================================
  // OUTER SHELL
  // =========================================================

  const outerShell = new THREE.Group();

  const R1 = 2.0;

  // Latitude grid.
  for (let i = -13; i <= 13; i++) {
    const lat =
      (i / 13) *
      (Math.PI / 2) *
      0.95;

    const major = i % 3 === 0;

    outerShell.add(
      new THREE.Line(
        latRing(R1, lat),
        lineMat(
          major
            ? C_MID
            : C_FAINT,

          major
            ? 0.48
            : 0.10,
        ),
      ),
    );
  }

  // Longitude grid.
  for (let i = 0; i < 20; i++) {
    const lon =
      (i / 20) *
      Math.PI *
      2;

    const major = i % 5 === 0;

    outerShell.add(
      new THREE.Line(
        meridian(R1, lon),
        lineMat(
          major
            ? C_MID
            : C_FAINT,

          major
            ? 0.55
            : 0.10,
        ),
      ),
    );
  }

  // =========================================================
  // BRIGHT CROSS LINES
  // =========================================================

  const CROSS_LINES = 12;
  const CROSS_SPREAD = 0.22;

  for (let i = 0; i < 4; i++) {
    const baseLon =
      (i / 4) *
      Math.PI *
      2;

    for (let j = 0; j < CROSS_LINES; j++) {
      const t =
        (j / (CROSS_LINES - 1)) *
          2 -
        1;

      const offset =
        (t * CROSS_SPREAD) / 2;

      const falloff =
        1 -
        Math.abs(t) *
          0.65;

      outerShell.add(
        new THREE.Line(
          meridian(
            R1,
            baseLon + offset,
            120,
          ),
          lineMat(
            Math.abs(t) < 0.3
              ? C_BRIGHT
              : C_MID,

            0.65 * falloff,
          ),
        ),
      );
    }
  }

  // =========================================================
  // BRIGHT EQUATOR
  // =========================================================

  const EQ_LINES = 14;
  const EQ_SPREAD = 0.30;

  for (let j = 0; j < EQ_LINES; j++) {
    const t =
      (j / (EQ_LINES - 1)) *
        2 -
      1;

    const offset =
      (t * EQ_SPREAD) / 2;

    const falloff =
      1 -
      Math.abs(t) *
        0.60;

    outerShell.add(
      new THREE.Line(
        latRing(
          R1,
          offset,
          140,
        ),
        lineMat(
          Math.abs(t) < 0.3
            ? C_BRIGHT
            : C_MID,

          0.65 * falloff,
        ),
      ),
    );
  }

  orbGroup.add(outerShell);

  // =========================================================
  // SECONDARY SHELL
  // =========================================================

  const shell2 =
    new THREE.Group();

  const R2 = 2.10;

  for (let i = 0; i < 12; i++) {
    const lat =
      (Math.random() - 0.5) *
      Math.PI *
      0.85;

    const startLon =
      Math.random() *
      Math.PI *
      2;

    const arcLen =
      0.35 +
      Math.random() *
        1.0;

    const points: THREE.Vector3[] = [];

    for (let j = 0; j <= 45; j++) {
      const a =
        startLon +
        (j / 45) *
          arcLen;

      const r =
        R2 *
        Math.cos(lat);

      const y =
        R2 *
        Math.sin(lat);

      points.push(
        new THREE.Vector3(
          r * Math.cos(a),
          y,
          r * Math.sin(a),
        ),
      );
    }

    shell2.add(
      new THREE.Line(
        new THREE.BufferGeometry()
          .setFromPoints(points),

        lineMat(
          C_MID,
          0.18 +
            Math.random() *
              0.22,
        ),
      ),
    );
  }

  orbGroup.add(shell2);

  // =========================================================
  // INNER CORE
  // =========================================================

  const innerCore =
    new THREE.Group();

  const R3 = 0.9;

  for (let s = 0; s < 6; s++) {
    const points: THREE.Vector3[] = [];

    const turns =
      3.0 +
      Math.random() *
        1.5;

    const segments = 180;

    const phase =
      (s / 6) *
      Math.PI *
      2;

    for (let i = 0; i <= segments; i++) {
      const t =
        i / segments;

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

      points.push(
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
          .setFromPoints(points),

        lineMat(
          C_BRIGHT,
          0.30 +
            Math.random() *
              0.15,
        ),
      ),
    );
  }

  // Inner latitude rings.
  for (let i = -5; i <= 5; i++) {
    const lat =
      (i / 5) *
      (Math.PI / 2) *
      0.9;

    innerCore.add(
      new THREE.Line(
        latRing(
          R3,
          lat,
          64,
        ),
        lineMat(
          C_DIM,
          0.18,
        ),
      ),
    );
  }

  orbGroup.add(innerCore);

  // =========================================================
  // HOT CORE
  // =========================================================

  const coreR = 0.24;

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
      0.95,
    );

  const icoWire =
    new THREE.LineSegments(
      icoEdges,
      icoWireMat,
    );

  orbGroup.add(icoWire);

  // Bright center.
  const coreSphereMat =
    new THREE.MeshBasicMaterial({
      color: C_HOT,
      transparent: true,
      opacity: 0.20,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
    });

  const coreSphere =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.15,
        20,
        20,
      ),
      coreSphereMat,
    );

  orbGroup.add(coreSphere);

  // Large blurred glow sphere.
  const glowSphereMat =
    new THREE.MeshBasicMaterial({
      color: C_BRIGHT,
      transparent: true,
      opacity: 0.06,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
    });

  const glowSphere =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.52,
        20,
        20,
      ),
      glowSphereMat,
    );

  orbGroup.add(glowSphere);

  // =========================================================
  // EXTRA OUTER GLOW
  // =========================================================

  const outerGlowMat =
    new THREE.MeshBasicMaterial({
      color: 0xff8c20,
      transparent: true,
      opacity: 0.018,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });

  const outerGlow =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        2.25,
        32,
        32,
      ),
      outerGlowMat,
    );

  orbGroup.add(outerGlow);

  // =========================================================
  // CODE TEXT
  // =========================================================

  const codeSnippets = [
    "SYS.INIT",
    "0xFF3A",
    "SCAN",
    "SYNC",
    "CORE",
    "EXEC",
    "ACK",
    "READY",
    "VECTOR",
    "AI",
    "NEURAL",
    "ORBIT",
    "DATA",
    "NODE",
    "SIGNAL",
    "ACCESS",
    "ULTRON",
    "ONLINE",
  ];

  interface SpriteDrift {
    phi: number;
    theta: number;
    r: number;
    speed: number;
  }

  function makeTextSprite(
    text: string,
    size = 0.07,
  ) {
    const canvas =
      document.createElement(
        "canvas",
      );

    canvas.width = 256;
    canvas.height = 32;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      throw new Error(
        "Canvas unavailable",
      );
    }

    ctx.clearRect(
      0,
      0,
      256,
      32,
    );

    ctx.font =
      "bold 14px Courier New";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle =
      "rgba(255,170,48,0.65)";

    ctx.fillText(
      text,
      128,
      16,
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
        opacity: 0.65,
        blending:
          THREE.AdditiveBlending,
        depthWrite: false,
      });

    const sprite =
      new THREE.Sprite(
        material,
      );

    sprite.scale.set(
      size * 5,
      size * 0.7,
      1,
    );

    return sprite;
  }

  function scatterText(
    count: number,
    sizeFn: () => number,
    radiusFn: () => number,
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
          2 * Math.random() - 1,
        );

      const theta =
        Math.random() *
        Math.PI *
        2;

      const r =
        radiusFn();

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
          (speedMin +
            Math.random() *
              speedMax) *
          (Math.random() > 0.5
            ? 1
            : -1),
      } satisfies SpriteDrift;

      group.add(sprite);
    }

    return group;
  }

  // Reduced text counts for smoother performance.
  const textOuter =
    scatterText(
      450,
      () =>
        0.035 +
        Math.random() *
          0.035,
      () =>
        R1 +
        0.04 +
        Math.random() *
          0.08,
      0.0003,
      0.0007,
    );

  orbGroup.add(textOuter);

  const textInner =
    scatterText(
      60,
      () =>
        0.03 +
        Math.random() *
          0.02,
      () => R3 + 0.03,
      0.0004,
      0.0009,
    );

  orbGroup.add(textInner);

  // =========================================================
  // DEBRIS
  // =========================================================

  const debrisGeos = [
    new THREE.IcosahedronGeometry(
      0.012,
      0,
    ),
    new THREE.IcosahedronGeometry(
      0.02,
      0,
    ),
    new THREE.TetrahedronGeometry(
      0.015,
      0,
    ),
    new THREE.OctahedronGeometry(
      0.016,
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

  const debris: THREE.Mesh[] = [];

  for (
    let i = 0;
    i < 120;
    i++
  ) {
    const geometry =
      debrisGeos[
        Math.floor(
          Math.random() *
            debrisGeos.length,
        )
      ];

    const material =
      new THREE.MeshBasicMaterial({
        color:
          Math.random() > 0.7
            ? C_BRIGHT
            : C_MID,
        transparent: true,
        opacity:
          0.3 +
          Math.random() *
            0.5,
        blending:
          THREE.AdditiveBlending,
        depthWrite: false,
      });

    const mesh =
      new THREE.Mesh(
        geometry,
        material,
      );

    const orbitR =
      1.2 +
      Math.random() * 4.0;

    const speed =
      (0.08 +
        Math.random() * 0.45) *
      (Math.random() > 0.5
        ? 1
        : -1);

    const tiltX =
      (Math.random() - 0.5) *
      Math.PI *
      0.9;

    const tiltZ =
      (Math.random() - 0.5) *
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

    debris.push(mesh);

    orbGroup.add(mesh);
  }

  // =========================================================
  // DUST
  // =========================================================

  const dustCount = 1000;

  const dustPos =
    new Float32Array(
      dustCount * 3,
    );

  for (
    let i = 0;
    i < dustCount;
    i++
  ) {
    const radius =
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
        2 * Math.random() - 1,
      );

    dustPos[i * 3] =
      radius *
      Math.sin(phi) *
      Math.cos(theta);

    dustPos[i * 3 + 1] =
      radius *
      Math.cos(phi);

    dustPos[i * 3 + 2] =
      radius *
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
    dotCanvas.height = 64;

  const dotCtx =
    dotCanvas.getContext("2d");

  if (dotCtx) {
    const gradient =
      dotCtx.createRadialGradient(
        32,
        32,
        0,
        32,
        32,
        32,
      );

    gradient.addColorStop(
      0,
      "rgba(255,190,90,1)",
    );

    gradient.addColorStop(
      0.25,
      "rgba(255,140,30,0.5)",
    );

    gradient.addColorStop(
      0.55,
      "rgba(180,70,0,0.12)",
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
      64,
      64,
    );
  }

  const dustTexture =
    new THREE.CanvasTexture(
      dotCanvas,
    );

  const dustMaterial =
    new THREE.PointsMaterial({
      map: dustTexture,
      size: 0.045,
      transparent: true,
      opacity: 0.45,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      color: C_BRIGHT,
    });

  const dust =
    new THREE.Points(
      dustGeo,
      dustMaterial,
    );

  orbGroup.add(dust);

  // =========================================================
  // SCANNING RINGS
  // =========================================================

  function createScanRing(
    radius: number,
  ) {
    const geometry =
      new THREE.RingGeometry(
        radius - 0.012,
        radius + 0.012,
        96,
      );

    const material =
      new THREE.MeshBasicMaterial({
        color: C_BRIGHT,
        transparent: true,
        opacity: 0,
        blending:
          THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

    const mesh =
      new THREE.Mesh(
        geometry,
        material,
      );

    mesh.rotation.x =
      Math.PI / 2;

    return mesh;
  }

  const scanRing1 =
    createScanRing(R1);

  const scanRing2 =
    createScanRing(
      R1 * 0.7,
    );

  orbGroup.add(
    scanRing1,
    scanRing2,
  );

  // =========================================================
  // CAMERA FUNCTIONS
  // =========================================================

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
        0.02,
        Math.PI - 0.02,
      );

    spherical.makeSafe();

    offset.setFromSpherical(
      spherical,
    );

    camera.position
      .copy(controls.target)
      .add(offset);

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

    camera.position
      .copy(controls.target)
      .add(offset);

    camera.lookAt(
      controls.target,
    );
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

  // =========================================================
  // ANIMATION
  // =========================================================

  const clock =
    new THREE.Clock();

  let animationId = 0;
  let disposed = false;

  function animate() {
    if (disposed) return;

    animationId =
      requestAnimationFrame(
        animate,
      );

    const t =
      clock.getElapsedTime();

    // -------------------------------------------------------
    // SHELL ROTATION
    // -------------------------------------------------------

    outerShell.rotation.y +=
      0.0012;

    outerShell.rotation.x =
      Math.sin(t * 0.08) *
      0.045;

    shell2.rotation.y -=
      0.0008;

    shell2.rotation.z =
      Math.sin(t * 0.12) *
      0.025;

    innerCore.rotation.y -=
      0.004;

    innerCore.rotation.z +=
      0.0015;

    icoWire.rotation.x +=
      0.006;

    icoWire.rotation.y +=
      0.009;

    // -------------------------------------------------------
    // CORE PULSE
    // -------------------------------------------------------

    const pulse =
      Math.sin(t * 1.3);

    const wave =
      Math.max(
        0,
        Math.sin(t * 0.7),
      );

    const surge =
      Math.pow(wave, 5);

    const coreScale =
      1 +
      surge * 1.8 +
      pulse * 0.025;

    coreSphere.scale.setScalar(
      coreScale,
    );

    glowSphere.scale.setScalar(
      1 +
        surge *
          1.4,
    );

    outerGlow.scale.setScalar(
      1 +
        surge *
          0.25,
    );

    coreSphereMat.opacity =
      THREE.MathUtils.clamp(
        0.14 +
          surge * 0.28 +
          pulse * 0.025,
        0.04,
        0.55,
      );

    glowSphereMat.opacity =
      THREE.MathUtils.clamp(
        0.045 +
          surge * 0.11,
        0.02,
        0.22,
      );

    outerGlowMat.opacity =
      THREE.MathUtils.clamp(
        0.015 +
          surge * 0.025,
        0.008,
        0.05,
      );

    icoWire.scale.setScalar(
      1 +
        surge *
          0.45,
    );

    icoWireMat.opacity =
      THREE.MathUtils.clamp(
        0.62 +
          surge * 0.3,
        0.4,
        1,
      );

    // -------------------------------------------------------
    // DEBRIS
    // -------------------------------------------------------

    for (const mesh of debris) {
      const data =
        mesh.userData as DebrisOrbit;

      const angle =
        t *
          data.speed +
        data.phase;

      mesh.position.set(
        data.orbitR *
          Math.cos(angle) *
          Math.cos(
            data.tiltX,
          ),

        data.orbitR *
            Math.sin(
              data.tiltX,
            ) *
            Math.sin(
              angle * 0.8,
            ) +
          Math.sin(
            angle * 0.3 +
              data.tiltZ,
          ) *
            0.2,

        data.orbitR *
          Math.sin(angle) *
          Math.cos(
            data.tiltZ,
          ),
      );

      mesh.rotation.x +=
        0.012;

      mesh.rotation.z +=
        0.008;
    }

    // -------------------------------------------------------
    // TEXT
    // -------------------------------------------------------

    const textGroups: [
      THREE.Group,
      number,
    ][] = [
      [textOuter, 1],
      [textInner, 1.5],
    ];

    for (const [
      group,
      multiplier,
    ] of textGroups) {
      for (const child of group.children) {
        const data =
          child.userData as SpriteDrift;

        data.theta +=
          data.speed *
          multiplier;

        child.position.set(
          data.r *
            Math.sin(
              data.phi,
            ) *
            Math.cos(
              data.theta,
            ),

          data.r *
            Math.cos(
              data.phi,
            ),

          data.r *
            Math.sin(
              data.phi,
            ) *
            Math.sin(
              data.theta,
            ),
        );
      }
    }

    // -------------------------------------------------------
    // SCAN RINGS
    // -------------------------------------------------------

    const scanY1 =
      Math.sin(
        t * 0.45,
      ) * R1;

    scanRing1.position.y =
      scanY1;

    const scale1 =
      Math.sqrt(
        Math.max(
          0,
          R1 * R1 -
            scanY1 *
              scanY1,
        ),
      ) / R1;

    scanRing1.scale.set(
      scale1,
      scale1,
      1,
    );

    (
      scanRing1.material as THREE.MeshBasicMaterial
    ).opacity =
      0.18 * scale1;

    const scanY2 =
      Math.sin(
        t * 0.65 + 2,
      ) * R3;

    scanRing2.position.y =
      scanY2;

    const scale2 =
      Math.sqrt(
        Math.max(
          0,
          R3 * R3 -
            scanY2 *
              scanY2,
        ),
      ) / R3;

    scanRing2.scale.set(
      scale2,
      scale2,
      1,
    );

    (
      scanRing2.material as THREE.MeshBasicMaterial
    ).opacity =
      0.12 * scale2;

    // -------------------------------------------------------
    // DUST
    // -------------------------------------------------------

    dust.rotation.y +=
      0.00015;

    dust.rotation.x =
      Math.sin(t * 0.05) *
      0.03;

    // -------------------------------------------------------
    // BLOOM
    // -------------------------------------------------------

    bloom.strength =
      1.35 +
      Math.sin(t * 0.8) *
        0.18 +
      surge * 0.45;

    bloom.radius =
      0.72;

    glowPass.uniforms.uTime.value =
      t;

    glowPass.uniforms.uGlow.value =
      0.13 +
      surge * 0.08;

    // -------------------------------------------------------
    // CAMERA
    // -------------------------------------------------------

    controls.update();

    // -------------------------------------------------------
    // RENDER
    // -------------------------------------------------------

    composer.render();
  }

  animate();

  // =========================================================
  // RESIZE
  // =========================================================

  function onResize() {
    const w =
      Math.max(
        container.clientWidth,
        1,
      );

    const h =
      Math.max(
        container.clientHeight,
        1,
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

  window.addEventListener(
    "resize",
    onResize,
  );

  // =========================================================
  // CLEANUP
  // =========================================================

  function dispose() {
    if (disposed) return;

    disposed = true;

    cancelAnimationFrame(
      animationId,
    );

    window.removeEventListener(
      "resize",
      onResize,
    );

    controls.dispose();

    scene.traverse(
      (object) => {
        const mesh =
          object as THREE.Mesh;

        if (mesh.geometry) {
          mesh.geometry.dispose();
        }

        const materials =
          Array.isArray(
            mesh.material,
          )
            ? mesh.material
            : mesh.material
              ? [mesh.material]
              : [];

        for (const material of materials) {
          if (!material) continue;

          const mat =
            material as THREE.Material & {
              map?: THREE.Texture;
              alphaMap?: THREE.Texture;
              normalMap?: THREE.Texture;
            };

          mat.map?.dispose();
          mat.alphaMap?.dispose();
          mat.normalMap?.dispose();

          material.dispose();
        }
      },
    );

    composer.dispose();

    renderer.dispose();

    renderer.domElement.remove();
  }

  // =========================================================
  // PUBLIC API
  // =========================================================

  return {
    rotateBy,

    zoomBy,

    zoomIn: () =>
      zoomBy(0.55),

    zoomOut: () =>
      zoomBy(1.8),

    resetView,

    dispose,
  };
}