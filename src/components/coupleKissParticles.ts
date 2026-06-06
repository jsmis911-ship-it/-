import * as THREE from "three";
import type { IntroPhase, SceneMode } from "../types";

export type CoupleKissParticleConfig = {
  enableCoupleKissParticles: boolean;
  coupleParticleCount: number;
  coupleAppearDelay: number;
  coupleAppearDuration: number;
  coupleScale: number;
  couplePosition: { x: number; y: number; z: number };
};

type ParticleRole = "outline" | "fill" | "highlight";

export type CoupleKissParticleSystem = {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  current: Float32Array;
  spawn: Float32Array;
  target: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  liveSizes: Float32Array;
  alphas: Float32Array;
  liveAlphas: Float32Array;
  seeds: Float32Array;
  delays: Float32Array;
  emphasis: Float32Array;
  roles: Float32Array;
  config: CoupleKissParticleConfig;
  activeSince: number | null;
};

export type CoupleKissUpdateOptions = {
  mode: SceneMode;
  introPhase: IntroPhase;
  time: number;
  treeFormationProgress: number;
};

const DEFAULT_COUPLE_KISS_CONFIG: CoupleKissParticleConfig = {
  enableCoupleKissParticles: true,
  coupleParticleCount: 3400,
  coupleAppearDelay: 1.18,
  coupleAppearDuration: 2.85,
  coupleScale: 2.12,
  couplePosition: { x: 0.2, y: -3.1, z: 1.86 },
};

const ROLE_SPLIT = {
  outline: 0.64,
  fill: 0.22,
};

type CoupleSample = {
  position: THREE.Vector3;
  color: THREE.Color;
  size: number;
  alpha: number;
  delay: number;
  emphasis: number;
  role: ParticleRole;
};

export function createCoupleKissParticleSystem(configOverrides: Partial<CoupleKissParticleConfig> = {}): CoupleKissParticleSystem {
  const config = mergeCoupleConfig(configOverrides);
  const count = clampInt(config.coupleParticleCount, 1500, 3500);
  const geometry = new THREE.BufferGeometry();
  const current = new Float32Array(count * 3);
  const spawn = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const liveSizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const liveAlphas = new Float32Array(count);
  const seeds = new Float32Array(count);
  const delays = new Float32Array(count);
  const emphasis = new Float32Array(count);
  const roles = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const seed = hash01(i * 97 + 17);
    const sample = buildCoupleTargetSample(i, count, seed);
    const spawnPoint = buildCoupleSpawnPoint(i, seed, sample.position);
    const offset = i * 3;

    seeds[i] = seed;
    spawn.set([spawnPoint.x, spawnPoint.y, spawnPoint.z], offset);
    target.set([sample.position.x, sample.position.y, sample.position.z], offset);
    current.set([spawnPoint.x, spawnPoint.y, spawnPoint.z], offset);
    colors.set([sample.color.r, sample.color.g, sample.color.b], offset);
    sizes[i] = sample.size;
    liveSizes[i] = sample.size * 0.62;
    alphas[i] = sample.alpha;
    liveAlphas[i] = 0;
    delays[i] = sample.delay;
    emphasis[i] = sample.emphasis;
    roles[i] = roleCode(sample.role);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(current, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(liveSizes, 1));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(liveAlphas, 1));

  const material = createCoupleParticleMaterial();
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 8;

  return {
    points,
    geometry,
    material,
    current,
    spawn,
    target,
    colors,
    sizes,
    liveSizes,
    alphas,
    liveAlphas,
    seeds,
    delays,
    emphasis,
    roles,
    config,
    activeSince: null,
  };
}

