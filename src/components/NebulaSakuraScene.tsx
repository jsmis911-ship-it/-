import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { IntroPhase, PhotoAsset, SceneMode } from "../types";
import {
  createCoupleKissParticleSystem,
  disposeCoupleKissParticleSystem,
  resizeCoupleKissParticleSystem,
  updateCoupleKissParticleSystem,
  type CoupleKissParticleSystem,
} from "./coupleKissParticles";

type NebulaSakuraSceneProps = {
  photos: PhotoAsset[];
  mode: SceneMode;
  selectedIndex: number;
  transitionKey: number;
  transitionDirection: -1 | 0 | 1;
  introPhase: IntroPhase;
  introSpeed: number;
  introAudioEnergyRef?: MutableRefObject<number>;
  onIntroPhaseComplete: (phase: IntroPhase) => void;
  onIntroError: () => void;
};

type PhotoEntry = {
  id: string;
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  texture: THREE.Texture;
  blurredTexture: THREE.Texture;
  aspect: number;
  idle: THREE.Vector3;
  tree: THREE.Vector3;
  sphere: THREE.Vector3;
  burst: THREE.Vector3;
  gallery: THREE.Vector3;
  wallScatter: THREE.Vector3;
  wallRushControl: THREE.Vector3;
  wallSlot: THREE.Vector3;
  wallScale: number;
  wallFloat: THREE.Vector3;
  wallRotation: THREE.Vector3;
  wallShardSeed: number;
  seed: number;
};

type PhotoShardLayer = {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  current: Float32Array;
  scatter: Float32Array;
  wall: Float32Array;
  tree: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  sizes: Float32Array;
};

type MorphParticleLayer = {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  current: Float32Array;
  idle: Float32Array;
  tree: Float32Array;
  burst: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  motionScale: Float32Array;
};

type DecorativeParticleLayer = {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  current: Float32Array;
  base: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
};

type GlowParticleLayer = DecorativeParticleLayer & {
  baseColors: Float32Array;
  pulse: Float32Array;
};

type PetalRainLayer = {
  mesh: THREE.InstancedMesh;
  geometry: THREE.PlaneGeometry;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  anchors: Float32Array;
  seeds: Float32Array;
  delays: Float32Array;
  sizes: Float32Array;
  speeds: Float32Array;
  depths: Float32Array;
  spins: Float32Array;
  glints: Float32Array;
  dummy: THREE.Object3D;
};

type ParticleLayers = {
  treeCore: MorphParticleLayer;
  ambient: DecorativeParticleLayer;
  groundPetals: DecorativeParticleLayer;
  petalRain: PetalRainLayer;
  treeGlow: GlowParticleLayer;
  coupleKiss: CoupleKissParticleSystem;
};

type TreeParticleKind = "trunk" | "branch" | "canopy";

type TreeParticleSample = {
  position: THREE.Vector3;
  color: THREE.Color;
  size: number;
  alpha: number;
  kind: TreeParticleKind;
};

type CanopyCluster = {
  center: THREE.Vector3;
  radius: THREE.Vector3;
  weight: number;
  blueBias: number;
  edgeBias: number;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PHOTO_HEIGHT = 1.24;
const TREE_SHAPE_CONFIG = {
  particleCount: 20000,
  ambientParticleCount: 1550,
  groundPetalParticleCount: 1900,
  treeGlowParticleCount: 1500,
  trunkRatio: 0.105,
  branchRatio: 0.18,
  canopyRatio: 0.715,
  canopyWidth: 11.8,
  canopyHeight: 7.9,
  canopyDepth: 6.8,
  clusterCount: 11,
  branchCount: 17,
  trunkRadius: 0.84,
  pinkRatio: 0.76,
  blueVioletRatio: 0.22,
  edgeScatter: 0.72,
  structureLockStrength: 0.078,
  treeFormationMix: 0.046,
  treeStableAfter: 2300,
  treeBreathAmplitude: 0.018,
  treeRotationSpeed: 0.00036,
  treeRotationAmplitude: 0.52,
  cameraOrbitRadius: 2.55,
  cameraOrbitDepth: 1.05,
  ambientOpacity: 0.56,
  ambientIdleOpacity: 0.22,
  ambientBurstOpacity: 0.38,
  ambientSpreadX: 16.8,
  ambientSpreadY: 11.8,
  ambientSpreadZ: 15.2,
  ambientMotionSpeed: 0.0002,
  ambientMotionAmplitude: 0.44,
  treeGlowOpacity: 0.78,
  treeGlowBurstOpacity: 0.22,
  treeGlowMotionAmplitude: 0.055,
  groundOpacity: 0.38,
  groundWidth: 6.6,
  groundDepth: 2.75,
  groundCenterDensity: 1.55,
  groundEdgeScatter: 0.42,
  groundMotionAmplitude: 0.035,
};

const SAKURA_RAIN_CONFIG = {
  particleCount: 2600,
  duration: 2550,
  waveFrontDuration: 1080,
  loosenDuration: 560,
  windDistance: 11.6,
  windPush: 2.6,
  lift: 2.15,
  fall: 4.6,
  swirlAmplitude: 0.86,
  verticalSway: 0.72,
  depthSpread: 5.8,
  foregroundScale: 1.65,
  backgroundScale: 0.52,
  globalOpacity: 0.78,
  fadeAfter: 2420,
  treeParticleWindDistance: 10.8,
  treeParticleWaveDuration: 1120,
  leftVeilRatio: 0.38,
  leftVeilWindScale: 0.38,
  leftVeilDensityBoost: 0.34,
  burstCameraPushDuration: 980,
  burstCameraFollowDelay: 360,
  burstCameraFollowDuration: 2460,
  burstCameraStartX: -1.65,
  burstCameraEndX: 1.45,
  burstCameraY: -3.85,
  burstCameraZ: 9.35,
  burstLookStartX: -0.4,
  burstLookEndX: 2.6,
  burstLookY: 3.05,
};

const INTRO_TIMING = {
  speedAnchor: 5.69,
  wallBaseMs: 2860,
  wallMinMs: 2480,
  morphBaseMs: 3180,
  morphMinMs: 2860,
  wallSettleMs: 360,
  morphSettleMs: 260,
};

const PHOTO_RUSH_CONFIG = {
  cameraZ: 19.2,
  wallLookZ: -1.1,
  deepZMin: -76,
  deepZMax: -34,
  nearZMin: 4.2,
  nearZMax: 7.2,
  farPlaneMargin: 1.18,
  nearPlaneMargin: 0.92,
  wallCoverageX: 0.86,
  wallCoverageY: 0.76,
  smallSetCoverageX: 0.78,
  smallSetCoverageY: 0.7,
  floatAmplitude: 0.15,
  floatDepthAmplitude: 0.24,
  maxRotation: THREE.MathUtils.degToRad(15),
  spawnDelayMinMs: 20,
  spawnDelayMaxMs: 380,
};

const PHOTO_SHARD_CONFIG = {
  minCount: 900,
  perPhoto: 120,
  maxCount: 4600,
  wallOpacity: 0.58,
  morphOpacity: 0.76,
  size: 0.052,
};

const CANOPY_CLUSTERS: CanopyCluster[] = [
  { center: new THREE.Vector3(0.0, 2.35, -0.55), radius: new THREE.Vector3(4.25, 2.75, 2.75), weight: 1.68, blueBias: 0.08, edgeBias: 0.14 },
  { center: new THREE.Vector3(-3.35, 1.48, -0.25), radius: new THREE.Vector3(3.85, 2.25, 2.45), weight: 1.18, blueBias: 0.34, edgeBias: 0.22 },
  { center: new THREE.Vector3(3.45, 1.55, -0.08), radius: new THREE.Vector3(3.95, 2.35, 2.5), weight: 1.14, blueBias: 0.18, edgeBias: 0.22 },
  { center: new THREE.Vector3(-1.25, 4.05, -0.72), radius: new THREE.Vector3(3.15, 2.35, 2.15), weight: 0.95, blueBias: 0.08, edgeBias: 0.2 },
  { center: new THREE.Vector3(1.5, 4.35, -0.45), radius: new THREE.Vector3(3.0, 2.22, 2.1), weight: 0.84, blueBias: 0.09, edgeBias: 0.22 },
  { center: new THREE.Vector3(-5.3, 1.25, 0.1), radius: new THREE.Vector3(3.05, 1.92, 2.15), weight: 0.66, blueBias: 0.48, edgeBias: 0.36 },
  { center: new THREE.Vector3(5.45, 1.45, 0.05), radius: new THREE.Vector3(3.25, 1.96, 2.25), weight: 0.64, blueBias: 0.22, edgeBias: 0.38 },
  { center: new THREE.Vector3(-0.85, 1.35, -2.65), radius: new THREE.Vector3(4.7, 2.35, 1.5), weight: 0.9, blueBias: 0.66, edgeBias: 0.24 },
  { center: new THREE.Vector3(2.25, 2.35, -2.25), radius: new THREE.Vector3(3.35, 2.12, 1.55), weight: 0.62, blueBias: 0.46, edgeBias: 0.2 },
  { center: new THREE.Vector3(0.9, 5.42, -0.35), radius: new THREE.Vector3(2.55, 1.82, 1.6), weight: 0.48, blueBias: 0.06, edgeBias: 0.34 },
  { center: new THREE.Vector3(-2.25, 0.15, 0.25), radius: new THREE.Vector3(2.95, 1.45, 1.95), weight: 0.56, blueBias: 0.5, edgeBias: 0.3 },
];

export function NebulaSakuraScene({
  photos,
  mode,
  selectedIndex,
  transitionKey,
  transitionDirection,
  introPhase,
  introSpeed,
  introAudioEnergyRef,
  onIntroPhaseComplete,
  onIntroError,
}: NebulaSakuraSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const photoEntriesRef = useRef<PhotoEntry[]>([]);
  const photoShardLayerRef = useRef<PhotoShardLayer | null>(null);
  const layersRef = useRef<ParticleLayers | null>(null);
  const modeRef = useRef(mode);
  const introPhaseRef = useRef<IntroPhase>(introPhase);
  const introSpeedRef = useRef(introSpeed);
  const introStartedRef = useRef(performance.now());
  const completedIntroPhaseRef = useRef<IntroPhase | null>(null);
  const onIntroPhaseCompleteRef = useRef(onIntroPhaseComplete);
  const onIntroErrorRef = useRef(onIntroError);
  const selectedRef = useRef(selectedIndex);
  const transitionKeyRef = useRef(transitionKey);
  const transitionDirectionRef = useRef(transitionDirection);
  const modeStartedRef = useRef(performance.now());
  const transitionStartedRef = useRef(performance.now());
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    modeRef.current = mode;
    modeStartedRef.current = performance.now();
  }, [mode]);

  useEffect(() => {
    introPhaseRef.current = introPhase;
    introStartedRef.current = performance.now();
    completedIntroPhaseRef.current = null;
  }, [introPhase]);

  useEffect(() => {
    introSpeedRef.current = introSpeed;
  }, [introSpeed]);

  useEffect(() => {
    onIntroPhaseCompleteRef.current = onIntroPhaseComplete;
  }, [onIntroPhaseComplete]);

  useEffect(() => {
    onIntroErrorRef.current = onIntroError;
  }, [onIntroError]);

  useEffect(() => {
    selectedRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    if (transitionKey !== transitionKeyRef.current) {
      transitionKeyRef.current = transitionKey;
      transitionDirectionRef.current = transitionDirection;
      transitionStartedRef.current = performance.now();
    }
  }, [transitionKey, transitionDirection]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 240);
    camera.position.set(0, 0.2, 18);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    scene.add(ambient);

    const warmLight = new THREE.PointLight(0xffb8c9, 3.6, 34);
    warmLight.position.set(-4, 2, 6);
    scene.add(warmLight);

    const cyanLight = new THREE.PointLight(0x79e8ff, 1.6, 28);
    cyanLight.position.set(5, -2, 4);
    scene.add(cyanLight);

    const layers = createParticleLayers();
    layersRef.current = layers;
    scene.add(layers.treeCore.points, layers.treeGlow.points, layers.ambient.points, layers.groundPetals.points, layers.petalRain.mesh, layers.coupleKiss.points);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      camera.aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
      resizeCoupleKissParticleSystem(layers.coupleKiss, camera.aspect, renderer.getPixelRatio());
    };

    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      const time = performance.now();
      const activeIntroPhase = introPhaseRef.current;
      const activeIntroStarted = introStartedRef.current;
      const activeIntroSpeed = introSpeedRef.current;
      const activeAudioEnergy = introAudioEnergyRef?.current ?? 0;
      updateParticleLayers(layersRef.current, modeRef.current, time, modeStartedRef.current, activeIntroPhase, activeIntroStarted, activeIntroSpeed);
      updatePhotoShardLayer(photoShardLayerRef.current, activeIntroPhase, time, activeIntroStarted, activeIntroSpeed, activeAudioEnergy);
      updatePhotos(
        photoEntriesRef.current,
        modeRef.current,
        selectedRef.current,
        time,
        modeStartedRef.current,
        transitionStartedRef.current,
        transitionDirectionRef.current,
        activeIntroPhase,
        activeIntroStarted,
        activeIntroSpeed,
        activeAudioEnergy,
      );
      updateSceneCamera(camera, modeRef.current, time, modeStartedRef.current, activeIntroPhase, activeIntroStarted, activeIntroSpeed, activeAudioEnergy);
      completeIntroPhaseIfReady(activeIntroPhase, time, activeIntroStarted, activeIntroSpeed, completedIntroPhaseRef, onIntroPhaseCompleteRef);

      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      disposePhotoEntries(photoEntriesRef.current, scene);
      photoEntriesRef.current = [];
      disposePhotoShardLayer(photoShardLayerRef.current, scene);
      photoShardLayerRef.current = null;
      disposeParticleLayers(layersRef.current);
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function rebuildPhotos() {
      const scene = sceneRef.current;
      if (!scene) {
        return;
      }

      disposePhotoEntries(photoEntriesRef.current, scene);
      photoEntriesRef.current = [];
      disposePhotoShardLayer(photoShardLayerRef.current, scene);
      photoShardLayerRef.current = null;

      if (photos.length === 0) {
        return;
      }

      const entries = await Promise.all(photos.map((photo, index) => createPhotoEntry(photo, index, photos.length)));
      if (cancelled || sceneRef.current !== scene) {
        disposePhotoEntries(entries, scene);
        return;
      }

      entries.forEach((entry) => scene.add(entry.group));
      photoEntriesRef.current = entries;

      try {
        const shardLayer = await createPhotoShardLayer(photos, entries);
        if (cancelled || sceneRef.current !== scene) {
          disposePhotoShardLayer(shardLayer, scene);
          return;
        }
        scene.add(shardLayer.points);
        photoShardLayerRef.current = shardLayer;
      } catch {
        onIntroErrorRef.current();
      }
    }

    void rebuildPhotos();

    return () => {
      cancelled = true;
    };
  }, [photos]);

  return <div ref={mountRef} className="scene-mount" aria-hidden="true" />;
}

