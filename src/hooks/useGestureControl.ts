import { useCallback, useEffect, useRef, useState } from "react";
import { Hands, type NormalizedLandmarkList, type Results } from "@mediapipe/hands";
import type { GestureName } from "../types";

type GestureStatus = "idle" | "loading" | "ready" | "camera-error" | "model-error";
type HandShape = "fist" | "openPalm" | "unknown";
export type GestureZone = "none" | "left" | "right" | "center" | "reset";

export type GestureDebugInfo = {
  detectedGesture: GestureName | null;
  emittedGesture: GestureName | null;
  ignoredReason: string;
  confidence: number;
  shape: HandShape;
  stableFrames: number;
  palm: { x: number; y: number } | null;
  activeZone: GestureZone;
  successZone: GestureZone;
  zoneProgress: {
    left: number;
    right: number;
    center: number;
    reset: number;
  };
  zoneLocked: {
    left: boolean;
    right: boolean;
  };
  historyPoints: number;
  swipeVector: { dx: number; dy: number; dt: number } | null;
  cooldowns: Record<GestureName, number>;
  globalCooldown: number;
};

export type EnabledGestureZones = {
  side: boolean;
  center: boolean;
  reset: boolean;
};

type UseGestureControlOptions = {
  onGesture: (gesture: GestureName) => boolean | void;
  enabledZones?: EnabledGestureZones;
};

type ZoneState = {
  side: "none" | "left" | "right";
  leftEnteredAt: number;
  rightEnteredAt: number;
  centerEnteredAt: number;
  resetActive: boolean;
  resetEnteredAt: number;
  resetLocked: boolean;
  leftLocked: boolean;
  rightLocked: boolean;
  resetLastAt: number;
  successZone: GestureZone;
  successUntil: number;
};

const SHAPE_STABLE_FRAMES: Record<Exclude<HandShape, "unknown">, number> = {
  fist: 5,
  openPalm: 5,
};

const RECOGNIZER_COOLDOWNS: Record<GestureName, number> = {
  fist: 1450,
  openPalm: 1450,
  swipeLeft: 320,
  swipeRight: 320,
  swipeUp: 1000,
};

const GLOBAL_RECOGNIZER_COOLDOWN = 180;
const MIN_HAND_CONFIDENCE = 0.55;
const SIDE_DWELL_MS = 500;
const CENTER_UNLOCK_DWELL_MS = 250;
const RESET_DWELL_MS = 800;
const RESET_COOLDOWN_MS = 1000;

const LEFT_ENTER_X = 0.33;
const LEFT_EXIT_X = 0.43;
const RIGHT_ENTER_X = 0.67;
const RIGHT_EXIT_X = 0.57;
const CENTER_MIN_X = 0.3;
const CENTER_MAX_X = 0.7;
const CENTER_MIN_Y = 0.1;
const CENTER_MAX_Y = 0.92;
const RESET_ENTER_MIN_X = 0.28;
const RESET_ENTER_MAX_X = 0.72;
const RESET_ENTER_Y = 0.3;
const RESET_EXIT_MIN_X = 0.22;
const RESET_EXIT_MAX_X = 0.78;
const RESET_EXIT_Y = 0.38;

const EMPTY_COOLDOWNS: Record<GestureName, number> = {
  fist: 0,
  openPalm: 0,
  swipeLeft: 0,
  swipeRight: 0,
  swipeUp: 0,
};

const DEFAULT_ENABLED_ZONES: EnabledGestureZones = {
  side: true,
  center: true,
  reset: true,
};

function createInitialZoneState(): ZoneState {
  return {
    side: "none",
    leftEnteredAt: 0,
    rightEnteredAt: 0,
    centerEnteredAt: 0,
    resetActive: false,
    resetEnteredAt: 0,
    resetLocked: false,
    leftLocked: false,
    rightLocked: false,
    resetLastAt: 0,
    successZone: "none",
    successUntil: 0,
  };
}

function createInitialDebug(): GestureDebugInfo {
  return {
    detectedGesture: null,
    emittedGesture: null,
    ignoredReason: "waiting",
    confidence: 0,
    shape: "unknown",
    stableFrames: 0,
    palm: null,
    activeZone: "none",
    successZone: "none",
    zoneProgress: {
      left: 0,
      right: 0,
      center: 0,
      reset: 0,
    },
    zoneLocked: {
      left: false,
      right: false,
    },
    historyPoints: 0,
    swipeVector: null,
    cooldowns: { ...EMPTY_COOLDOWNS },
    globalCooldown: 0,
  };
}