export function updateCoupleKissParticleSystem(system: CoupleKissParticleSystem, options: CoupleKissUpdateOptions) {
  const { config } = system;
  const active = config.enableCoupleKissParticles && (options.mode === "tree" || options.introPhase === "wall-to-tree");

  if (active && system.activeSince === null) {
    system.activeSince = options.time;
  } else if (!active && options.mode === "idle" && options.introPhase !== "wall-to-tree") {
    system.activeSince = null;
  }

  const activeElapsed = system.activeSince === null ? 0 : (options.time - system.activeSince) / 1000;
  const treeReadiness = options.introPhase === "wall-to-tree"
    ? smoothstep(0.58, 0.96, options.treeFormationProgress)
    : options.mode === "tree" ? 1 : 0;
  const globalProgress = active
    ? smoothstep(config.coupleAppearDelay, config.coupleAppearDelay + config.coupleAppearDuration, activeElapsed) * treeReadiness
    : 0;
  const pulseCenter = config.coupleAppearDelay + config.coupleAppearDuration + 0.26;
  const pulse = active ? Math.exp(-Math.pow(activeElapsed - pulseCenter, 2) / 0.075) : 0;
  const positions = system.geometry.getAttribute("position") as THREE.BufferAttribute;
  const sizes = system.geometry.getAttribute("aSize") as THREE.BufferAttribute;
  const alphas = system.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;

  for (let i = 0; i < system.seeds.length; i += 1) {
    const offset = i * 3;
    const seed = system.seeds[i];
    const delay = system.delays[i];
    const role = system.roles[i];
    const localProgress = active
      ? easeInOutCubic(clamp((activeElapsed - config.coupleAppearDelay - delay) / config.coupleAppearDuration, 0, 1)) * treeReadiness
      : 0;
    const roleLock = role === 0 ? 1.08 : role === 1 ? 0.88 : 1.18;
    const breath = Math.sin(options.time * 0.00092 + seed * 29) * 0.008 * localProgress;
    const driftX = Math.sin(options.time * 0.00034 + seed * 19) * 0.007 * localProgress;
    const driftY = Math.cos(options.time * 0.00031 + seed * 13) * 0.011 * localProgress;
    const driftZ = Math.sin(options.time * 0.00028 + seed * 23) * 0.01 * localProgress;

    const tx = lerp(system.spawn[offset], system.target[offset], localProgress) + driftX;
    const ty = lerp(system.spawn[offset + 1], system.target[offset + 1], localProgress) + driftY + breath;
    const tz = lerp(system.spawn[offset + 2], system.target[offset + 2], localProgress) + driftZ;
    const mix = active ? lerp(0.048, 0.15, localProgress) * roleLock : 0.026;

    system.current[offset] += (tx - system.current[offset]) * mix;
    system.current[offset + 1] += (ty - system.current[offset + 1]) * mix;
    system.current[offset + 2] += (tz - system.current[offset + 2]) * mix;

    const twinkle = 0.94 + Math.sin(options.time * 0.00128 + seed * 41) * 0.045 + hash01(seed * 211 + i) * 0.035;
    const highlightPulse = pulse * system.emphasis[i] * (role === 2 ? 0.55 : 0.16);
    const targetAlpha = system.alphas[i] * globalProgress * twinkle + highlightPulse;
    const targetSize = system.sizes[i] * (0.96 + localProgress * 0.1 + Math.sin(options.time * 0.0007 + seed * 17) * 0.025 + highlightPulse * 0.24);

    system.liveAlphas[i] += (targetAlpha - system.liveAlphas[i]) * 0.14;
    system.liveSizes[i] += (targetSize - system.liveSizes[i]) * 0.12;
  }

  positions.needsUpdate = true;
  sizes.needsUpdate = true;
  alphas.needsUpdate = true;
  system.material.uniforms.uOpacity.value += ((active ? 1 : 0) - system.material.uniforms.uOpacity.value) * 0.08;
  system.material.uniforms.uTime.value = options.time * 0.001;
}