function updatePhotos(
  entries: PhotoEntry[],
  mode: SceneMode,
  selectedIndex: number,
  time: number,
  modeStarted: number,
  transitionStarted: number,
  transitionDirection: -1 | 0 | 1,
  introPhase: IntroPhase,
  introStarted: number,
  introSpeed: number,
  audioEnergy: number,
) {
  const target = new THREE.Vector3();
  const targetScale = new THREE.Vector3();
  const elapsed = time - modeStarted;
  const introElapsed = time - introStarted;
  const wallDuration = getIntroDuration("photo-wall-enter", introSpeed);
  const morphDuration = getIntroDuration("wall-to-tree", introSpeed);
  const burstPhase = clamp(elapsed / 3000, 0, 1);
  const transitionPhase = clamp((time - transitionStarted) / 850, 0, 1);
  const centerEase = easeOutCubic(transitionPhase);
  const beat = clamp(audioEnergy, 0, 1);

  entries.forEach((entry, index) => {
    const wave = Math.sin(time * 0.00065 + entry.seed * 9.1);
    const drift = Math.cos(time * 0.00048 + entry.seed * 12.7);
    let opacity = 0.55;
    let glow = 0.26;
    let scale = 1;
    let blurMix = 0.12;
    let dim = 1;
    let introLocal = 1;
    let introSettle = 1;
    let wallLock = 1;

    if (introPhase === "photo-wall-enter") {
      const delay = getIntroEntryDelay(entry, index, introSpeed);
      introLocal = clamp((introElapsed - delay) / (wallDuration * 0.78), 0, 1);
      const rush = easeOutExpo(introLocal);
      introSettle = easeInOutCubic(clamp((introLocal - 0.66) / 0.34, 0, 1));
      wallLock = easeInOutCubic(clamp((introLocal - 0.78) / 0.22, 0, 1));
      const visibility = smoothstep(0.02, 0.22, introLocal);
      const nearPass = Math.sin(clamp(introLocal / 0.74, 0, 1) * Math.PI);
      const floatMix = smoothstep(0.28, 1, introLocal) * (1 - wallLock * 0.94);
      const beatPulse = beat * (1 - wallLock) * 0.45;
      const turbulence = (1 - introSettle) * (0.34 + beatPulse * 0.18);
      const path = quadraticBezier(entry.wallScatter, entry.wallRushControl, entry.wallSlot, rush);

      target.copy(path);
      target.x += Math.sin(time * 0.00118 + entry.wallShardSeed * 25 + introLocal * 5.2) * entry.wallFloat.x * (0.35 + floatMix);
      target.y += Math.cos(time * 0.00104 + entry.wallShardSeed * 21 + introLocal * 4.4) * entry.wallFloat.y * (0.35 + floatMix);
      target.z += Math.sin(time * 0.00086 + entry.wallShardSeed * 17) * entry.wallFloat.z * floatMix;
      target.x += Math.sin(introLocal * Math.PI * 4.2 + entry.seed * 18) * turbulence;
      target.y += Math.cos(introLocal * Math.PI * 3.4 + entry.seed * 14) * turbulence * 0.72;
      target.z += nearPass * (0.28 + entry.seed * 0.22) * (1 - wallLock);
      target.lerp(entry.wallSlot, wallLock);

      blurMix = getDepthOfFieldBlur(target.z);
      dim = lerp(0.72, 1.06, smoothstep(0.08, 0.46, introLocal)) - blurMix * 0.12;
      scale = lerp(0.18 + entry.seed * 0.12, entry.wallScale, easeOutCubic(introLocal)) + nearPass * (1 - wallLock) * 0.16 + beatPulse * 0.05;
      opacity = visibility * lerp(0.76, 0.96, smoothstep(0.18, 0.62, introLocal)) * (1 - blurMix * 0.16);
      glow = visibility * (0.16 + nearPass * (1 - wallLock) * 0.32 + beatPulse * 0.12 + introSettle * 0.16);
    } else if (introPhase === "wall-to-tree") {
      const phase = clamp(introElapsed / morphDuration, 0, 1);
      const fold = easeInOutCubic(phase);
      target.copy(entry.wallSlot).lerp(entry.tree, fold);
      target.x += wave * lerp(0.035, 0.24, fold);
      target.y += drift * lerp(0.03, 0.17, fold);
      target.z += Math.sin(time * 0.0007 + entry.seed) * lerp(0.08, 0.18, fold);
      scale = lerp(entry.wallScale, 0.52 + (entry.seed % 0.18), fold);
      opacity = 0.92 - fold * 0.06;
      glow = 0.48 + fold * 0.04;
      blurMix = lerp(0.08, 0.02, fold);
      dim = 1.02;
    } else if (mode === "idle") {
      target.copy(entry.idle);
      target.x += drift * 0.24;
      target.y += wave * 0.2;
      target.z += Math.sin(time * 0.00032 + entry.seed * 4) * 0.34;
      scale = 0.66 + entry.seed * 0.2;
      opacity = 0.5;
      glow = 0.13;
      blurMix = 0.82;
      dim = 0.88;
    } else if (mode === "tree") {
      target.copy(entry.tree);
      target.x += wave * 0.12;
      target.y += drift * 0.1;
      target.z += Math.sin(time * 0.0007 + entry.seed) * 0.18;
      scale = 0.52 + (entry.seed % 0.18);
      opacity = 0.86;
      glow = 0.46;
      blurMix = 0.04;
    } else if (mode === "burst") {
      if (burstPhase < 0.56) {
        target.copy(entry.sphere);
        target.multiplyScalar(1 - easeInOutCubic(burstPhase / 0.56) * 0.18);
        target.x += 0.52;
        target.y += 0.18;
        scale = 0.34 + burstPhase * 0.32;
        opacity = 0.92;
        glow = 0.55;
        blurMix = 0.08;
      } else {
        const t = easeOutCubic((burstPhase - 0.56) / 0.44);
        const handoff = index === selectedIndex ? easeInOutCubic(clamp((burstPhase - 0.66) / 0.34, 0, 1)) : 0;
        if (index === selectedIndex) {
          target.copy(entry.sphere);
          target.x += 0.52 + Math.sin(time * 0.0016 + entry.seed * 5) * 0.16;
          target.y += 0.18 + Math.cos(time * 0.0013 + entry.seed * 8) * 0.12;
          target.lerp(new THREE.Vector3(0, -0.1, 3.1), handoff);
          scale = 0.58 + t * 0.22 + handoff * 0.92;
          opacity = 0.82;
          glow = 0.54 + handoff * 0.12;
          blurMix = lerp(0.1, 0, handoff);
        } else {
          target.copy(entry.sphere).lerp(entry.burst, t * 0.52);
          target.x += 0.52 + Math.sin(time * 0.002 + entry.seed * 5) * 0.28 + t * (1.8 + entry.seed * 1.7);
          target.y += 0.18 + Math.cos(time * 0.0017 + entry.seed * 8) * 0.2;
          scale = 0.58 + t * 0.16;
          opacity = 0.76 - t * 0.3;
          glow = 0.5 - t * 0.26;
          blurMix = 0.22 + t * 0.38;
        }
      }
    } else if (mode === "viewer") {
      if (index === selectedIndex) {
        target.set(transitionDirection * (1 - centerEase) * 7.5, -0.1 + wave * 0.08, 3.1);
        scale = 1.8;
        opacity = 0.34;
        glow = 0.58;
        blurMix = 0.02;
      } else {
        target.copy(entry.idle);
        target.x += Math.sign(entry.idle.x || 1) * 2.2 + drift * 0.35;
        target.y += wave * 0.28;
        scale = 0.68;
        opacity = 0.26;
        glow = 0.11;
        blurMix = 0.72;
        dim = 0.82;
      }
    } else {
      target.copy(entry.gallery);
      target.y += wave * 0.08;
      target.z += drift * 0.16;
      scale = 0.62;
      opacity = index === selectedIndex ? 0.9 : 0.7;
      glow = index === selectedIndex ? 0.52 : 0.24;
      blurMix = index === selectedIndex ? 0.04 : 0.18;
    }

    const positionMix = introPhase === "photo-wall-enter" ? lerp(0.16, 0.34, wallLock) : introPhase === "wall-to-tree" ? 0.072 : 0.055;
    entry.group.position.lerp(target, positionMix);
    targetScale.set(scale, scale, scale);
    entry.group.scale.lerp(targetScale, introPhase === "photo-wall-enter" ? lerp(0.11, 0.28, wallLock) : introPhase === "wall-to-tree" ? 0.08 : 0.06);

    const introWallActive = introPhase === "photo-wall-enter" || introPhase === "wall-to-tree";
    const rushRotation = introPhase === "photo-wall-enter" ? 1 - wallLock : 0;
    const floatRotation = introWallActive
      ? Math.sin(time * 0.00052 + entry.wallShardSeed * 8) * 0.035 * (1 - wallLock)
      : Math.sin(time * 0.00042 + entry.seed * 6) * 0.28;
    const targetRotY = mode === "viewer" && index === selectedIndex
      ? 0
      : introWallActive
        ? entry.wallRotation.y * rushRotation + floatRotation
        : floatRotation;
    const targetRotX = mode === "tree" || introPhase === "wall-to-tree"
      ? Math.sin(time * 0.00052 + entry.seed) * 0.08
      : entry.wallRotation.x * rushRotation + Math.cos(time * 0.00034 + entry.seed) * 0.08 * (1 - wallLock);
    const targetRotZ = introPhase === "photo-wall-enter"
      ? entry.wallRotation.z * rushRotation + Math.sin(time * 0.0007 + entry.seed * 7) * 0.045 * (1 - wallLock)
      : Math.sin(time * 0.00033 + entry.seed * 7) * 0.04;
    entry.group.rotation.y += (targetRotY - entry.group.rotation.y) * 0.06;
    entry.group.rotation.x += (targetRotX - entry.group.rotation.x) * 0.06;
    entry.group.rotation.z += (targetRotZ - entry.group.rotation.z) * 0.052;

    const uniforms = entry.material.uniforms;
    uniforms.uOpacity.value += (opacity - uniforms.uOpacity.value) * 0.1;
    uniforms.uBlurMix.value += (clamp(blurMix, 0, 1) - uniforms.uBlurMix.value) * 0.12;
    uniforms.uDim.value += (clamp(dim, 0.45, 1.12) - uniforms.uDim.value) * 0.08;
    entry.glowMaterial.opacity += (glow - entry.glowMaterial.opacity) * 0.08;
  });
}