export function useGestureControl({ onGesture, enabledZones = DEFAULT_ENABLED_ZONES }: UseGestureControlOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isSendingRef = useRef(false);
  const shapeStateRef = useRef<{ shape: HandShape; frames: number; emittedShape: HandShape }>({
    shape: "unknown",
    frames: 0,
    emittedShape: "unknown",
  });
  const zoneStateRef = useRef<ZoneState>(createInitialZoneState());
  const lastEmitRef = useRef<Record<GestureName, number>>({ ...EMPTY_COOLDOWNS });
  const lastGlobalEmitRef = useRef(0);
  const onGestureRef = useRef(onGesture);
  const enabledZonesRef = useRef(enabledZones);
  const debugRef = useRef<GestureDebugInfo>(createInitialDebug());
  const lastDebugPaintRef = useRef(0);
  const [status, setStatus] = useState<GestureStatus>("idle");
  const [lastGesture, setLastGesture] = useState<GestureName | null>(null);
  const [debugInfo, setDebugInfo] = useState<GestureDebugInfo>(() => createInitialDebug());

  useEffect(() => {
    onGestureRef.current = onGesture;
  }, [onGesture]);

  useEffect(() => {
    enabledZonesRef.current = enabledZones;
  }, [enabledZones]);

  const updateDebug = useCallback((patch: Partial<GestureDebugInfo>, force = false) => {
    const now = performance.now();
    debugRef.current = {
      ...debugRef.current,
      ...patch,
      cooldowns: getCooldowns(lastEmitRef.current, now),
      globalCooldown: Math.max(0, GLOBAL_RECOGNIZER_COOLDOWN - (now - lastGlobalEmitRef.current)),
    };

    if (force || now - lastDebugPaintRef.current > 120) {
      lastDebugPaintRef.current = now;
      setDebugInfo({ ...debugRef.current });
    }
  }, []);

  const emitGesture = useCallback(
    (gesture: GestureName, debounce = RECOGNIZER_COOLDOWNS[gesture]) => {
      const now = performance.now();
      const globalRemaining = GLOBAL_RECOGNIZER_COOLDOWN - (now - lastGlobalEmitRef.current);
      if (globalRemaining > 0) {
        updateDebug(
          {
            detectedGesture: gesture,
            emittedGesture: null,
            ignoredReason: `recognizer global cooldown ${Math.ceil(globalRemaining)}ms`,
          },
          true,
        );
        return false;
      }

      const remaining = debounce - (now - lastEmitRef.current[gesture]);
      if (remaining > 0) {
        updateDebug(
          {
            detectedGesture: gesture,
            emittedGesture: null,
            ignoredReason: `${gesture} cooldown ${Math.ceil(remaining)}ms`,
          },
          true,
        );
        return false;
      }

      const handled = onGestureRef.current(gesture) !== false;
      lastEmitRef.current[gesture] = now;
      lastGlobalEmitRef.current = now;
      if (!handled) {
        updateDebug(
          {
            detectedGesture: gesture,
            emittedGesture: null,
            ignoredReason: "action rejected",
          },
          true,
        );
        return false;
      }

      setLastGesture(gesture);
      updateDebug(
        {
          detectedGesture: gesture,
          emittedGesture: gesture,
          ignoredReason: "emitted",
        },
        true,
      );
      return true;
    },
    [updateDebug],
  );

  const handleResults = useCallback(
    (results: Results) => {
      const landmarks = results.multiHandLandmarks?.[0];
      const confidence = getHandConfidence(results);
      if (!landmarks || confidence < MIN_HAND_CONFIDENCE) {
        shapeStateRef.current = { shape: "unknown", frames: 0, emittedShape: "unknown" };
        zoneStateRef.current = {
          ...zoneStateRef.current,
          side: "none",
          leftEnteredAt: 0,
          rightEnteredAt: 0,
          centerEnteredAt: 0,
          resetActive: false,
          resetEnteredAt: 0,
          resetLocked: false,
        };
        updateDebug(
          {
            detectedGesture: null,
            emittedGesture: null,
            ignoredReason: landmarks ? "low confidence" : "no hand",
            confidence,
            shape: "unknown",
            stableFrames: 0,
            palm: null,
            activeZone: "none",
            successZone: getVisibleSuccessZone(zoneStateRef.current, performance.now()),
            zoneProgress: createZoneProgress(),
            zoneLocked: {
              left: zoneStateRef.current.leftLocked,
              right: zoneStateRef.current.rightLocked,
            },
            historyPoints: 0,
            swipeVector: null,
          },
          Boolean(landmarks),
        );
        return;
      }

      const now = performance.now();
      const palm = getPalmCenter(landmarks);
      const shape = classifyHandShape(landmarks);
      const shapeState = shapeStateRef.current;
      if (shape === shapeState.shape) {
        shapeState.frames += 1;
      } else {
        shapeState.shape = shape;
        shapeState.frames = shape === "unknown" ? 0 : 1;
        if (shape === "unknown") {
          shapeState.emittedShape = "unknown";
        }
      }

      const zoneResult = updateZoneDwell(zoneStateRef.current, palm, shape, now, enabledZonesRef.current, emitGesture);
      const resetPending = zoneResult.activeZone === "reset" || zoneResult.zoneProgress.reset > 0;

      if ((shape === "fist" || shape === "openPalm") && !resetPending) {
        const requiredFrames = SHAPE_STABLE_FRAMES[shape];
        if (shapeState.frames >= requiredFrames && shapeState.emittedShape !== shape) {
          const emitted = emitGesture(shape, RECOGNIZER_COOLDOWNS[shape]);
          if (emitted) {
            shapeState.emittedShape = shape;
          }
        }
      }

      if (shape === "unknown") {
        shapeState.emittedShape = "unknown";
      }

      updateDebug({
        detectedGesture: zoneResult.detectedGesture,
        confidence,
        shape,
        stableFrames: shapeState.frames,
        palm,
        activeZone: zoneResult.activeZone,
        successZone: getVisibleSuccessZone(zoneStateRef.current, now),
        zoneProgress: zoneResult.zoneProgress,
        zoneLocked: {
          left: zoneStateRef.current.leftLocked,
          right: zoneStateRef.current.rightLocked,
        },
        historyPoints: 0,
        swipeVector: null,
        ignoredReason: zoneResult.reason,
      });
    },
    [emitGesture, updateDebug],
  );

  const start = useCallback(async () => {
    if (status === "loading" || status === "ready") {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    setStatus("loading");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
    } catch {
      setStatus("camera-error");
      return;
    }

    try {
      const hands = new Hands({
        locateFile: (file) => `/mediapipe/hands/${file}`,
      });
      hands.setOptions({
        selfieMode: true,
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.72,
        minTrackingConfidence: 0.68,
      });
      hands.onResults(handleResults);
      await hands.initialize();
      handsRef.current = hands;
      setStatus("ready");

      const tick = async () => {
        const activeHands = handsRef.current;
        const activeVideo = videoRef.current;
        if (
          activeHands &&
          activeVideo &&
          activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          !isSendingRef.current
        ) {
          isSendingRef.current = true;
          try {
            await activeHands.send({ image: activeVideo });
          } finally {
            isSendingRef.current = false;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setStatus("model-error");
    }
  }, [handleResults, status]);

  const stop = useCallback(async () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    shapeStateRef.current = { shape: "unknown", frames: 0, emittedShape: "unknown" };
    zoneStateRef.current = createInitialZoneState();

    if (handsRef.current) {
      await handsRef.current.close();
      handsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setStatus("idle");
    setLastGesture(null);
    updateDebug(createInitialDebug(), true);
  }, [updateDebug]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    videoRef,
    status,
    lastGesture,
    debugInfo,
    start,
    stop,
    emitGesture,
  };
}

function updateZoneDwell(
  state: ZoneState,
  palm: { x: number; y: number },
  shape: HandShape,
  now: number,
  enabledZones: EnabledGestureZones,
  emit: (gesture: GestureName, debounce?: number) => boolean,
): {
  detectedGesture: GestureName | null;
  activeZone: GestureZone;
  zoneProgress: GestureDebugInfo["zoneProgress"];
  reason: string;
} {
  if (enabledZones.side) {
    updateSideHysteresis(state, palm, now);
  } else {
    clearSideZone(state);
  }

  if (enabledZones.side && enabledZones.center) {
    updateCenterUnlock(state, palm, now);
  } else {
    state.centerEnteredAt = 0;
  }

  if (enabledZones.reset) {
    updateResetHysteresis(state, palm, shape, now);
  } else {
    state.resetActive = false;
    state.resetEnteredAt = 0;
  }

  let detectedGesture: GestureName | null = null;
  let reason = "zone tracking";

  if (enabledZones.side && state.side === "left") {
    const dwell = now - state.leftEnteredAt;
    if (!state.leftLocked && dwell >= SIDE_DWELL_MS) {
      detectedGesture = "swipeRight";
      if (emit("swipeRight", RECOGNIZER_COOLDOWNS.swipeRight)) {
        state.leftLocked = true;
        state.rightLocked = true;
        state.successZone = "left";
        state.successUntil = now + 520;
        reason = "left zone previous";
      }
    } else {
      reason = state.leftLocked ? "left zone locked, return center" : "left zone dwell";
    }
  } else if (enabledZones.side && state.side === "right") {
    const dwell = now - state.rightEnteredAt;
    if (!state.rightLocked && dwell >= SIDE_DWELL_MS) {
      detectedGesture = "swipeLeft";
      if (emit("swipeLeft", RECOGNIZER_COOLDOWNS.swipeLeft)) {
        state.leftLocked = true;
        state.rightLocked = true;
        state.successZone = "right";
        state.successUntil = now + 520;
        reason = "right zone next";
      }
    } else {
      reason = state.rightLocked ? "right zone locked, return center" : "right zone dwell";
    }
  }

  if (enabledZones.reset && state.resetActive) {
    const dwell = now - state.resetEnteredAt;
    const remaining = RESET_COOLDOWN_MS - (now - state.resetLastAt);
    if (dwell >= RESET_DWELL_MS && remaining <= 0) {
      detectedGesture = "swipeUp";
      if (emit("swipeUp", RECOGNIZER_COOLDOWNS.swipeUp)) {
        state.resetLastAt = now;
        state.successZone = "reset";
        state.successUntil = now + 700;
        state.resetActive = false;
        state.resetEnteredAt = 0;
        state.resetLocked = true;
        reason = "reset zone";
      }
    } else {
      reason = remaining > 0 ? `reset cooldown ${Math.ceil(remaining)}ms` : "reset zone dwell";
    }
  }

  const activeZone: GestureZone = state.resetActive
    ? "reset"
    : enabledZones.side && state.side !== "none"
      ? state.side
      : enabledZones.side && enabledZones.center && isCenterPalm(palm)
        ? "center"
        : "none";
  return {
    detectedGesture,
    activeZone,
    zoneProgress: createZoneProgress(state, now),
    reason,
  };
}

function clearSideZone(state: ZoneState) {
  state.side = "none";
  state.leftEnteredAt = 0;
  state.rightEnteredAt = 0;
  state.centerEnteredAt = 0;
  state.leftLocked = false;
  state.rightLocked = false;
}

function updateSideHysteresis(state: ZoneState, palm: { x: number; y: number }, now: number) {
  if (state.side === "left") {
    if (palm.x > LEFT_EXIT_X) {
      state.side = "none";
      state.leftEnteredAt = 0;
    }
    return;
  }

  if (state.side === "right") {
    if (palm.x < RIGHT_EXIT_X) {
      state.side = "none";
      state.rightEnteredAt = 0;
    }
    return;
  }

  if (palm.x < LEFT_ENTER_X) {
    state.side = "left";
    state.leftEnteredAt = now;
    return;
  }

  if (palm.x > RIGHT_ENTER_X) {
    state.side = "right";
    state.rightEnteredAt = now;
  }
}

function updateCenterUnlock(state: ZoneState, palm: { x: number; y: number }, now: number) {
  if (!isCenterPalm(palm)) {
    state.centerEnteredAt = 0;
    return;
  }

  if (state.centerEnteredAt === 0) {
    state.centerEnteredAt = now;
  }

  if (now - state.centerEnteredAt >= CENTER_UNLOCK_DWELL_MS) {
    const hadLock = state.leftLocked || state.rightLocked || state.side !== "none";
    state.leftLocked = false;
    state.rightLocked = false;
    state.side = "none";
    state.leftEnteredAt = 0;
    state.rightEnteredAt = 0;
    if (hadLock) {
      state.successZone = "center";
      state.successUntil = now + 360;
    }
  }
}

function updateResetHysteresis(state: ZoneState, palm: { x: number; y: number }, shape: HandShape, now: number) {
  if (state.resetLocked) {
    const stillInsideLockedZone =
      shape === "openPalm" &&
      palm.x > RESET_EXIT_MIN_X &&
      palm.x < RESET_EXIT_MAX_X &&
      palm.y < RESET_EXIT_Y;
    if (!stillInsideLockedZone) {
      state.resetLocked = false;
    }
    state.resetActive = false;
    state.resetEnteredAt = 0;
    return;
  }

  if (state.resetActive) {
    const stillInside =
      shape === "openPalm" &&
      palm.x > RESET_EXIT_MIN_X &&
      palm.x < RESET_EXIT_MAX_X &&
      palm.y < RESET_EXIT_Y;
    if (!stillInside) {
      state.resetActive = false;
      state.resetEnteredAt = 0;
    }
    return;
  }

  const enters =
    shape === "openPalm" &&
    palm.x > RESET_ENTER_MIN_X &&
    palm.x < RESET_ENTER_MAX_X &&
    palm.y < RESET_ENTER_Y;
  if (enters) {
    state.resetActive = true;
    state.resetEnteredAt = now;
  }
}

function isCenterPalm(palm: { x: number; y: number }) {
  return palm.x >= CENTER_MIN_X && palm.x <= CENTER_MAX_X && palm.y >= CENTER_MIN_Y && palm.y <= CENTER_MAX_Y;
}

function createZoneProgress(state?: ZoneState, now = 0) {
  if (!state) {
    return { left: 0, right: 0, center: 0, reset: 0 };
  }
  return {
    left: state.side === "left" && !state.leftLocked ? clamp01((now - state.leftEnteredAt) / SIDE_DWELL_MS) : 0,
    right: state.side === "right" && !state.rightLocked ? clamp01((now - state.rightEnteredAt) / SIDE_DWELL_MS) : 0,
    center: state.centerEnteredAt > 0 ? clamp01((now - state.centerEnteredAt) / CENTER_UNLOCK_DWELL_MS) : 0,
    reset: state.resetActive ? clamp01((now - state.resetEnteredAt) / RESET_DWELL_MS) : 0,
  };
}

function getVisibleSuccessZone(state: ZoneState, now: number): GestureZone {
  return now < state.successUntil ? state.successZone : "none";
}

function classifyHandShape(landmarks: NormalizedLandmarkList): HandShape {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const palmSize = Math.max(0.001, distance(wrist, middleMcp));

  const fingers = [
    { tip: landmarks[8], pip: landmarks[6], mcp: indexMcp },
    { tip: landmarks[12], pip: landmarks[10], mcp: middleMcp },
    { tip: landmarks[16], pip: landmarks[14], mcp: landmarks[13] },
    { tip: landmarks[20], pip: landmarks[18], mcp: landmarks[17] },
  ];

  const extendedCount = fingers.filter((finger) => {
    const tipToWrist = distance(finger.tip, wrist);
    const pipToWrist = distance(finger.pip, wrist);
    return finger.tip.y < finger.pip.y - 0.025 && tipToWrist > pipToWrist + palmSize * 0.1;
  }).length;

  const curledCount = fingers.filter((finger) => distance(finger.tip, finger.mcp) < palmSize * 0.58).length;
  const thumbOpen = distance(landmarks[4], landmarks[17]) > palmSize * 0.68;

  if (extendedCount >= 4 && thumbOpen) {
    return "openPalm";
  }

  if (curledCount >= 3 && extendedCount <= 1) {
    return "fist";
  }

  return "unknown";
}

function getPalmCenter(landmarks: NormalizedLandmarkList) {
  const ids = [0, 5, 9, 13, 17];
  const sum = ids.reduce(
    (acc, index) => {
      acc.x += landmarks[index].x;
      acc.y += landmarks[index].y;
      return acc;
    },
    { x: 0, y: 0 },
  );
  return {
    x: sum.x / ids.length,
    y: sum.y / ids.length,
  };
}

function getHandConfidence(results: Results) {
  const handedness = results.multiHandedness?.[0] as unknown as { score?: number; classification?: Array<{ score?: number }> } | undefined;
  return handedness?.score ?? handedness?.classification?.[0]?.score ?? (results.multiHandLandmarks?.[0] ? 1 : 0);
}

function getCooldowns(lastEmit: Record<GestureName, number>, now: number): Record<GestureName, number> {
  return {
    fist: Math.max(0, RECOGNIZER_COOLDOWNS.fist - (now - lastEmit.fist)),
    openPalm: Math.max(0, RECOGNIZER_COOLDOWNS.openPalm - (now - lastEmit.openPalm)),
    swipeLeft: Math.max(0, RECOGNIZER_COOLDOWNS.swipeLeft - (now - lastEmit.swipeLeft)),
    swipeRight: Math.max(0, RECOGNIZER_COOLDOWNS.swipeRight - (now - lastEmit.swipeRight)),
    swipeUp: Math.max(0, RECOGNIZER_COOLDOWNS.swipeUp - (now - lastEmit.swipeUp)),
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function distance(a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}