export function resizeCoupleKissParticleSystem(system: CoupleKissParticleSystem, viewportAspect: number, pixelRatio: number) {
  const { couplePosition, coupleScale } = system.config;
  const narrowScale = viewportAspect < 1.2 ? 0.74 : viewportAspect < 1.45 ? 0.88 : 1;
  const wideScale = viewportAspect > 1.85 ? 1.05 : 1;
  const yNudge = viewportAspect < 1.2 ? -0.1 : viewportAspect > 1.85 ? 0.08 : 0;
  system.points.position.set(couplePosition.x, couplePosition.y + yNudge, couplePosition.z);
  system.points.scale.setScalar(coupleScale * narrowScale * wideScale);
  system.material.uniforms.uPixelRatio.value = Math.min(pixelRatio, 1.8);
}

export function disposeCoupleKissParticleSystem(system: CoupleKissParticleSystem) {
  system.geometry.dispose();
  system.material.dispose();
}

function buildCoupleTargetSample(index: number, total: number, seed: number): CoupleSample {
  const outlineCount = Math.floor(total * ROLE_SPLIT.outline);
  const fillCount = Math.floor(total * ROLE_SPLIT.fill);

  if (index < outlineCount) {
    return sampleOutlineParticle(index, outlineCount, seed);
  }

  if (index < outlineCount + fillCount) {
    return sampleFillParticle(index - outlineCount, fillCount, seed);
  }

  return sampleHighlightParticle(index - outlineCount - fillCount, total - outlineCount - fillCount, seed);
}

function sampleOutlineParticle(index: number, count: number, seed: number): CoupleSample {
  const roll = hash01(index * 47 + 3);
  if (roll < 0.15) {
    return sampleMaleHeadOutline(index, seed);
  }
  if (roll < 0.39) {
    return sampleMaleCoatOutline(index, seed);
  }
  if (roll < 0.49) {
    return sampleMaleHoodAndShoulder(index, seed);
  }
  if (roll < 0.62) {
    return sampleFemaleHeadOutline(index, seed);
  }
  if (roll < 0.78) {
    return sampleFemaleHairOutline(index, seed);
  }
  return sampleFemaleCoatOutline(index, seed);
}

function sampleFillParticle(index: number, count: number, seed: number): CoupleSample {
  const roll = hash01(index * 53 + 7);
  if (roll < 0.38) {
    return sampleMaleCoatFill(index, seed);
  }
  if (roll < 0.78) {
    return sampleFemaleCoatFill(index, seed);
  }
  if (roll < 0.9) {
    return sampleHeadSoftFill(index, seed, "male");
  }
  return sampleHeadSoftFill(index, seed, "female");
}

function sampleHighlightParticle(index: number, count: number, seed: number): CoupleSample {
  const roll = hash01(index * 59 + 11);
  if (roll < 0.14) {
    return sampleKissHighlight(index, seed);
  }
  if (roll < 0.48) {
    return sampleFemaleCoatBrightEdge(index, seed);
  }
  if (roll < 0.72) {
    return sampleFemaleHairBrightEdge(index, seed);
  }
  if (roll < 0.86) {
    return sampleHeadContactRim(index, seed);
  }
  return sampleMaleCoatRim(index, seed);
}

function sampleMaleHeadOutline(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 61 + 13);
  let point: THREE.Vector2;

  if (roll < 0.22) {
    const spike = Math.floor(hash01(index * 67 + 17) * 5);
    const start = new THREE.Vector2(-0.36 + spike * 0.055, 0.78 - spike * 0.02);
    const end = new THREE.Vector2(-0.58 + spike * 0.078, 0.64 - hash01(index * 71 + 19) * 0.1);
    point = sampleLine(start, end, hash01(index * 73 + 23), 0.012, index);
  } else if (roll < 0.48) {
    const theta = lerp(Math.PI * 1.04, Math.PI * 1.82, hash01(index * 79 + 29));
    point = sampleEllipsePoint(-0.27, 0.55, 0.2, 0.28, theta, 1, -0.34);
  } else if (roll < 0.72) {
    const theta = lerp(Math.PI * 1.82, Math.PI * 2.24, hash01(index * 83 + 31));
    point = sampleEllipsePoint(-0.27, 0.55, 0.2, 0.28, theta, 1, -0.34);
    point.x += 0.038;
    point.y -= 0.035;
  } else {
    point = sampleCubic(
      new THREE.Vector2(-0.12, 0.61),
      new THREE.Vector2(-0.055, 0.57),
      new THREE.Vector2(-0.035, 0.51),
      new THREE.Vector2(-0.006, 0.48),
      hash01(index * 89 + 37),
      0.006,
      index,
    );
  }

  return particle(point.x, point.y, -0.02, seed, "outline", {
    colorA: 0x91829b,
    colorB: 0xe1b8d2,
    mix: 0.34,
    size: 0.082,
    alpha: 0.7,
    delay: 0.2,
    emphasis: 0.28,
  });
}