function updateParticleLayers(
  layers: ParticleLayers | null,
  mode: SceneMode,
  time: number,
  modeStarted: number,
  introPhase: IntroPhase,
  introStarted: number,
  introSpeed: number,
) {
  if (!layers) {
    return;
  }

  updateTreeCoreLayer(layers.treeCore, mode, time, modeStarted, introPhase, introStarted, introSpeed);
  updateTreeGlowLayer(layers.treeGlow, mode, time, introPhase);
  updateAmbientLayer(layers.ambient, mode, time, introPhase);
  updateGroundPetalLayer(layers.groundPetals, mode, time, introPhase);
  updatePetalRainLayer(layers.petalRain, mode, time, modeStarted);
  updateCoupleKissParticleSystem(layers.coupleKiss, {
    mode,
    introPhase,
    time,
    treeFormationProgress: introPhase === "wall-to-tree"
      ? easeInOutCubic(clamp((time - introStarted) / getIntroDuration("wall-to-tree", introSpeed), 0, 1))
      : mode === "tree" ? 1 : 0,
  });
}

function updatePhotoShardLayer(
  layer: PhotoShardLayer | null,
  introPhase: IntroPhase,
  time: number,
  introStarted: number,
  introSpeed: number,
  audioEnergy: number,
) {
  if (!layer) {
    return;
  }

  const positions = layer.geometry.getAttribute("position") as THREE.BufferAttribute;
  const sizes = layer.geometry.getAttribute("size") as THREE.BufferAttribute | undefined;
  const elapsed = time - introStarted;
  const wallDuration = getIntroDuration("photo-wall-enter", introSpeed);
  const morphDuration = getIntroDuration("wall-to-tree", introSpeed);
  const beat = clamp(audioEnergy, 0, 1);
  let targetOpacity = 0;

  for (let i = 0; i < layer.seeds.length; i += 1) {
    const offset = i * 3;
    const seed = layer.seeds[i];
    const target = new THREE.Vector3(layer.scatter[offset], layer.scatter[offset + 1], layer.scatter[offset + 2]);
    let local = 0;

    if (introPhase === "photo-wall-enter") {
      const delay = (PHOTO_RUSH_CONFIG.spawnDelayMinMs + hash01(i * 17 + 3) * 320) * getIntroTempoScale(introSpeed);
      local = clamp((elapsed - delay) / (wallDuration * 0.74), 0, 1);
      const flow = easeOutExpo(local);
      const lock = easeInOutCubic(clamp((local - 0.78) / 0.22, 0, 1));
      const drift = 1 - easeInOutCubic(clamp((local - 0.68) / 0.32, 0, 1));
      target.lerp(new THREE.Vector3(layer.wall[offset], layer.wall[offset + 1], layer.wall[offset + 2]), flow);
      target.x += Math.sin(time * 0.00145 + seed * 22 + local * 4.2) * 0.24 * drift * (1 - lock);
      target.y += Math.cos(time * 0.0012 + seed * 19 + local * 3.6) * 0.18 * drift * (1 - lock);
      target.z += Math.sin(time * 0.001 + seed * 25) * 0.34 * drift * (1 - lock);
      target.lerp(new THREE.Vector3(layer.wall[offset], layer.wall[offset + 1], layer.wall[offset + 2]), lock);
      targetOpacity = PHOTO_SHARD_CONFIG.wallOpacity * (0.84 + beat * (1 - lock) * 0.16);
    } else if (introPhase === "wall-to-tree") {
      local = clamp(elapsed / morphDuration, 0, 1);
      const flow = easeInOutCubic(local);
      target.set(layer.wall[offset], layer.wall[offset + 1], layer.wall[offset + 2]);
      target.multiplyScalar(1 - Math.sin(clamp(local / 0.3, 0, 1) * Math.PI) * 0.11);
      target.lerp(new THREE.Vector3(layer.tree[offset], layer.tree[offset + 1], layer.tree[offset + 2]), flow);
      target.x += Math.sin(time * 0.001 + seed * 29 + local * 5.4) * 0.22 * (1 - flow);
      target.z += Math.cos(time * 0.0009 + seed * 31) * 0.18 * (1 - flow);
      targetOpacity = PHOTO_SHARD_CONFIG.morphOpacity * (1 - clamp((local - 0.82) / 0.18, 0, 1) * 0.55);
    }

    const convergeMix = introPhase === "photo-wall-enter" && local > 0.78 ? 0.2 : 0.09;
    layer.current[offset] += (target.x - layer.current[offset]) * convergeMix;
    layer.current[offset + 1] += (target.y - layer.current[offset + 1]) * convergeMix;
    layer.current[offset + 2] += (target.z - layer.current[offset + 2]) * convergeMix;

    if (sizes) {
      const size = layer.sizes[i] * (0.55 + easeOutCubic(local) * 0.7 + beat * (1 - smoothstep(0.78, 1, local)) * 0.1);
      sizes.setX(i, size);
    }
  }

  positions.needsUpdate = true;
  if (sizes) {
    sizes.needsUpdate = true;
  }
  setLayerOpacity(layer.points, targetOpacity, 0.08);
}

function updateTreeCoreLayer(
  layer: MorphParticleLayer,
  mode: SceneMode,
  time: number,
  modeStarted: number,
  introPhase: IntroPhase,
  introStarted: number,
  introSpeed: number,
) {
  const elapsed = time - modeStarted;
  const introElapsed = time - introStarted;
  const introMorphing = introPhase === "wall-to-tree";
  const introTreeProgress = introMorphing ? easeInOutCubic(clamp(introElapsed / getIntroDuration("wall-to-tree", introSpeed), 0, 1)) : 0;
  const positions = layer.geometry.getAttribute("position") as THREE.BufferAttribute;
  const targetArray = mode === "tree" || introMorphing ? layer.tree : layer.idle;
  const stableTree = (mode === "tree" && elapsed > TREE_SHAPE_CONFIG.treeStableAfter) || (introMorphing && introTreeProgress > 0.86);
  const modeMix = introMorphing
    ? lerp(0.034, 0.088, introTreeProgress)
    : mode === "tree"
    ? stableTree ? TREE_SHAPE_CONFIG.structureLockStrength : TREE_SHAPE_CONFIG.treeFormationMix
    : mode === "burst" ? 0.105 : 0.026;
  const treeBreath = mode === "tree" || introMorphing ? TREE_SHAPE_CONFIG.treeBreathAmplitude * (stableTree ? 0.72 : 1.18) * (introMorphing ? introTreeProgress : 1) : 0;
  const rainTarget = new THREE.Vector3();

  for (let i = 0; i < layer.current.length; i += 3) {
    const particle = i / 3;
    const seed = layer.seeds[particle];
    const motionScale = layer.motionScale[particle];

    if (mode === "burst") {
      buildTreeCoreRainTarget(layer, i, seed, motionScale, time, elapsed, rainTarget);
      layer.current[i] += (rainTarget.x - layer.current[i]) * modeMix;
      layer.current[i + 1] += (rainTarget.y - layer.current[i + 1]) * modeMix;
      layer.current[i + 2] += (rainTarget.z - layer.current[i + 2]) * modeMix;
      continue;
    }

    const freeDrift = mode === "tree" || introMorphing ? 0 : 1;
    const swirl = Math.sin(time * 0.0007 + seed * 19) * 0.018 * freeDrift;
    const flutter = Math.cos(time * 0.00053 + seed * 13) * 0.014 * freeDrift;
    const breathX = Math.sin(time * 0.00042 + seed * 19) * treeBreath * motionScale;
    const breathY = Math.cos(time * 0.00038 + seed * 13) * treeBreath * 0.72 * motionScale;
    const breathZ = Math.sin(time * 0.00034 + seed * 8) * treeBreath * 0.82 * motionScale;
    const tx = targetArray[i] + breathX + swirl * 18;
    const ty = targetArray[i + 1] + breathY + flutter * 8;
    const tz = targetArray[i + 2] + breathZ + Math.sin(time * 0.00037 + seed * 8) * 0.03 * freeDrift;

    layer.current[i] += (tx - layer.current[i]) * modeMix;
    layer.current[i + 1] += (ty - layer.current[i + 1]) * modeMix;
    layer.current[i + 2] += (tz - layer.current[i + 2]) * modeMix;
  }

  positions.needsUpdate = true;
  layer.points.rotation.set(0, 0, 0);
  const introOpacity = introPhase === "photo-wall-enter" ? 0.34 : introMorphing ? lerp(0.38, 0.9, introTreeProgress) : null;
  setLayerOpacity(layer.points, introOpacity ?? (mode === "burst" ? 0.68 : mode === "tree" ? 0.9 : 0.78), 0.035);
}

function buildTreeCoreRainTarget(
  layer: MorphParticleLayer,
  offset: number,
  seed: number,
  motionScale: number,
  time: number,
  elapsed: number,
  target: THREE.Vector3,
) {
  const anchorX = layer.tree[offset];
  const anchorY = layer.tree[offset + 1];
  const anchorZ = layer.tree[offset + 2];
  const leftToRight = clamp((anchorX + 6.8) / 13.6, 0, 1);
  const leftVeil = seed < SAKURA_RAIN_CONFIG.leftVeilRatio * 0.58 || anchorX < -3.2;
  const release = leftToRight * SAKURA_RAIN_CONFIG.treeParticleWaveDuration + hash01(seed * 911 + offset) * 190 + (1 - motionScale) * 260;
  const localDuration = SAKURA_RAIN_CONFIG.duration * (leftVeil ? 1.36 : 1);
  const local = clamp((elapsed - release) / localDuration, 0, 1);
  const loosen = clamp(elapsed / SAKURA_RAIN_CONFIG.loosenDuration, 0, 1);
  const flow = easeInOutCubic(local);
  const tail = easeOutCubic(local);
  const petalBias = 0.42 + motionScale * 0.78;
  const veilWind = leftVeil ? SAKURA_RAIN_CONFIG.leftVeilWindScale + tail * 0.22 : 1;
  const wind = SAKURA_RAIN_CONFIG.treeParticleWindDistance * tail * petalBias * (0.72 + seed * 0.5) * veilWind;
  const turbulence = Math.sin(time * 0.00105 + seed * 37 + local * 5.4) * SAKURA_RAIN_CONFIG.swirlAmplitude * (0.25 + flow);
  const lift = Math.sin(local * Math.PI) * SAKURA_RAIN_CONFIG.lift * petalBias;
  const fall = Math.pow(local, 1.42) * SAKURA_RAIN_CONFIG.fall * (0.42 + seed * 0.42);

  target.set(
    anchorX + loosen * Math.sin(time * 0.00042 + seed * 17) * 0.16 + wind + turbulence,
    anchorY + lift - fall + Math.cos(time * 0.0012 + seed * 29) * SAKURA_RAIN_CONFIG.verticalSway * flow,
    anchorZ + (seed - 0.5) * SAKURA_RAIN_CONFIG.depthSpread * 0.58 * flow + Math.sin(time * 0.00086 + seed * 41) * 0.42 * flow,
  );
}