function sampleFemaleHeadOutline(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 97 + 41);
  let point: THREE.Vector2;

  if (roll < 0.64) {
    const theta = lerp(-0.12, Math.PI * 1.26, hash01(index * 101 + 43));
    point = sampleEllipsePoint(0.18, 0.53, 0.17, 0.245, theta, 1, 0.12);
    if (point.x < 0.08) {
      point.x -= 0.025;
      point.y -= 0.012;
    }
  } else {
    point = sampleCubic(
      new THREE.Vector2(0.04, 0.56),
      new THREE.Vector2(0.005, 0.535),
      new THREE.Vector2(-0.006, 0.5),
      new THREE.Vector2(0.006, 0.47),
      hash01(index * 103 + 47),
      0.006,
      index,
    );
  }

  return particle(point.x, point.y, 0.03, seed, "outline", {
    colorA: 0xffdce9,
    colorB: 0xffffff,
    mix: 0.34,
    size: 0.086,
    alpha: 0.72,
    delay: 0.28,
    emphasis: 0.34,
  });
}

function sampleFemaleHairOutline(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 107 + 53);
  let point: THREE.Vector2;

  if (roll < 0.45) {
    point = sampleCubic(
      new THREE.Vector2(0.13, 0.78),
      new THREE.Vector2(0.42, 0.66),
      new THREE.Vector2(0.48, 0.18),
      new THREE.Vector2(0.38, -0.22),
      hash01(index * 109 + 59),
      0.014,
      index,
    );
  } else if (roll < 0.76) {
    point = sampleCubic(
      new THREE.Vector2(0.06, 0.66),
      new THREE.Vector2(0.04, 0.48),
      new THREE.Vector2(0.08, 0.24),
      new THREE.Vector2(0.13, 0.05),
      hash01(index * 113 + 61),
      0.012,
      index,
    );
  } else {
    point = sampleCubic(
      new THREE.Vector2(0.26, 0.72),
      new THREE.Vector2(0.36, 0.5),
      new THREE.Vector2(0.34, 0.18),
      new THREE.Vector2(0.28, -0.05),
      hash01(index * 127 + 67),
      0.012,
      index,
    );
  }

  return particle(point.x, point.y, 0.055, seed, "outline", {
    colorA: 0x7f5f87,
    colorB: 0xe8c7df,
    mix: 0.38,
    size: 0.08,
    alpha: 0.66,
    delay: 0.32,
    emphasis: 0.36,
  });
}

function sampleMaleCoatOutline(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 131 + 71);
  let point: THREE.Vector2;

  if (roll < 0.32) {
    point = sampleCubic(
      new THREE.Vector2(-0.56, 0.18),
      new THREE.Vector2(-0.62, -0.14),
      new THREE.Vector2(-0.58, -0.72),
      new THREE.Vector2(-0.5, -1.18),
      hash01(index * 137 + 73),
      0.015,
      index,
    );
  } else if (roll < 0.62) {
    point = sampleCubic(
      new THREE.Vector2(-0.12, 0.18),
      new THREE.Vector2(-0.2, -0.2),
      new THREE.Vector2(-0.17, -0.74),
      new THREE.Vector2(-0.1, -1.12),
      hash01(index * 139 + 79),
      0.012,
      index,
    );
  } else if (roll < 0.78) {
    point = sampleLine(new THREE.Vector2(-0.5, -1.18), new THREE.Vector2(-0.1, -1.12), hash01(index * 149 + 83), 0.018, index);
  } else {
    point = sampleCubic(
      new THREE.Vector2(-0.52, 0.19),
      new THREE.Vector2(-0.42, 0.3),
      new THREE.Vector2(-0.2, 0.27),
      new THREE.Vector2(-0.1, 0.18),
      hash01(index * 151 + 89),
      0.014,
      index,
    );
  }

  return particle(point.x, point.y, 0, seed, "outline", {
    colorA: 0x786f86,
    colorB: 0xd7aecf,
    mix: 0.28,
    size: 0.082,
    alpha: 0.66,
    delay: 0.08,
    emphasis: 0.22,
  });
}