function updateAmbientLayer(layer: DecorativeParticleLayer, mode: SceneMode, time: number, introPhase: IntroPhase) {
  const positions = layer.geometry.getAttribute("position") as THREE.BufferAttribute;
  const treeLike = mode === "tree" || introPhase === "wall-to-tree";
  const targetOpacity = introPhase === "photo-wall-enter"
    ? 0.14
    : treeLike ? TREE_SHAPE_CONFIG.ambientOpacity : mode === "burst" ? TREE_SHAPE_CONFIG.ambientBurstOpacity : TREE_SHAPE_CONFIG.ambientIdleOpacity;
  const amplitude = TREE_SHAPE_CONFIG.ambientMotionAmplitude * (treeLike ? 1 : 1.4);
  const speed = TREE_SHAPE_CONFIG.ambientMotionSpeed;

  for (let i = 0; i < layer.current.length; i += 3) {
    const particle = i / 3;
    const seed = layer.seeds[particle];
    const depthBand = Math.abs(layer.base[i + 2]) > 5 ? 1.35 : 0.82;
    const sway = Math.sin(time * speed + seed * 19);
    const drift = Math.cos(time * speed * 1.35 + seed * 23);
    layer.current[i] = layer.base[i] + sway * amplitude * depthBand * (0.4 + seed * 0.8);
    layer.current[i + 1] = layer.base[i + 1] + Math.sin(time * speed * 1.8 + seed * 11) * amplitude * 0.46 * depthBand;
    layer.current[i + 2] = layer.base[i + 2] + drift * amplitude * 0.65 * depthBand;
  }

  positions.needsUpdate = true;
  setLayerOpacity(layer.points, targetOpacity, 0.035);
}

function updateTreeGlowLayer(layer: GlowParticleLayer, mode: SceneMode, time: number, introPhase: IntroPhase) {
  const positions = layer.geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = layer.geometry.getAttribute("color") as THREE.BufferAttribute;
  const treeLike = mode === "tree" || introPhase === "wall-to-tree";
  const targetOpacity = treeLike
    ? TREE_SHAPE_CONFIG.treeGlowOpacity
    : mode === "burst" ? TREE_SHAPE_CONFIG.treeGlowBurstOpacity : 0.03;
  const amplitude = TREE_SHAPE_CONFIG.treeGlowMotionAmplitude * (treeLike ? 1 : 0.42);

  for (let i = 0; i < layer.current.length; i += 3) {
    const particle = i / 3;
    const seed = layer.seeds[particle];
    const pulse = layer.pulse[particle];
    const shimmer = 0.64 + Math.pow((Math.sin(time * (0.0012 + pulse * 0.00055) + seed * 37) + 1) * 0.5, 2.6) * 0.62;
    const breath = Math.sin(time * 0.00042 + seed * 17) * amplitude;
    const lift = Math.cos(time * 0.00036 + seed * 23) * amplitude * 0.72;

    layer.current[i] = layer.base[i] + breath * (0.7 + seed);
    layer.current[i + 1] = layer.base[i + 1] + lift;
    layer.current[i + 2] = layer.base[i + 2] + Math.sin(time * 0.00032 + seed * 29) * amplitude * 1.35;
    layer.colors[i] = layer.baseColors[i] * shimmer;
    layer.colors[i + 1] = layer.baseColors[i + 1] * shimmer;
    layer.colors[i + 2] = layer.baseColors[i + 2] * shimmer;
  }

  positions.needsUpdate = true;
  colors.needsUpdate = true;
  setLayerOpacity(layer.points, targetOpacity, 0.045);
}

function updateGroundPetalLayer(layer: DecorativeParticleLayer, mode: SceneMode, time: number, introPhase: IntroPhase) {
  const positions = layer.geometry.getAttribute("position") as THREE.BufferAttribute;
  const treeLike = mode === "tree" || introPhase === "wall-to-tree";
  const targetOpacity = treeLike ? TREE_SHAPE_CONFIG.groundOpacity : mode === "burst" ? TREE_SHAPE_CONFIG.groundOpacity * 0.34 : 0.025;
  const amplitude = TREE_SHAPE_CONFIG.groundMotionAmplitude;

  for (let i = 0; i < layer.current.length; i += 3) {
    const particle = i / 3;
    const seed = layer.seeds[particle];
    layer.current[i] = layer.base[i] + Math.sin(time * 0.00016 + seed * 17) * amplitude * 0.7;
    layer.current[i + 1] = layer.base[i + 1] + Math.sin(time * 0.00024 + seed * 13) * amplitude;
    layer.current[i + 2] = layer.base[i + 2] + Math.cos(time * 0.00014 + seed * 29) * amplitude * 0.9;
  }

  positions.needsUpdate = true;
  setLayerOpacity(layer.points, targetOpacity, 0.045);
}

function updatePetalRainLayer(layer: PetalRainLayer, mode: SceneMode, time: number, modeStarted: number) {
  const elapsed = time - modeStarted;
  const materialTarget = mode === "burst"
    ? SAKURA_RAIN_CONFIG.globalOpacity * (1 - clamp((elapsed - SAKURA_RAIN_CONFIG.fadeAfter) / 520, 0, 0.72))
    : mode === "viewer" ? 0.08 : 0;
  layer.material.opacity += (materialTarget - layer.material.opacity) * 0.085;

  const count = layer.seeds.length;
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const seed = layer.seeds[i];
    const delay = layer.delays[i];
    const anchorX = layer.anchors[offset];
    const anchorY = layer.anchors[offset + 1];
    const anchorZ = layer.anchors[offset + 2];
    const depth = layer.depths[i];
    const foreground = depth > 0.74;
    const background = depth < 0.24;
    const leftVeil = seed < SAKURA_RAIN_CONFIG.leftVeilRatio || (anchorX < -2.1 && hash01(i * 271 + 7) < SAKURA_RAIN_CONFIG.leftVeilDensityBoost);
    const localDuration = SAKURA_RAIN_CONFIG.duration * (leftVeil ? 1.48 : 1);
    const local = mode === "burst" ? clamp((elapsed - delay) / localDuration, 0, 1) : 1;
    const release = easeInOutCubic(local);
    const travel = easeOutCubic(local);
    const preLoosen = mode === "burst" ? clamp((elapsed - delay * 0.32) / Math.max(120, SAKURA_RAIN_CONFIG.loosenDuration + delay * 0.28), 0, 1) : 0;
    const depthOffset = (depth - 0.5) * SAKURA_RAIN_CONFIG.depthSpread;
    const speed = layer.speeds[i];
    const veilWind = leftVeil ? SAKURA_RAIN_CONFIG.leftVeilWindScale + travel * 0.24 : 1;
    const wind = (SAKURA_RAIN_CONFIG.windDistance * travel + SAKURA_RAIN_CONFIG.windPush * local * local) * speed * veilWind;
    const arc = Math.sin(local * Math.PI) * SAKURA_RAIN_CONFIG.lift * (0.72 + seed * 0.6);
    const fall = Math.pow(local, 1.34) * SAKURA_RAIN_CONFIG.fall * (background ? 0.58 : foreground ? 1.08 : 0.82);
    const swirl = Math.sin(time * 0.00115 + seed * 46 + local * 7.1) * SAKURA_RAIN_CONFIG.swirlAmplitude * (0.25 + release * 1.1);
    const bob = Math.cos(time * 0.00145 + seed * 31 + local * 3.8) * SAKURA_RAIN_CONFIG.verticalSway * release;
    const visibility = mode === "burst" ? clamp((elapsed - delay + 150) / 320, 0, 1) : clamp(layer.material.opacity / 0.08, 0, 1);
    const fadeTail = leftVeil ? 1 - clamp((local - 0.96) / 0.22, 0, 0.28) : 1 - clamp((local - 0.88) / 0.18, 0, 0.58);
    const depthScale = background ? SAKURA_RAIN_CONFIG.backgroundScale : foreground ? SAKURA_RAIN_CONFIG.foregroundScale : 1;
    const size = layer.sizes[i] * depthScale * visibility * fadeTail * (leftVeil ? 1.08 : 1);
    const glintWindow = Math.max(0, Math.sin(time * (0.00155 + layer.glints[i] * 0.0011) + seed * 53 + local * Math.PI * 3.2));
    const glint = mode === "burst" && visibility > 0.2
      ? Math.pow(glintWindow, 9) * (foreground ? 0.42 : background ? 0.14 : 0.26) * (0.45 + release * 0.7)
      : 0;
    const petalColor = buildRainPetalFrameColor(i, anchorZ, depth, glint);

    layer.dummy.position.set(
      anchorX + preLoosen * Math.sin(time * 0.00052 + seed * 19) * 0.16 + wind + swirl,
      anchorY + preLoosen * 0.12 + arc - fall + bob,
      anchorZ + depthOffset + Math.sin(time * 0.00074 + seed * 53) * 0.44 * release + (foreground ? release * 1.35 : -release * 0.54),
    );
    layer.dummy.rotation.set(
      Math.sin(time * 0.0014 + seed * 11) * 0.85 + release * Math.PI * 0.8,
      Math.cos(time * 0.0011 + seed * 17) * 0.9,
      seed * Math.PI * 2 + layer.spins[i] * release + time * 0.0016 * layer.spins[i],
    );
    layer.dummy.scale.set(size * 1.35, size * (0.58 + seed * 0.2), size);
    layer.dummy.updateMatrix();
    layer.mesh.setMatrixAt(i, layer.dummy.matrix);
    layer.mesh.setColorAt(i, petalColor);
  }

  layer.mesh.instanceMatrix.needsUpdate = true;
  if (layer.mesh.instanceColor) {
    layer.mesh.instanceColor.needsUpdate = true;
  }
}

function updateSceneCamera(
  camera: THREE.PerspectiveCamera,
  mode: SceneMode,
  time: number,
  modeStarted: number,
  introPhase: IntroPhase,
  introStarted: number,
  introSpeed: number,
  audioEnergy: number,
) {
  if (introPhase === "photo-wall-enter") {
    const elapsed = time - introStarted;
    const phase = easeOutCubic(clamp(elapsed / getIntroDuration("photo-wall-enter", introSpeed), 0, 1));
    const beat = clamp(audioEnergy, 0, 1);
    const introPulse = Math.sin(elapsed * 0.0018) * (0.12 + beat * 0.18);
    camera.position.x += (introPulse - camera.position.x) * 0.032;
    camera.position.y += (lerp(0.02, 0.16, phase) - camera.position.y) * 0.032;
    camera.position.z += (PHOTO_RUSH_CONFIG.cameraZ - camera.position.z) * 0.032;
    camera.lookAt(0, lerp(0.02, 0.16, phase), PHOTO_RUSH_CONFIG.wallLookZ);
    return;
  }

  if (introPhase === "wall-to-tree") {
    const elapsed = time - introStarted;
    const phase = easeInOutCubic(clamp(elapsed / getIntroDuration("wall-to-tree", introSpeed), 0, 1));
    const orbit = Math.sin(time * TREE_SHAPE_CONFIG.treeRotationSpeed) * TREE_SHAPE_CONFIG.treeRotationAmplitude * phase;
    const targetX = lerp(0, Math.sin(orbit) * TREE_SHAPE_CONFIG.cameraOrbitRadius, phase);
    const targetY = lerp(0.08, 0.42 + Math.sin(time * 0.00022) * 0.12, phase);
    const targetZ = lerp(PHOTO_RUSH_CONFIG.cameraZ, 18 - (1 - Math.cos(orbit)) * TREE_SHAPE_CONFIG.cameraOrbitDepth, phase);
    camera.position.x += (targetX - camera.position.x) * 0.026;
    camera.position.y += (targetY - camera.position.y) * 0.026;
    camera.position.z += (targetZ - camera.position.z) * 0.026;
    camera.lookAt(0, lerp(0.12, 0.72, phase), lerp(-1.2, -0.35, phase));
    return;
  }

  if (mode === "tree") {
    const orbit = Math.sin(time * TREE_SHAPE_CONFIG.treeRotationSpeed) * TREE_SHAPE_CONFIG.treeRotationAmplitude;
    const targetX = Math.sin(orbit) * TREE_SHAPE_CONFIG.cameraOrbitRadius;
    const targetZ = 18 - (1 - Math.cos(orbit)) * TREE_SHAPE_CONFIG.cameraOrbitDepth;
    const targetY = 0.42 + Math.sin(time * 0.00022) * 0.12;
    camera.position.x += (targetX - camera.position.x) * 0.018;
    camera.position.y += (targetY - camera.position.y) * 0.018;
    camera.position.z += (targetZ - camera.position.z) * 0.018;
    camera.lookAt(0, 0.72, -0.35);
    return;
  }

  if (mode === "burst") {
    const elapsed = time - modeStarted;
    const push = easeOutCubic(clamp(elapsed / SAKURA_RAIN_CONFIG.burstCameraPushDuration, 0, 1));
    const follow = easeInOutCubic(clamp((elapsed - SAKURA_RAIN_CONFIG.burstCameraFollowDelay) / SAKURA_RAIN_CONFIG.burstCameraFollowDuration, 0, 1));
    const cinematicSway = Math.sin(time * 0.00034) * 0.18;
    const targetX = lerp(SAKURA_RAIN_CONFIG.burstCameraStartX, SAKURA_RAIN_CONFIG.burstCameraEndX, follow) + cinematicSway;
    const targetY = lerp(0.25, SAKURA_RAIN_CONFIG.burstCameraY, push);
    const targetZ = lerp(17.8, SAKURA_RAIN_CONFIG.burstCameraZ + follow * 0.72, push);
    const lookX = lerp(SAKURA_RAIN_CONFIG.burstLookStartX, SAKURA_RAIN_CONFIG.burstLookEndX, follow);
    const lookY = lerp(0.72, SAKURA_RAIN_CONFIG.burstLookY, push);
    const lookZ = lerp(-0.35, -1.22, push);

    camera.position.x += (targetX - camera.position.x) * 0.042;
    camera.position.y += (targetY - camera.position.y) * 0.042;
    camera.position.z += (targetZ - camera.position.z) * 0.042;
    camera.lookAt(lookX, lookY, lookZ);
    return;
  }

  const cameraPulse = Math.sin(time * 0.00028) * 0.24;
  camera.position.x += (cameraPulse - camera.position.x) * 0.015;
  camera.position.y += ((mode === "gallery" ? 0.65 : 0.2) - camera.position.y) * 0.018;
  camera.position.z += (18 - camera.position.z) * 0.018;
  camera.lookAt(0, 0.3, 0);
}