function sampleMaleHoodAndShoulder(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 157 + 97);
  const point = roll < 0.58
    ? sampleCubic(
      new THREE.Vector2(-0.54, 0.22),
      new THREE.Vector2(-0.45, 0.36),
      new THREE.Vector2(-0.22, 0.34),
      new THREE.Vector2(-0.08, 0.2),
      hash01(index * 163 + 101),
      0.012,
      index,
    )
    : sampleCubic(
      new THREE.Vector2(-0.46, 0.25),
      new THREE.Vector2(-0.48, 0.08),
      new THREE.Vector2(-0.36, -0.08),
      new THREE.Vector2(-0.23, -0.18),
      hash01(index * 167 + 103),
      0.012,
      index,
    );

  return particle(point.x, point.y, -0.01, seed, "outline", {
    colorA: 0x8a788c,
    colorB: 0xdcb3cf,
    mix: 0.34,
    size: 0.076,
    alpha: 0.58,
    delay: 0.18,
    emphasis: 0.18,
  });
}

function sampleFemaleCoatOutline(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 173 + 107);
  let point: THREE.Vector2;

  if (roll < 0.3) {
    point = sampleCubic(
      new THREE.Vector2(0.09, 0.18),
      new THREE.Vector2(0.06, -0.26),
      new THREE.Vector2(0.11, -0.8),
      new THREE.Vector2(0.16, -1.14),
      hash01(index * 179 + 109),
      0.011,
      index,
    );
  } else if (roll < 0.62) {
    point = sampleCubic(
      new THREE.Vector2(0.37, 0.17),
      new THREE.Vector2(0.47, -0.18),
      new THREE.Vector2(0.45, -0.78),
      new THREE.Vector2(0.39, -1.14),
      hash01(index * 181 + 113),
      0.01,
      index,
    );
  } else if (roll < 0.78) {
    point = sampleLine(new THREE.Vector2(0.16, -1.14), new THREE.Vector2(0.39, -1.14), hash01(index * 191 + 127), 0.014, index);
  } else {
    point = sampleCubic(
      new THREE.Vector2(0.1, 0.17),
      new THREE.Vector2(0.18, 0.25),
      new THREE.Vector2(0.31, 0.24),
      new THREE.Vector2(0.39, 0.16),
      hash01(index * 193 + 131),
      0.012,
      index,
    );
  }

  return particle(point.x, point.y, 0.055, seed, "outline", {
    colorA: 0xffe3eb,
    colorB: 0xffffff,
    mix: 0.46,
    size: 0.088,
    alpha: 0.74,
    delay: 0.16,
    emphasis: 0.42,
  });
}

function sampleMaleCoatFill(index: number, seed: number): CoupleSample {
  const y = lerp(0.12, -1.08, hash01(index * 197 + 137));
  const t = clamp((0.12 - y) / 1.2, 0, 1);
  const left = lerp(-0.52, -0.47, t) + Math.sin(t * Math.PI) * -0.035;
  const right = lerp(-0.15, -0.11, t) + Math.sin(t * Math.PI) * -0.055;
  const x = lerp(left, right, hash01(index * 199 + 139));
  return particle(x, y, -0.015, seed, "fill", {
    colorA: 0x514a63,
    colorB: 0xa98bad,
    mix: 0.22,
    size: 0.064,
    alpha: 0.32,
    delay: 0.02,
    emphasis: 0.04,
  });
}