function setLayerOpacity(points: THREE.Points, targetOpacity: number, mix: number) {
  const material = points.material;
  if (Array.isArray(material)) {
    material.forEach((item) => {
      if ("opacity" in item) {
        item.opacity += (targetOpacity - item.opacity) * mix;
      }
    });
    return;
  }
  material.opacity += (targetOpacity - material.opacity) * mix;
}

async function createPhotoEntry(photo: PhotoAsset, index: number, total: number): Promise<PhotoEntry> {
  const [texture, blurredTexture] = await Promise.all([
    loadTexture(photo.previewUrl),
    loadTexture(photo.blurredUrl),
  ]);
  const aspect = clamp(photo.width / Math.max(1, photo.height), 0.62, 1.72);
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(PHOTO_HEIGHT * aspect, PHOTO_HEIGHT);
  const glowGeometry = new THREE.PlaneGeometry(PHOTO_HEIGHT * aspect * 1.18, PHOTO_HEIGHT * 1.22);
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: createGlowTexture(),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const material = createPhotoMaterial(texture, blurredTexture, 0.42);
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.position.z = -0.04;
  const photoMesh = new THREE.Mesh(geometry, material);
  group.add(glowMesh, photoMesh);

  const seed = hash01(index + 11);
  const idle = buildIdlePosition(index, total);
  const tree = buildTreePhotoPosition(index, total);
  const sphere = buildSpherePosition(index, total, 2.35);
  const burst = idle.clone().multiplyScalar(1.12);
  const gallery = buildGalleryPosition(index, total);
  const wallLayout = buildAdaptivePhotoWallLayout(index, total, aspect);
  const wallSlot = wallLayout.position;
  const wallScale = wallLayout.scale;
  const wallScatter = buildPhotoWallScatterPosition(index, total, wallSlot);
  const wallRushControl = buildPhotoWallRushControlPosition(index, total, wallScatter, wallSlot);
  const wallRushNear = buildPhotoWallNearPosition(index, total, wallSlot);
  wallRushControl.lerp(wallRushNear, 0.42);
  const wallFloat = new THREE.Vector3(
    PHOTO_RUSH_CONFIG.floatAmplitude * (0.75 + hash01(index * 173 + 7) * 0.9),
    PHOTO_RUSH_CONFIG.floatAmplitude * (0.6 + hash01(index * 179 + 11) * 0.82),
    PHOTO_RUSH_CONFIG.floatDepthAmplitude * (0.55 + hash01(index * 181 + 13) * 0.9),
  );
  const wallRotation = new THREE.Vector3(
    (hash01(index * 191 + 17) - 0.5) * PHOTO_RUSH_CONFIG.maxRotation * 2,
    (hash01(index * 193 + 19) - 0.5) * PHOTO_RUSH_CONFIG.maxRotation * 2,
    (hash01(index * 197 + 23) - 0.5) * PHOTO_RUSH_CONFIG.maxRotation * 2,
  );
  const wallShardSeed = hash01(index * 97 + total * 13);
  group.position.copy(idle);
  group.scale.setScalar(0.64 + seed * 0.16);

  return {
    id: photo.id,
    group,
    material,
    glowMaterial,
    texture,
    blurredTexture,
    aspect,
    idle,
    tree,
    sphere,
    burst,
    gallery,
    wallScatter,
    wallRushControl,
    wallSlot,
    wallScale,
    wallFloat,
    wallRotation,
    wallShardSeed,
    seed,
  };
}

async function createPhotoShardLayer(photos: PhotoAsset[], entries: PhotoEntry[]): Promise<PhotoShardLayer> {
  const palette = await samplePhotoPalette(photos);
  const count = Math.min(PHOTO_SHARD_CONFIG.maxCount, Math.max(PHOTO_SHARD_CONFIG.minCount, photos.length * PHOTO_SHARD_CONFIG.perPhoto));
  const current = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const wall = new Float32Array(count * 3);
  const tree = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const entry = entries[i % entries.length];
    const seed = hash01(i * 97 + entry.wallShardSeed * 113);
    const offset = i * 3;
    const localX = (hash01(i * 101 + 3) - 0.5) * PHOTO_HEIGHT * entry.aspect * entry.wallScale * 0.86;
    const localY = (hash01(i * 103 + 5) - 0.5) * PHOTO_HEIGHT * entry.wallScale * 0.86;
    const localZ = (hash01(i * 107 + 7) - 0.5) * 0.16;
    const wallPos = new THREE.Vector3(
      entry.wallSlot.x + localX,
      entry.wallSlot.y + localY,
      entry.wallSlot.z + localZ,
    );
    const scatterPos = wallPos.clone().lerp(entry.wallScatter, 0.72 + seed * 0.24);
    const deepBounds = getVisibleBoundsAtZ(scatterPos.z, PHOTO_RUSH_CONFIG.cameraZ, getViewportAspect());
    scatterPos.x += (hash01(i * 109 + 11) - 0.5) * deepBounds.halfWidth * 0.28;
    scatterPos.y += (hash01(i * 113 + 13) - 0.5) * deepBounds.halfHeight * 0.28;
    scatterPos.z -= 2.2 + hash01(i * 127 + 17) * 8.6;

    const treeSample = buildTreeParticle(i + 29000, count + 29000, seed);
    const treePos = treeSample.position.clone();
    treePos.x += (hash01(i * 131 + 19) - 0.5) * 0.18;
    treePos.y += (hash01(i * 137 + 23) - 0.5) * 0.14;
    treePos.z += (hash01(i * 139 + 29) - 0.5) * 0.18;

    scatter.set([scatterPos.x, scatterPos.y, scatterPos.z], offset);
    wall.set([wallPos.x, wallPos.y, wallPos.z], offset);
    tree.set([treePos.x, treePos.y, treePos.z], offset);
    current.set([scatterPos.x, scatterPos.y, scatterPos.z], offset);

    const color = palette[Math.floor(hash01(i * 149 + 31) * palette.length)] ?? treeSample.color;
    const blended = color.clone().lerp(treeSample.color, treeSample.kind === "canopy" ? 0.42 : 0.68);
    colors.set([blended.r, blended.g, blended.b], offset);
    seeds[i] = seed;
    sizes[i] = PHOTO_SHARD_CONFIG.size * (0.7 + seed * 0.9);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(current, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: PHOTO_SHARD_CONFIG.size,
    transparent: true,
    opacity: 0,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return { points, geometry, current, scatter, wall, tree, colors, seeds, sizes };
}

function createParticleLayers(): ParticleLayers {
  return {
    treeCore: createTreeCoreLayer(TREE_SHAPE_CONFIG.particleCount),
    treeGlow: createTreeGlowLayer(TREE_SHAPE_CONFIG.treeGlowParticleCount),
    ambient: createAmbientLayer(TREE_SHAPE_CONFIG.ambientParticleCount),
    groundPetals: createGroundPetalLayer(TREE_SHAPE_CONFIG.groundPetalParticleCount),
    petalRain: createPetalRainLayer(SAKURA_RAIN_CONFIG.particleCount),
    coupleKiss: createCoupleKissParticleSystem(),
  };
}

function createTreeCoreLayer(count: number): MorphParticleLayer {
  const geometry = new THREE.BufferGeometry();
  const current = new Float32Array(count * 3);
  const idle = new Float32Array(count * 3);
  const tree = new Float32Array(count * 3);
  const burst = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const motionScale = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const seed = hash01(i + 100);
    seeds[i] = seed;
    const idlePos = buildIdleParticle(i, seed);
    const treeSample = buildTreeParticle(i, count, seed);
    const burstPos = idlePos.clone().multiplyScalar(1.35 + seed * 0.7);

    idle.set([idlePos.x, idlePos.y, idlePos.z], i * 3);
    tree.set([treeSample.position.x, treeSample.position.y, treeSample.position.z], i * 3);
    burst.set([burstPos.x, burstPos.y, burstPos.z], i * 3);
    current.set([idlePos.x, idlePos.y, idlePos.z], i * 3);
    colors.set([treeSample.color.r, treeSample.color.g, treeSample.color.b], i * 3);
    motionScale[i] = treeSample.kind === "trunk" ? 0.22 : treeSample.kind === "branch" ? 0.42 : 1;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(current, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.072,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, current, idle, tree, burst, colors, seeds, motionScale };
}

function createTreeGlowLayer(count: number): GlowParticleLayer {
  const geometry = new THREE.BufferGeometry();
  const current = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const baseColors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const pulse = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const seed = hash01(i + 4300);
    const sample = buildTreeGlowParticle(i, seed);
    seeds[i] = seed;
    pulse[i] = 0.35 + hash01(i * 283 + 19) * 1.4;
    base.set([sample.position.x, sample.position.y, sample.position.z], i * 3);
    current.set([sample.position.x, sample.position.y, sample.position.z], i * 3);
    colors.set([sample.color.r, sample.color.g, sample.color.b], i * 3);
    baseColors.set([sample.color.r, sample.color.g, sample.color.b], i * 3);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(current, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.12,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, current, base, colors, baseColors, seeds, pulse };
}

function createAmbientLayer(count: number): DecorativeParticleLayer {
  const geometry = new THREE.BufferGeometry();
  const current = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const seed = hash01(i + 1900);
    const sample = buildAmbientParticle(i, seed);
    seeds[i] = seed;
    base.set([sample.position.x, sample.position.y, sample.position.z], i * 3);
    current.set([sample.position.x, sample.position.y, sample.position.z], i * 3);
    colors.set([sample.color.r, sample.color.g, sample.color.b], i * 3);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(current, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.055,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, current, base, colors, seeds };
}

function createGroundPetalLayer(count: number): DecorativeParticleLayer {
  const geometry = new THREE.BufferGeometry();
  const current = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const seed = hash01(i + 3100);
    const sample = buildGroundPetalParticle(i, seed);
    seeds[i] = seed;
    base.set([sample.position.x, sample.position.y, sample.position.z], i * 3);
    current.set([sample.position.x, sample.position.y, sample.position.z], i * 3);
    colors.set([sample.color.r, sample.color.g, sample.color.b], i * 3);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(current, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.065,
    transparent: true,
    opacity: 0.025,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, current, base, colors, seeds };
}

function createPetalRainLayer(count: number): PetalRainLayer {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const texture = createPetalTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const anchors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const delays = new Float32Array(count);
  const sizes = new Float32Array(count);
  const speeds = new Float32Array(count);
  const depths = new Float32Array(count);
  const spins = new Float32Array(count);
  const glints = new Float32Array(count);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i += 1) {
    const seed = hash01(i + 6200);
    const anchor = buildRainPetalAnchor(i, seed);
    const leftToRight = clamp((anchor.x + 6.8) / 13.6, 0, 1);
    const depth = hash01(i * 131 + 17);
    const foreground = depth > 0.74;
    const background = depth < 0.24;
    const baseSize = background
      ? 0.12 + hash01(i * 137 + 19) * 0.08
      : foreground
        ? 0.28 + hash01(i * 139 + 23) * 0.22
        : 0.18 + hash01(i * 149 + 29) * 0.16;

    seeds[i] = seed;
    anchors.set([anchor.x, anchor.y, anchor.z], i * 3);
    delays[i] = leftToRight * SAKURA_RAIN_CONFIG.waveFrontDuration + hash01(i * 151 + 31) * 220;
    sizes[i] = baseSize;
    speeds[i] = (background ? 0.72 : foreground ? 1.36 : 1) * (0.82 + hash01(i * 157 + 37) * 0.5);
    depths[i] = depth;
    spins[i] = (hash01(i * 163 + 41) - 0.5) * 7.2;
    glints[i] = hash01(i * 167 + 43);

    dummy.position.copy(anchor);
    dummy.scale.setScalar(0.001);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    const color = buildRainPetalColor(i, anchor, depth);
    mesh.setColorAt(i, color);
  }

  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return { mesh, geometry, material, texture, anchors, seeds, delays, sizes, speeds, depths, spins, glints, dummy };
}

function buildIdlePosition(index: number, total: number) {
  const columns = Math.min(7, Math.max(3, Math.ceil(Math.sqrt(total * 1.24))));
  const rows = Math.ceil(total / columns);
  const col = index % columns;
  const row = Math.floor(index / columns);
  const compact = total > 18;
  const xSpacing = compact ? 2.05 : 2.34;
  const ySpacing = compact ? 1.42 : 1.68;
  const depthLane = (col * 2 + row * 3) % 6;
  const xJitter = (hash01(index * 13 + 1) - 0.5) * 0.42;
  const yJitter = (hash01(index * 17 + 2) - 0.5) * 0.32;
  const zJitter = (hash01(index * 19 + 3) - 0.5) * 0.68;
  return new THREE.Vector3(
    (col - (columns - 1) / 2) * xSpacing + Math.sin(row * 1.37) * 0.36 + xJitter,
    ((rows - 1) / 2 - row) * ySpacing + Math.cos(col * 0.91) * 0.16 + yJitter,
    -8.9 + depthLane * 1.28 + zJitter,
  );
}

function buildAdaptivePhotoWallLayout(index: number, total: number, aspect: number) {
  const viewportAspect = getViewportAspect();
  const bounds = getVisibleBoundsAtZ(PHOTO_RUSH_CONFIG.wallLookZ, PHOTO_RUSH_CONFIG.cameraZ, viewportAspect);
  const coverageX = total <= 4 ? PHOTO_RUSH_CONFIG.smallSetCoverageX : PHOTO_RUSH_CONFIG.wallCoverageX;
  const coverageY = total <= 4 ? PHOTO_RUSH_CONFIG.smallSetCoverageY : PHOTO_RUSH_CONFIG.wallCoverageY;
  const wallWidth = bounds.halfWidth * 2 * coverageX;
  const wallHeight = bounds.halfHeight * 2 * coverageY;

  if (total <= 4) {
    return buildSmallPhotoWallLayout(index, total, aspect, wallWidth, wallHeight);
  }

  const grid = choosePhotoWallGrid(total, wallWidth / Math.max(0.001, wallHeight));
  const row = Math.floor(index / grid.columns);
  const col = index % grid.columns;
  const rowCount = row === grid.rows - 1 ? total - row * grid.columns || grid.columns : grid.columns;
  const centeredCol = rowCount < grid.columns ? col + (grid.columns - rowCount) / 2 : col;
  const cellWidth = wallWidth / grid.columns;
  const cellHeight = wallHeight / grid.rows;
  const jitterStrength = total > 24 ? 0.035 : total > 12 ? 0.055 : 0.075;
  const xJitter = (hash01(index * 31 + total) - 0.5) * cellWidth * jitterStrength;
  const yJitter = (hash01(index * 37 + 9) - 0.5) * cellHeight * jitterStrength;
  const spreadX = grid.columns > 1 ? wallWidth / (grid.columns - 1) : 0;
  const spreadY = grid.rows > 1 ? wallHeight / (grid.rows - 1) : 0;
  const twoRowInset = grid.rows === 2 ? 0.74 : 1;
  const scaleFill = total > 24 ? 0.66 : total > 16 ? 0.7 : total > 8 ? 0.74 : 0.78;
  const scale = clamp(
    Math.min(cellWidth / (PHOTO_HEIGHT * aspect), cellHeight / PHOTO_HEIGHT) * scaleFill,
    total > 24 ? 1.18 : total > 16 ? 1.3 : 1.5,
    total > 24 ? 1.95 : total > 16 ? 2.2 : 2.65,
  );

  return {
    position: new THREE.Vector3(
      (centeredCol - (grid.columns - 1) / 2) * spreadX + xJitter + (aspect - 1) * 0.08,
      ((grid.rows - 1) / 2 - row) * spreadY * twoRowInset + yJitter,
      PHOTO_RUSH_CONFIG.wallLookZ + (hash01(index * 41 + 11) - 0.5) * 0.34 + row * 0.018,
    ),
    scale,
  };
}

function buildSmallPhotoWallLayout(index: number, total: number, aspect: number, wallWidth: number, wallHeight: number) {
  const layouts: Record<number, Array<[number, number]>> = {
    1: [[0, 0]],
    2: [[-0.28, 0.08], [0.28, -0.08]],
    3: [[-0.34, -0.18], [0, 0.24], [0.34, -0.2]],
    4: [[-0.32, 0.23], [0.32, 0.18], [-0.3, -0.22], [0.3, -0.25]],
  };
  const [nx, ny] = layouts[Math.max(1, Math.min(4, total))][index] ?? [0, 0];
  const scaleTarget = total === 1
    ? Math.min(wallWidth / (PHOTO_HEIGHT * aspect) * 0.26, wallHeight / PHOTO_HEIGHT * 0.32)
    : total === 2
      ? Math.min(wallWidth / (PHOTO_HEIGHT * aspect) * 0.22, wallHeight / PHOTO_HEIGHT * 0.34)
      : Math.min(wallWidth / (PHOTO_HEIGHT * aspect) * 0.18, wallHeight / PHOTO_HEIGHT * 0.28);
  return {
    position: new THREE.Vector3(
      nx * wallWidth + (hash01(index * 31 + total) - 0.5) * wallWidth * 0.018,
      ny * wallHeight + (hash01(index * 37 + total) - 0.5) * wallHeight * 0.018,
      PHOTO_RUSH_CONFIG.wallLookZ + (hash01(index * 41 + 11) - 0.5) * 0.24,
    ),
    scale: clamp(scaleTarget, total === 1 ? 2.15 : 1.72, total === 1 ? 4.1 : total === 2 ? 3.45 : 2.95),
  };
}

function choosePhotoWallGrid(total: number, wallAspect: number) {
  let best = { columns: Math.min(8, total), rows: Math.ceil(total / Math.min(8, total)), score: Number.POSITIVE_INFINITY };
  const maxColumns = Math.min(8, total);
  for (let columns = 2; columns <= maxColumns; columns += 1) {
    const rows = Math.ceil(total / columns);
    const empty = columns * rows - total;
    const gridAspect = columns / rows;
    const aspectScore = Math.abs(Math.log(gridAspect / Math.max(0.001, wallAspect)));
    const emptyScore = empty * 0.08;
    const densityScore = total > 18 && columns < 6 ? 0.3 : 0;
    const score = aspectScore + emptyScore + densityScore;
    if (score < best.score) {
      best = { columns, rows, score };
    }
  }
  return best;
}

function buildPhotoWallScatterPosition(index: number, total: number, wallSlot: THREE.Vector3) {
  const seed = hash01(index * 43 + total * 7);
  const z = -lerp(Math.abs(PHOTO_RUSH_CONFIG.deepZMin), Math.abs(PHOTO_RUSH_CONFIG.deepZMax), hash01(index * 71 + 19));
  const bounds = getVisibleBoundsAtZ(z, PHOTO_RUSH_CONFIG.cameraZ, getViewportAspect());
  const sideRoll = hash01(index * 47 + 5);
  const xRoll = hash01(index * 53 + 7);
  const yRoll = hash01(index * 59 + 11);
  const edgeX = bounds.halfWidth * PHOTO_RUSH_CONFIG.farPlaneMargin;
  const edgeY = bounds.halfHeight * PHOTO_RUSH_CONFIG.farPlaneMargin;
  let x = (xRoll - 0.5) * bounds.halfWidth * 2;
  let y = (yRoll - 0.5) * bounds.halfHeight * 2;

  if (sideRoll < 0.24) {
    x = -edgeX - hash01(index * 61 + 13) * bounds.halfWidth * 0.22;
  } else if (sideRoll < 0.48) {
    x = edgeX + hash01(index * 67 + 17) * bounds.halfWidth * 0.22;
  } else if (sideRoll < 0.68) {
    y = edgeY + hash01(index * 73 + 23) * bounds.halfHeight * 0.22;
  } else if (sideRoll < 0.88) {
    y = -edgeY - hash01(index * 79 + 29) * bounds.halfHeight * 0.22;
  }

  x += wallSlot.x * 0.18 + Math.sin(seed * Math.PI * 2) * 1.8;
  y += wallSlot.y * 0.18 + Math.cos(seed * Math.PI * 2) * 1.2;
  return new THREE.Vector3(x, y, z);
}

function buildPhotoWallRushControlPosition(index: number, total: number, scatter: THREE.Vector3, wallSlot: THREE.Vector3) {
  const near = buildPhotoWallNearPosition(index, total, wallSlot);
  const sidePull = Math.sign(scatter.x || hash01(index * 83 + 31) - 0.5);
  near.x += sidePull * (1.2 + hash01(index * 89 + 37) * 2.4);
  near.y += (hash01(index * 97 + total * 5) - 0.5) * 1.8;
  return near;
}

function buildPhotoWallNearPosition(index: number, total: number, wallSlot: THREE.Vector3) {
  const z = PHOTO_RUSH_CONFIG.nearZMin + hash01(index * 101 + total * 7) * (PHOTO_RUSH_CONFIG.nearZMax - PHOTO_RUSH_CONFIG.nearZMin);
  const bounds = getVisibleBoundsAtZ(z, PHOTO_RUSH_CONFIG.cameraZ, getViewportAspect());
  const angle = hash01(index * 103 + 41) * Math.PI * 2;
  const radius = 0.46 + hash01(index * 107 + 43) * 0.52;
  return new THREE.Vector3(
    Math.cos(angle) * bounds.halfWidth * PHOTO_RUSH_CONFIG.nearPlaneMargin * radius + wallSlot.x * 0.16,
    Math.sin(angle) * bounds.halfHeight * PHOTO_RUSH_CONFIG.nearPlaneMargin * radius + wallSlot.y * 0.16,
    z,
  );
}

function buildTreePhotoPosition(index: number, total: number) {
  const angle = index * GOLDEN_ANGLE;
  const cluster = CANOPY_CLUSTERS[Math.floor(hash01(index * 47 + total * 3) * 8) % 8];
  const radial = 0.38 + hash01(index * 13 + 6) * 0.38;
  const vertical = (hash01(index * 17 + 8) - 0.5) * 0.72;
  return new THREE.Vector3(
    cluster.center.x + Math.cos(angle) * cluster.radius.x * radial,
    cluster.center.y + vertical * cluster.radius.y,
    cluster.center.z + Math.sin(angle) * cluster.radius.z * (0.34 + hash01(index + 9) * 0.2) + 0.28,
  );
}

function buildSpherePosition(index: number, total: number, radius: number) {
  const y = 1 - (index / Math.max(1, total - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * GOLDEN_ANGLE;
  return new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius + 1.1);
}

function buildGalleryPosition(index: number, total: number) {
  const columns = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(total * 1.45))));
  const rows = Math.ceil(total / columns);
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = (col - (columns - 1) / 2) * 2.1;
  const y = ((rows - 1) / 2 - row) * 1.55;
  const z = -0.8 + Math.sin(col * 0.9) * 0.75 - row * 0.03;
  return new THREE.Vector3(x, y, z);
}