function sampleFemaleCoatFill(index: number, seed: number): CoupleSample {
  const y = lerp(0.12, -1.08, hash01(index * 211 + 149));
  const t = clamp((0.12 - y) / 1.2, 0, 1);
  const left = lerp(0.12, 0.17, t) + Math.sin(t * Math.PI) * -0.035;
  const right = lerp(0.35, 0.39, t) + Math.sin(t * Math.PI) * 0.045;
  const x = lerp(left, right, hash01(index * 223 + 151));
  return particle(x, y, 0.04, seed, "fill", {
    colorA: 0xffd7e5,
    colorB: 0xffffff,
    mix: 0.34,
    size: 0.068,
    alpha: 0.38,
    delay: 0.12,
    emphasis: 0.08,
  });
}

function sampleHeadSoftFill(index: number, seed: number, side: "male" | "female"): CoupleSample {
  const female = side === "female";
  const centerX = female ? 0.18 : -0.27;
  const centerY = female ? 0.53 : 0.55;
  const rx = female ? 0.13 : 0.15;
  const ry = female ? 0.18 : 0.2;
  const theta = hash01(index * 227 + (female ? 157 : 163)) * Math.PI * 2;
  const radius = Math.sqrt(hash01(index * 229 + (female ? 167 : 173))) * 0.78;
  const point = sampleEllipsePoint(centerX, centerY, rx, ry, theta, radius, female ? 0.12 : -0.34);
  return particle(point.x, point.y, female ? 0.025 : -0.02, seed, "fill", {
    colorA: female ? 0xffd8e8 : 0x6b6174,
    colorB: female ? 0xffffff : 0xbf9ebb,
    mix: female ? 0.24 : 0.2,
    size: 0.058,
    alpha: female ? 0.3 : 0.24,
    delay: female ? 0.32 : 0.26,
    emphasis: 0.03,
  });
}

function sampleKissHighlight(index: number, seed: number): CoupleSample {
  const angle = hash01(index * 233 + 179) * Math.PI * 2;
  const radius = Math.pow(hash01(index * 239 + 181), 1.8) * 0.055;
  const x = -0.006 + Math.cos(angle) * radius * 0.8;
  const y = 0.486 + Math.sin(angle) * radius * 0.55;
  return particle(x, y, 0.12, seed, "highlight", {
    colorA: 0xfff6e5,
    colorB: 0xffb9d6,
    mix: 0.36,
    size: 0.102,
    alpha: 0.84,
    delay: 0.78,
    emphasis: 1,
  });
}

function sampleFemaleCoatBrightEdge(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 241 + 191);
  const point = roll < 0.82
    ? sampleCubic(
      new THREE.Vector2(0.39, 0.16),
      new THREE.Vector2(0.49, -0.18),
      new THREE.Vector2(0.46, -0.76),
      new THREE.Vector2(0.4, -1.13),
      hash01(index * 251 + 193),
      0.008,
      index,
    )
    : sampleLine(new THREE.Vector2(0.18, -1.12), new THREE.Vector2(0.4, -1.13), hash01(index * 257 + 197), 0.01, index);
  return particle(point.x, point.y, 0.09, seed, "highlight", {
    colorA: 0xffffff,
    colorB: 0xffdfea,
    mix: 0.22,
    size: 0.092,
    alpha: 0.86,
    delay: 0.36,
    emphasis: 0.68,
  });
}

function sampleFemaleHairBrightEdge(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 263 + 199);
  const point = roll < 0.62
    ? sampleCubic(
      new THREE.Vector2(0.17, 0.78),
      new THREE.Vector2(0.43, 0.64),
      new THREE.Vector2(0.46, 0.18),
      new THREE.Vector2(0.37, -0.14),
      hash01(index * 269 + 211),
      0.008,
      index,
    )
    : sampleCubic(
      new THREE.Vector2(0.06, 0.64),
      new THREE.Vector2(0.02, 0.48),
      new THREE.Vector2(0.07, 0.24),
      new THREE.Vector2(0.13, 0.06),
      hash01(index * 271 + 223),
      0.008,
      index,
    );
  return particle(point.x, point.y, 0.1, seed, "highlight", {
    colorA: 0xe7bdd9,
    colorB: 0xffedf8,
    mix: 0.38,
    size: 0.078,
    alpha: 0.68,
    delay: 0.42,
    emphasis: 0.42,
  });
}

function sampleHeadContactRim(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 277 + 227);
  const point = roll < 0.52
    ? sampleCubic(
      new THREE.Vector2(-0.09, 0.58),
      new THREE.Vector2(-0.05, 0.54),
      new THREE.Vector2(-0.025, 0.5),
      new THREE.Vector2(-0.002, 0.476),
      hash01(index * 281 + 229),
      0.005,
      index,
    )
    : sampleCubic(
      new THREE.Vector2(0.046, 0.57),
      new THREE.Vector2(0.012, 0.54),
      new THREE.Vector2(0, 0.505),
      new THREE.Vector2(0.006, 0.472),
      hash01(index * 283 + 233),
      0.005,
      index,
    );
  return particle(point.x, point.y, 0.105, seed, "highlight", {
    colorA: 0xffe3ef,
    colorB: 0xffffff,
    mix: 0.28,
    size: 0.076,
    alpha: 0.72,
    delay: 0.54,
    emphasis: 0.5,
  });
}

function sampleMaleCoatRim(index: number, seed: number): CoupleSample {
  const roll = hash01(index * 293 + 239);
  const point = roll < 0.55
    ? sampleCubic(
      new THREE.Vector2(-0.55, 0.17),
      new THREE.Vector2(-0.61, -0.14),
      new THREE.Vector2(-0.56, -0.72),
      new THREE.Vector2(-0.49, -1.14),
      hash01(index * 307 + 241),
      0.01,
      index,
    )
    : sampleCubic(
      new THREE.Vector2(-0.5, 0.22),
      new THREE.Vector2(-0.39, 0.29),
      new THREE.Vector2(-0.22, 0.27),
      new THREE.Vector2(-0.09, 0.18),
      hash01(index * 311 + 251),
      0.01,
      index,
    );
  return particle(point.x, point.y, 0.04, seed, "highlight", {
    colorA: 0xae8fb0,
    colorB: 0xffc9df,
    mix: 0.28,
    size: 0.074,
    alpha: 0.56,
    delay: 0.28,
    emphasis: 0.25,
  });
}

function particle(
  x: number,
  y: number,
  z: number,
  seed: number,
  role: ParticleRole,
  options: {
    colorA: number;
    colorB: number;
    mix: number;
    size: number;
    alpha: number;
    delay: number;
    emphasis: number;
  },
): CoupleSample {
  const zJitter = role === "highlight" ? 0.03 : role === "outline" ? 0.07 : 0.1;
  const sizeBoost = role === "outline" ? 1.12 : role === "highlight" ? 1.18 : 0.94;
  const alphaBoost = role === "outline" ? 1.08 : role === "highlight" ? 1.16 : 0.82;

  return {
    position: new THREE.Vector3(x, y, z + (seed - 0.5) * zJitter),
    color: mixColors(options.colorA, options.colorB, clamp(options.mix + hash01(seed * 997) * 0.16, 0, 1)),
    size: options.size * sizeBoost * (0.88 + hash01(seed * 577) * 0.24),
    alpha: clamp(options.alpha * alphaBoost * (0.9 + hash01(seed * 733) * 0.16), 0, 0.98),
    delay: options.delay + hash01(seed * 491) * (role === "highlight" ? 0.16 : 0.26),
    emphasis: options.emphasis,
    role,
  };
}