function buildIdleParticle(index: number, seed: number) {
  const angle = hash01(index * 3 + 4) * Math.PI * 2;
  const radius = 3.2 + hash01(index * 5 + 7) * 13.5;
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    -6.2 + hash01(index * 11 + 9) * 12.4,
    -10.5 + hash01(index * 13 + 12) * 18 + Math.sin(seed * 7) * 1.4,
  );
}

function buildAmbientParticle(index: number, seed: number): { position: THREE.Vector3; color: THREE.Color } {
  let position = new THREE.Vector3();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = hash01(index * 31 + attempt * 7) * Math.PI * 2;
    const radius = 5.9 + Math.pow(hash01(index * 37 + attempt * 11), 0.72) * TREE_SHAPE_CONFIG.ambientSpreadX;
    const y = -4.7 + hash01(index * 41 + attempt * 13) * TREE_SHAPE_CONFIG.ambientSpreadY;
    const z = -8.2 + hash01(index * 43 + attempt * 17) * TREE_SHAPE_CONFIG.ambientSpreadZ;
    position = new THREE.Vector3(
      Math.cos(angle) * radius * (0.62 + hash01(index * 47 + attempt) * 0.42),
      y,
      z + Math.sin(angle) * 1.2,
    );

    if (!isInsideTreeBody(position)) {
      break;
    }
  }

  const roll = hash01(index * 53 + 19);
  const color = roll < 0.58
    ? new THREE.Color(0xff9fca).lerp(new THREE.Color(0xffead8), hash01(index * 59 + 23) * 0.62)
    : roll < 0.82
      ? new THREE.Color(0x72dfff).lerp(new THREE.Color(0x8d78ff), hash01(index * 61 + 29) * 0.55)
      : new THREE.Color(0xffd58c).lerp(new THREE.Color(0xfff4d7), hash01(index * 67 + 31) * 0.48);

  return { position, color };
}

function buildTreeGlowParticle(index: number, seed: number): { position: THREE.Vector3; color: THREE.Color } {
  const cluster = selectCanopyCluster(index + 9100, seed);
  const direction = randomUnitVector(index + 9200, seed);
  const edgeGlow = hash01(index * 293 + 7) < 0.58;
  const radius = edgeGlow
    ? 0.78 + Math.pow(hash01(index * 307 + 11), 0.62) * 0.28
    : Math.pow(hash01(index * 311 + 13), 1.9) * 0.72;
  const topBias = hash01(index * 313 + 17) < 0.28 ? 0.38 + hash01(index * 317 + 19) * 0.52 : 0;
  const position = new THREE.Vector3(
    cluster.center.x + direction.x * cluster.radius.x * radius + Math.sin(seed * 31) * 0.1,
    cluster.center.y + direction.y * cluster.radius.y * radius + topBias,
    cluster.center.z + direction.z * cluster.radius.z * radius,
  );
  const roll = hash01(index * 331 + 23);
  const color = roll < 0.58
    ? new THREE.Color(0xffd8ed).lerp(new THREE.Color(0xffffff), hash01(index * 337 + 29) * 0.46)
    : roll < 0.82
      ? new THREE.Color(0x8bdfff).lerp(new THREE.Color(0xdad8ff), hash01(index * 347 + 31) * 0.5)
      : new THREE.Color(0xffd08e).lerp(new THREE.Color(0xfff3cf), hash01(index * 349 + 37) * 0.55);

  return { position, color };
}

function buildGroundPetalParticle(index: number, seed: number): { position: THREE.Vector3; color: THREE.Color } {
  const angle = index * GOLDEN_ANGLE + seed * 0.5;
  const coreRadius = Math.pow(hash01(index * 71 + 3), TREE_SHAPE_CONFIG.groundCenterDensity);
  const edgeOutlier = hash01(index * 73 + 7) < TREE_SHAPE_CONFIG.groundEdgeScatter * 0.16;
  const radius = edgeOutlier ? 0.76 + hash01(index * 79 + 11) * 0.32 : coreRadius;
  const x = Math.cos(angle) * TREE_SHAPE_CONFIG.groundWidth * radius * (0.72 + hash01(index * 83 + 13) * 0.34);
  const z = -0.36 + Math.sin(angle) * TREE_SHAPE_CONFIG.groundDepth * radius * (0.62 + hash01(index * 89 + 17) * 0.5);
  const y = -5.55 + hash01(index * 97 + 19) * 0.16 + (1 - radius) * 0.03;
  const pink = new THREE.Color(0xff8fbd).lerp(new THREE.Color(0xffdce8), hash01(index * 101 + 23) * 0.68);
  const color = hash01(index * 103 + 29) < 0.12
    ? pink.lerp(new THREE.Color(0x7b8dff), 0.24 + hash01(index * 107 + 31) * 0.18)
    : pink;

  return {
    position: new THREE.Vector3(x, y, z),
    color,
  };
}

function buildRainPetalAnchor(index: number, seed: number) {
  const canopyRoll = hash01(index * 181 + 3);
  if (canopyRoll < 0.88) {
    const sample = sampleCanopyParticle(index + 17000, seed, hash01(index * 191 + 7));
    sample.position.x += (hash01(index * 193 + 11) - 0.5) * 0.44;
    sample.position.y += (hash01(index * 197 + 13) - 0.5) * 0.36;
    sample.position.z += (hash01(index * 199 + 17) - 0.5) * 0.58;
    return sample.position;
  }

  if (canopyRoll < 0.96) {
    const sample = sampleBranchParticle(index + 19000, seed, hash01(index * 211 + 19));
    sample.position.y += 0.25 + hash01(index * 223 + 23) * 0.8;
    return sample.position;
  }

  const angle = seed * Math.PI * 2;
  return new THREE.Vector3(
    -7.6 + hash01(index * 227 + 29) * 2.4,
    -0.8 + hash01(index * 229 + 31) * 6.8,
    -2.5 + Math.sin(angle) * 2.8,
  );
}

function buildRainPetalColor(index: number, anchor: THREE.Vector3, depth: number) {
  const pink = new THREE.Color(0xff8fbd).lerp(new THREE.Color(0xffedf3), hash01(index * 233 + 37) * 0.74);
  if (depth < 0.28 || anchor.z < -1.65) {
    return pink.lerp(new THREE.Color(0x8ccaff), 0.16 + hash01(index * 239 + 41) * 0.22);
  }
  if (hash01(index * 241 + 43) < 0.16) {
    return pink.lerp(new THREE.Color(0xffd48e), 0.18 + hash01(index * 251 + 47) * 0.2);
  }
  return pink;
}

function buildRainPetalFrameColor(index: number, anchorZ: number, depth: number, glint: number) {
  const pink = new THREE.Color(0xff96c4).lerp(new THREE.Color(0xffedf3), hash01(index * 233 + 37) * 0.72);
  const base = depth < 0.28 || anchorZ < -1.65
    ? pink.lerp(new THREE.Color(0x9bdcff), 0.16 + hash01(index * 239 + 41) * 0.2)
    : hash01(index * 241 + 43) < 0.16
      ? pink.lerp(new THREE.Color(0xffd89a), 0.14 + hash01(index * 251 + 47) * 0.18)
      : pink;
  return base.lerp(new THREE.Color(0xffffff), glint);
}

function isInsideTreeBody(position: THREE.Vector3) {
  if (position.y < -5.45 || position.y > 6.85) {
    return false;
  }

  const nearTrunk = position.y < 1.2
    && Math.abs(position.x - trunkCenterAt(clamp((position.y + 5.35) / 6.25, 0, 1)).x) < 1.45
    && Math.abs(position.z + 0.45) < 1.25;
  if (nearTrunk) {
    return true;
  }

  return CANOPY_CLUSTERS.some((cluster) => {
    const nx = (position.x - cluster.center.x) / (cluster.radius.x * 1.08);
    const ny = (position.y - cluster.center.y) / (cluster.radius.y * 1.08);
    const nz = (position.z - cluster.center.z) / (cluster.radius.z * 1.08);
    return nx * nx + ny * ny + nz * nz < 1.12;
  });
}

function buildTreeParticle(index: number, count: number, seed: number): TreeParticleSample {
  const portion = index / count;
  const trunkEnd = TREE_SHAPE_CONFIG.trunkRatio;
  const branchEnd = trunkEnd + TREE_SHAPE_CONFIG.branchRatio;

  if (portion < trunkEnd) {
    return sampleTrunkParticle(index, seed, portion / trunkEnd);
  }

  if (portion < branchEnd) {
    return sampleBranchParticle(index, seed, (portion - trunkEnd) / TREE_SHAPE_CONFIG.branchRatio);
  }

  return sampleCanopyParticle(index, seed, (portion - branchEnd) / Math.max(0.001, 1 - branchEnd));
}

function sampleTrunkParticle(index: number, seed: number, t: number): TreeParticleSample {
  const center = trunkCenterAt(t);
  const angle = seed * Math.PI * 2;
  const radius = TREE_SHAPE_CONFIG.trunkRadius * (1 - t * 0.78) * (0.68 + hash01(index + 7) * 0.34);
  const radial = Math.sqrt(hash01(index * 5 + 11)) * radius;
  const position = new THREE.Vector3(
    center.x + Math.cos(angle) * radial * 0.7,
    center.y + (hash01(index * 7 + 3) - 0.5) * 0.08,
    center.z + Math.sin(angle) * radial * 0.46,
  );
  const color = new THREE.Color(0x3b2231).lerp(new THREE.Color(0xa76449), hash01(index + 91) * 0.55);

  return {
    position,
    color,
    size: 3.9 + hash01(index + 19) * 1.4,
    alpha: 0.72 + hash01(index + 23) * 0.18,
    kind: "trunk",
  };
}

function sampleBranchParticle(index: number, seed: number, t: number): TreeParticleSample {
  const branchIndex = Math.floor(hash01(index * 29 + 4) * TREE_SHAPE_CONFIG.branchCount);
  const descriptor = getBranchDescriptor(branchIndex);
  const curveT = Math.pow(t, 0.82);
  const start = trunkCenterAt(descriptor.startT);
  const position = cubicBezier(start, descriptor.controlA, descriptor.controlB, descriptor.end, curveT);
  const radius = descriptor.radius * (1 - curveT) + 0.035;
  const angle = seed * Math.PI * 2;
  const halo = Math.sqrt(hash01(index * 31 + 8)) * radius;
  position.x += Math.cos(angle) * halo * 0.74;
  position.y += (hash01(index * 37 + 12) - 0.5) * radius * 0.6;
  position.z += Math.sin(angle) * halo * 0.58;
  const color = new THREE.Color(0x2f2030).lerp(new THREE.Color(0x8f5946), 0.24 + hash01(index + 44) * 0.56);

  return {
    position,
    color,
    size: 2.7 + (1 - curveT) * 1.4 + hash01(index + 57) * 0.8,
    alpha: 0.62 + (1 - curveT) * 0.18,
    kind: "branch",
  };
}

function sampleCanopyParticle(index: number, seed: number, canopyT: number): TreeParticleSample {
  const cluster = selectCanopyCluster(index, seed);
  const direction = randomUnitVector(index, seed);
  const edgeChance = cluster.edgeBias + TREE_SHAPE_CONFIG.edgeScatter * 0.22;
  const isEdge = hash01(index * 53 + 2) < edgeChance;
  const radiusPower = isEdge ? 0.38 : 1.85;
  const radius = Math.pow(hash01(index * 59 + 5), radiusPower) * (isEdge ? 1.08 + hash01(index * 61 + 6) * 0.28 : 0.86);
  const densityPulse = Math.sin(canopyT * Math.PI);
  const position = new THREE.Vector3(
    cluster.center.x + direction.x * cluster.radius.x * radius,
    cluster.center.y + direction.y * cluster.radius.y * radius + (hash01(index * 67 + 9) - 0.5) * 0.28 * densityPulse,
    cluster.center.z + direction.z * cluster.radius.z * radius,
  );
  position.x += Math.sin(position.y * 1.2 + seed * 8) * 0.12;
  position.z += Math.cos(position.x * 0.8 + seed * 12) * 0.1;

  const color = canopyColor(position, cluster, index, seed);
  const core = clamp(1 - radius, 0, 1);

  return {
    position,
    color,
    size: 2.0 + core * 1.45 + (isEdge ? 0.28 : 0) + hash01(index + 71) * 0.86,
    alpha: 0.48 + core * 0.36 + (isEdge ? 0.05 : 0.16),
    kind: "canopy",
  };
}