function buildCoupleSpawnPoint(index: number, seed: number, target: THREE.Vector3) {
  const roll = hash01(index * 401 + 311);
  let x = 0;
  let y = 0;
  let z = 0;

  if (roll < 0.48) {
    x = (hash01(index * 409 + 313) - 0.5) * 7.4;
    y = 2.15 + hash01(index * 419 + 317) * 4.6;
    z = -2.4 + hash01(index * 421 + 331) * 4.4;
  } else if (roll < 0.76) {
    const side = hash01(index * 431 + 337) < 0.5 ? -1 : 1;
    x = side * (4.6 + hash01(index * 433 + 347) * 3.2);
    y = -0.6 + hash01(index * 439 + 349) * 4.8;
    z = -4.8 + hash01(index * 443 + 353) * 5.2;
  } else {
    x = (hash01(index * 449 + 359) - 0.5) * 2.8;
    y = -1.18 + hash01(index * 457 + 367) * 0.52;
    z = -0.4 + hash01(index * 461 + 373) * 2;
  }

  return new THREE.Vector3(x, y, z).lerp(target, seed < 0.2 ? 0.16 : 0);
}

function createCoupleParticleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uPixelRatio: { value: typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 1.8) },
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uPixelRatio;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (320.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uTime;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float core = smoothstep(0.5, 0.09, d);
        float halo = smoothstep(0.5, 0.24, d);
        float shimmer = 0.95 + sin(uTime * 1.3 + vColor.r * 7.0) * 0.05;
        float alpha = (core * 0.84 + halo * 0.26) * vAlpha * uOpacity;
        vec3 color = vColor * (0.86 + halo * 0.42) * shimmer;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });
}

function mergeCoupleConfig(config: Partial<CoupleKissParticleConfig>) {
  return {
    ...DEFAULT_COUPLE_KISS_CONFIG,
    ...config,
    couplePosition: {
      ...DEFAULT_COUPLE_KISS_CONFIG.couplePosition,
      ...config.couplePosition,
    },
  };
}

function sampleEllipsePoint(cx: number, cy: number, rx: number, ry: number, theta: number, radius: number, angle: number) {
  const x = cx + Math.cos(theta) * rx * radius;
  const y = cy + Math.sin(theta) * ry * radius;
  return rotateAround(x, y, cx, cy, angle);
}

function sampleLine(start: THREE.Vector2, end: THREE.Vector2, t: number, jitter: number, index: number) {
  const x = lerp(start.x, end.x, t) + (hash01(index * 467 + 379) - 0.5) * jitter;
  const y = lerp(start.y, end.y, t) + (hash01(index * 479 + 383) - 0.5) * jitter;
  return new THREE.Vector2(x, y);
}

function sampleCubic(
  start: THREE.Vector2,
  controlA: THREE.Vector2,
  controlB: THREE.Vector2,
  end: THREE.Vector2,
  t: number,
  jitter: number,
  index: number,
) {
  const mt = 1 - t;
  const x = mt * mt * mt * start.x + 3 * mt * mt * t * controlA.x + 3 * mt * t * t * controlB.x + t * t * t * end.x;
  const y = mt * mt * mt * start.y + 3 * mt * mt * t * controlA.y + 3 * mt * t * t * controlB.y + t * t * t * end.y;
  return new THREE.Vector2(
    x + (hash01(index * 487 + 389) - 0.5) * jitter,
    y + (hash01(index * 491 + 397) - 0.5) * jitter,
  );
}

function rotateAround(x: number, y: number, cx: number, cy: number, angle: number) {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new THREE.Vector2(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
}

function mixColors(a: number, b: number, amount: number) {
  return new THREE.Color(a).lerp(new THREE.Color(b), clamp(amount, 0, 1));
}

function roleCode(role: ParticleRole) {
  if (role === "outline") {
    return 0;
  }
  if (role === "fill") {
    return 1;
  }
  return 2;
}

function clampInt(value: number, min: number, max: number) {
  return Math.floor(Math.min(max, Math.max(min, value)));
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

function easeInOutCubic(value: number) {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