function trunkCenterAt(t: number) {
  const y = -5.35 + t * 6.25;
  const lean = Math.sin(t * Math.PI * 1.12) * 0.34 + Math.pow(t, 1.75) * 0.16 - 0.12;
  const twist = Math.sin(t * Math.PI * 2.25) * 0.12;
  return new THREE.Vector3(lean, y, -0.45 + twist);
}

function getBranchDescriptor(index: number) {
  const startT = 0.4 + hash01(index * 7 + 1) * 0.5;
  const side = index % 2 === 0 ? -1 : 1;
  const sweep = side * (2.1 + hash01(index * 11 + 3) * 4.4) * (0.72 + startT * 0.46);
  const lift = 0.65 + hash01(index * 13 + 5) * 2.35;
  const depth = (hash01(index * 17 + 7) - 0.5) * TREE_SHAPE_CONFIG.canopyDepth * 0.78;
  const start = trunkCenterAt(startT);
  const end = new THREE.Vector3(
    start.x + sweep,
    start.y + lift,
    -0.55 + depth,
  );

  return {
    startT,
    end,
    controlA: new THREE.Vector3(
      start.x + side * (0.65 + hash01(index + 9) * 1.1),
      start.y + 0.35 + hash01(index + 15) * 0.85,
      start.z + (hash01(index + 21) - 0.5) * 0.8,
    ),
    controlB: new THREE.Vector3(
      end.x - side * (0.9 + hash01(index + 27) * 1.25),
      end.y - 0.25 - hash01(index + 31) * 0.85,
      end.z + (hash01(index + 35) - 0.5) * 0.9,
    ),
    radius: 0.22 + (1 - startT) * 0.18 + hash01(index + 39) * 0.08,
  };
}

function selectCanopyCluster(index: number, seed: number) {
  const totalWeight = CANOPY_CLUSTERS.reduce((sum, cluster) => sum + cluster.weight, 0);
  let target = hash01(index * 41 + seed * 97) * totalWeight;
  for (const cluster of CANOPY_CLUSTERS) {
    target -= cluster.weight;
    if (target <= 0) {
      return cluster;
    }
  }
  return CANOPY_CLUSTERS[CANOPY_CLUSTERS.length - 1];
}

function canopyColor(position: THREE.Vector3, cluster: CanopyCluster, index: number, seed: number) {
  const backLayer = position.z < -1.25 ? 0.22 : 0;
  const lowerShadow = position.y < 1.35 ? 0.18 : 0;
  const blueChance = clamp(cluster.blueBias + backLayer + lowerShadow, 0, 0.86);
  const roll = hash01(index * 73 + 11 + seed);

  if (roll < blueChance * TREE_SHAPE_CONFIG.blueVioletRatio * 2.1) {
    const base = new THREE.Color(0x4b73ff).lerp(new THREE.Color(0x8b62e9), hash01(index + 83));
    return base.lerp(new THREE.Color(0x86dfff), hash01(index + 89) * 0.28);
  }

  const pinkBase = new THREE.Color(0xff86bd).lerp(new THREE.Color(0xffd2e6), hash01(index + 97) * 0.62);
  if (hash01(index + 101) > TREE_SHAPE_CONFIG.pinkRatio) {
    return pinkBase.lerp(new THREE.Color(0xb58cff), 0.18 + hash01(index + 107) * 0.18);
  }
  return pinkBase.lerp(new THREE.Color(0xffb59f), hash01(index + 109) * 0.18);
}

function randomUnitVector(index: number, seed: number) {
  const u = hash01(index * 79 + seed * 19);
  const v = hash01(index * 83 + seed * 23);
  const theta = u * Math.PI * 2;
  const z = v * 2 - 1;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(Math.cos(theta) * r, z, Math.sin(theta) * r);
}

function cubicBezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number) {
  const mt = 1 - t;
  return new THREE.Vector3(
    mt * mt * mt * a.x + 3 * mt * mt * t * b.x + 3 * mt * t * t * c.x + t * t * t * d.x,
    mt * mt * mt * a.y + 3 * mt * mt * t * b.y + 3 * mt * t * t * c.y + t * t * t * d.y,
    mt * mt * mt * a.z + 3 * mt * mt * t * b.z + 3 * mt * t * t * c.z + t * t * t * d.z,
  );
}

function createPhotoMaterial(texture: THREE.Texture, blurredTexture: THREE.Texture, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uBlurMap: { value: blurredTexture },
      uOpacity: { value: opacity },
      uBlurMix: { value: 1 },
      uDim: { value: 0.92 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform sampler2D uBlurMap;
      uniform float uOpacity;
      uniform float uBlurMix;
      uniform float uDim;
      varying vec2 vUv;

      void main() {
        vec4 sharpColor = texture2D(uMap, vUv);
        vec4 blurColor = texture2D(uBlurMap, vUv);
        vec4 color = mix(sharpColor, blurColor, clamp(uBlurMix, 0.0, 1.0));
        color.rgb *= uDim;
        gl_FragColor = vec4(color.rgb, color.a * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  const gradient = ctx.createRadialGradient(128, 128, 12, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 242, 221, 0.94)");
  gradient.addColorStop(0.34, "rgba(255, 141, 184, 0.42)");
  gradient.addColorStop(0.68, "rgba(108, 229, 255, 0.14)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPetalTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  ctx.clearRect(0, 0, 128, 128);
  const gradient = ctx.createRadialGradient(58, 58, 8, 62, 62, 58);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  gradient.addColorStop(0.38, "rgba(255, 183, 213, 0.88)");
  gradient.addColorStop(0.78, "rgba(255, 112, 172, 0.42)");
  gradient.addColorStop(1, "rgba(255, 112, 172, 0)");

  ctx.save();
  ctx.translate(64, 64);
  ctx.rotate(-0.45);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-8, 34);
  ctx.bezierCurveTo(-50, 10, -38, -38, -3, -44);
  ctx.bezierCurveTo(42, -37, 46, 11, 8, 35);
  ctx.bezierCurveTo(3, 39, -3, 39, -8, 34);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 242, 248, 0.58)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-3, 28);
  ctx.bezierCurveTo(-11, 5, -9, -16, -1, -34);
  ctx.stroke();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function loadTexture(url: string) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 4;
        texture.generateMipmaps = true;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

async function samplePhotoPalette(photos: PhotoAsset[]) {
  const colors: THREE.Color[] = [];
  const canvas = document.createElement("canvas");
  canvas.width = 18;
  canvas.height = 18;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  for (const [photoIndex, photo] of photos.entries()) {
    try {
      const image = await loadImageElement(photo.previewUrl);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let sample = 0; sample < 9; sample += 1) {
        const x = Math.floor(hash01(photoIndex * 211 + sample * 17) * canvas.width);
        const y = Math.floor(hash01(photoIndex * 223 + sample * 19) * canvas.height);
        const offset = (y * canvas.width + x) * 4;
        const color = new THREE.Color(data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255);
        colors.push(color.lerp(new THREE.Color(0xffd4e6), 0.16));
      }
    } catch {
      colors.push(new THREE.Color(0xff9fca), new THREE.Color(0x86dfff), new THREE.Color(0xffd58c));
    }
  }

  return colors.length > 0 ? colors : [new THREE.Color(0xff9fca), new THREE.Color(0x86dfff), new THREE.Color(0xffd58c)];
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function disposePhotoEntries(entries: PhotoEntry[], scene: THREE.Scene) {
  entries.forEach((entry) => {
    scene.remove(entry.group);
    entry.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
    entry.texture.dispose();
    entry.blurredTexture.dispose();
    entry.material.dispose();
    entry.glowMaterial.map?.dispose();
    entry.glowMaterial.dispose();
  });
}

function disposeParticleLayers(layers: ParticleLayers | null) {
  if (!layers) {
    return;
  }

  disposePointsLayer(layers.treeCore.points, layers.treeCore.geometry);
  disposePointsLayer(layers.treeGlow.points, layers.treeGlow.geometry);
  disposePointsLayer(layers.ambient.points, layers.ambient.geometry);
  disposePointsLayer(layers.groundPetals.points, layers.groundPetals.geometry);
  disposePetalRainLayer(layers.petalRain);
  disposeCoupleKissParticleSystem(layers.coupleKiss);
}

function disposePhotoShardLayer(layer: PhotoShardLayer | null, scene: THREE.Scene) {
  if (!layer) {
    return;
  }
  scene.remove(layer.points);
  disposePointsLayer(layer.points, layer.geometry);
}

function disposePointsLayer(points: THREE.Points, geometry: THREE.BufferGeometry) {
  geometry.dispose();
  const material = points.material;
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
  } else {
    material.dispose();
  }
}

function disposePetalRainLayer(layer: PetalRainLayer) {
  layer.geometry.dispose();
  layer.texture.dispose();
  layer.material.dispose();
}

function completeIntroPhaseIfReady(
  phase: IntroPhase,
  time: number,
  started: number,
  speed: number,
  completedRef: { current: IntroPhase | null },
  completeRef: { current: (phase: IntroPhase) => void },
) {
  if (phase !== "photo-wall-enter" && phase !== "wall-to-tree") {
    return;
  }

  const settle = phase === "photo-wall-enter" ? INTRO_TIMING.wallSettleMs : INTRO_TIMING.morphSettleMs;
  const duration = getIntroDuration(phase, speed) + settle;
  if (time - started < duration || completedRef.current === phase) {
    return;
  }

  completedRef.current = phase;
  completeRef.current(phase);
}

function getIntroDuration(phase: IntroPhase, speed: number) {
  const normalizedSpeed = Math.max(0.1, speed);
  const tempoScale = getIntroTempoScale(normalizedSpeed);
  if (phase === "photo-wall-enter") {
    return Math.max(INTRO_TIMING.wallMinMs, INTRO_TIMING.wallBaseMs * tempoScale);
  }
  if (phase === "wall-to-tree") {
    return Math.max(INTRO_TIMING.morphMinMs, INTRO_TIMING.morphBaseMs * tempoScale);
  }
  return 0;
}

function getIntroEntryDelay(entry: PhotoEntry, index: number, speed: number) {
  return (PHOTO_RUSH_CONFIG.spawnDelayMinMs + hash01(index * 157 + entry.wallShardSeed * 29) * PHOTO_RUSH_CONFIG.spawnDelayMaxMs) * getIntroTempoScale(speed);
}

function getIntroTempoScale(speed: number) {
  return Math.max(0.72, Math.min(1.18, INTRO_TIMING.speedAnchor / Math.max(0.1, speed)));
}

function getViewportAspect() {
  if (typeof window === "undefined") {
    return 16 / 9;
  }
  return Math.max(0.58, Math.min(2.4, window.innerWidth / Math.max(1, window.innerHeight)));
}

function getVisibleBoundsAtZ(z: number, cameraZ: number, aspect: number) {
  const distance = Math.max(0.1, cameraZ - z);
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(48) / 2) * distance;
  return {
    halfHeight,
    halfWidth: halfHeight * aspect,
  };
}

function getDepthOfFieldBlur(z: number) {
  const farBlur = smoothstep(-9, -48, z) * 0.58;
  const closeBlur = smoothstep(3.2, 7.1, z) * 0.48;
  const wallPlaneBlur = Math.abs(z - PHOTO_RUSH_CONFIG.wallLookZ) < 2.4 ? 0 : 0.045;
  return clamp(Math.max(farBlur, closeBlur, wallPlaneBlur), 0, 0.68);
}

function quadraticBezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number) {
  const mt = 1 - clamp(t, 0, 1);
  const ct = 1 - mt;
  return new THREE.Vector3(
    mt * mt * a.x + 2 * mt * ct * b.x + ct * ct * c.x,
    mt * mt * a.y + 2 * mt * ct * b.y + ct * ct * c.y,
    mt * mt * a.z + 2 * mt * ct * b.z + ct * ct * c.z,
  );
}

function hash01(value: number) {
  const x = Math.sin(value * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function easeOutCubic(value: number) {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function easeOutExpo(value: number) {
  const t = clamp(value, 0, 1);
  return t === 1 ? 1 : 1 - Math.pow(2, -8.5 * t);
}

function easeOutBack(value: number) {
  const t = clamp(value, 0, 1);
  const c1 = 1.36;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutCubic(value: number) {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
