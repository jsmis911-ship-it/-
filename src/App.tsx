import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NebulaSakuraScene } from "./components/NebulaSakuraScene";
import { useGestureControl, type EnabledGestureZones, type GestureDebugInfo, type GestureZone } from "./hooks/useGestureControl";
import { preparePhotoAssets } from "./lib/photoAssets";
import type { GestureName, PhotoAsset, SceneMode } from "./types";

const gestureLabels: Record<GestureName, string> = {
  fist: "握拳",
  openPalm: "张掌",
  swipeLeft: "右区下一张",
  swipeRight: "左区上一张",
  swipeUp: "上方重置",
};

const modeLabels: Record<SceneMode, string> = {
  idle: "星云漂浮",
  tree: "樱花成树",
  burst: "樱雨聚散",
  viewer: "照片展示",
  gallery: "整理图库",
};

type GestureFlowState = "INIT_FLOATING" | "TREE_READY" | "PETAL_RAIN" | "PHOTO_BROWSING" | "GALLERY_BROWSING";

type GestureActionDebug = {
  currentState: GestureFlowState;
  detectedGesture: GestureName | null;
  allowed: boolean;
  ignoredReason: string;
  lastSuccessfulGesture: GestureName | null;
  cooldowns: Record<GestureName, number>;
  globalCooldown: number;
};

const SHOW_GESTURE_DEBUG = false;
const ACTION_GLOBAL_COOLDOWN = 180;
const ACTION_COOLDOWNS: Record<GestureName, number> = {
  fist: 1600,
  openPalm: 1900,
  swipeLeft: 320,
  swipeRight: 320,
  swipeUp: 1000,
};

const INITIAL_ACTION_COOLDOWNS: Record<GestureName, number> = {
  fist: 0,
  openPalm: 0,
  swipeLeft: 0,
  swipeRight: 0,
  swipeUp: 0,
};

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const actionLastRef = useRef<Record<GestureName, number>>({ ...INITIAL_ACTION_COOLDOWNS });
  const globalActionLastRef = useRef(0);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [mode, setMode] = useState<SceneMode>("idle");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [galleryFocusIndex, setGalleryFocusIndex] = useState<number | null>(null);
  const [transitionKey, setTransitionKey] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<-1 | 0 | 1>(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [notice, setNotice] = useState("上传 1-32 张图片后即可开始。");
  const [dockOpen, setDockOpen] = useState(false);
  const [gestureActionDebug, setGestureActionDebug] = useState<GestureActionDebug>(() => ({
    currentState: "INIT_FLOATING",
    detectedGesture: null,
    allowed: false,
    ignoredReason: "waiting",
    lastSuccessfulGesture: null,
    cooldowns: { ...INITIAL_ACTION_COOLDOWNS },
    globalCooldown: 0,
  }));

  const clearBurstTimer = useCallback(() => {
    if (burstTimerRef.current !== null) {
      window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
  }, []);

  const resetExperience = useCallback(() => {
    clearBurstTimer();
    setMode("idle");
    setSelectedIndex(0);
    setGalleryFocusIndex(null);
    setTransitionDirection(0);
    setTransitionKey((value) => value + 1);
    setNotice(photos.length > 0 ? "循环已重置，照片回到星云漂浮。" : "上传 1-32 张图片后即可开始。");
  }, [clearBurstTimer, photos.length]);

  const goToPhoto = useCallback(
    (index: number, direction: -1 | 0 | 1) => {
      if (photos.length === 0) {
        setNotice("请先上传图片。");
        return;
      }

      const next = Math.min(Math.max(index, 0), photos.length - 1);
      setSelectedIndex(next);
      setGalleryFocusIndex(null);
      setMode("viewer");
      setTransitionDirection(direction);
      setTransitionKey((value) => value + 1);
      setNotice(`${next + 1} / ${photos.length}`);
    },
    [photos.length],
  );

  const handleGesture = useCallback(
    (gesture: GestureName) => {
      const now = performance.now();
      const currentState = deriveGestureFlowState(mode);
      const allowed = gesture === "swipeUp" || isGestureAllowedInState(currentState, gesture);
      const writeDebug = (ignoredReason: string, success = false) => {
        const cooldowns = getActionCooldowns(actionLastRef.current, now);
        const globalCooldown = Math.max(0, ACTION_GLOBAL_COOLDOWN - (now - globalActionLastRef.current));
        setGestureActionDebug((previous) => {
          const next = {
            currentState,
            detectedGesture: gesture,
            allowed,
            ignoredReason,
            lastSuccessfulGesture: success ? gesture : previous.lastSuccessfulGesture,
            cooldowns,
            globalCooldown,
          };
          if (SHOW_GESTURE_DEBUG) {
            console.debug("[gesture-action]", next);
          }
          return next;
        });
      };

      const cooldowns = getActionCooldowns(actionLastRef.current, now);
      const globalRemaining = Math.max(0, ACTION_GLOBAL_COOLDOWN - (now - globalActionLastRef.current));
      if (cooldowns[gesture] > 0 || globalRemaining > 0) {
        writeDebug(`cooldown ${Math.ceil(Math.max(cooldowns[gesture], globalRemaining))}ms`);
        return false;
      }

      if (!allowed) {
        writeDebug("blocked by state");
        return false;
      }

      const markSuccess = () => {
        actionLastRef.current[gesture] = now;
        globalActionLastRef.current = now;
        writeDebug("executed", true);
        return true;
      };

      if (gesture === "swipeUp") {
        resetExperience();
        return markSuccess();
      }

      if (gesture === "fist") {
        clearBurstTimer();
        setGalleryFocusIndex(null);
        setMode("tree");
        setNotice(photos.length > 0 ? "粒子正在汇聚成樱花树。" : "樱花树已生成，上传图片后会分布到枝叶处。");
        return markSuccess();
      }

      if (gesture === "openPalm") {
        if (photos.length === 0) {
          writeDebug("no photos");
          setNotice("请先上传图片。");
          return false;
        }

        clearBurstTimer();
        setSelectedIndex(0);
        setGalleryFocusIndex(null);
        setMode("burst");
        setTransitionDirection(0);
        setTransitionKey((value) => value + 1);
        setNotice("樱花雨散开，照片球即将打开。");
        burstTimerRef.current = window.setTimeout(() => {
          setMode("viewer");
          setNotice(`1 / ${photos.length}`);
        }, 3000);
        return markSuccess();
      }

      if (photos.length === 0) {
        writeDebug("no photos");
        setNotice("请先上传图片。");
        return false;
      }

      if (gesture === "swipeLeft") {
        if (mode === "viewer" || mode === "burst") {
          clearBurstTimer();
          if (selectedIndex >= photos.length - 1) {
            setMode("gallery");
            setGalleryFocusIndex(null);
            setNotice("已整理为图库，可滚动并点击查看。");
          } else {
            goToPhoto(selectedIndex + 1, 1);
          }
          return markSuccess();
        }

        if (mode === "gallery") {
          const base = galleryFocusIndex ?? selectedIndex;
          const next = Math.min(base + 1, photos.length - 1);
          setGalleryFocusIndex(next);
          setSelectedIndex(next);
          setTransitionKey((value) => value + 1);
          return markSuccess();
        }
      }

      if (gesture === "swipeRight") {
        if (mode === "viewer" || mode === "burst") {
          clearBurstTimer();
          goToPhoto(selectedIndex - 1, -1);
          return markSuccess();
        }

        if (mode === "gallery") {
          const base = galleryFocusIndex ?? selectedIndex;
          const previous = Math.max(base - 1, 0);
          setGalleryFocusIndex(previous);
          setSelectedIndex(previous);
          setTransitionKey((value) => value + 1);
          return markSuccess();
        }
      }

      writeDebug("no action for state");
      return false;
    },
    [clearBurstTimer, galleryFocusIndex, goToPhoto, mode, photos.length, resetExperience, selectedIndex],
  );

  const currentFlowState = deriveGestureFlowState(mode);
  const zonePermissions = useMemo(() => getZonePermissions(currentFlowState), [currentFlowState]);
  const { videoRef, status, lastGesture, debugInfo: recognizerDebug, start, stop } = useGestureControl({
    onGesture: handleGesture,
    enabledZones: zonePermissions,
  });

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) {
        return;
      }

      setUploadBusy(true);
      setNotice("正在处理高清图片纹理...");

      try {
        const result = await preparePhotoAssets(fileList);
        setPhotos(result.assets);
        setSelectedIndex(0);
        setGalleryFocusIndex(null);
        setMode("idle");
        setTransitionDirection(0);
        setTransitionKey((value) => value + 1);

        const prefix = result.assets.length > 0 ? `已载入 ${result.assets.length} 张图片。` : "没有载入有效图片。";
        setNotice([prefix, ...result.warnings].join(" "));
      } finally {
        setUploadBusy(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [],
  );

  const handleGalleryPick = useCallback(
    (index: number) => {
      setGalleryFocusIndex(index);
      setSelectedIndex(index);
      setTransitionDirection(0);
      setTransitionKey((value) => value + 1);
      setNotice(`${index + 1} / ${photos.length}`);
    },
    [photos.length],
  );

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 921px)");

    const onPointerMove = (event: PointerEvent) => {
      if (!media.matches) {
        setDockOpen(false);
        return;
      }

      const distanceFromBottom = window.innerHeight - event.clientY;
      if (distanceFromBottom <= 78) {
        setDockOpen(true);
      } else if (distanceFromBottom > 168) {
        setDockOpen(false);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key.toLowerCase() === "f") {
        handleGesture("fist");
      } else if (event.key.toLowerCase() === "o" || event.key === " ") {
        event.preventDefault();
        handleGesture("openPalm");
      } else if (event.key === "ArrowLeft") {
        handleGesture("swipeRight");
      } else if (event.key === "ArrowRight") {
        handleGesture("swipeLeft");
      } else if (event.key === "ArrowUp" || event.key.toLowerCase() === "r") {
        handleGesture("swipeUp");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleGesture]);

  useEffect(() => {
    return () => clearBurstTimer();
  }, [clearBurstTimer]);

  const visiblePhoto = useMemo(() => {
    if (mode === "viewer") {
      return photos[selectedIndex] ?? null;
    }

    if (mode === "gallery" && galleryFocusIndex !== null) {
      return photos[galleryFocusIndex] ?? null;
    }

    return null;
  }, [galleryFocusIndex, mode, photos, selectedIndex]);

  const selectedLabel = mode === "gallery" && galleryFocusIndex !== null ? galleryFocusIndex + 1 : selectedIndex + 1;
  const allowedGestures = getAllowedGestures(currentFlowState);

  return (
    <main
      className={dockOpen ? "app-shell controls-open" : "app-shell"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void handleFiles(event.dataTransfer.files);
      }}
    >
      <div className="aurora-layer" />
      <NebulaSakuraScene
        photos={photos}
        mode={mode}
        selectedIndex={selectedIndex}
        transitionKey={transitionKey}
        transitionDirection={transitionDirection}
      />

      {mode === "burst" && photos[0] && (
        <img className="photo-preload" src={photos[0].displayUrl} alt="" aria-hidden="true" />
      )}

      <div className="orientation-hint" aria-hidden="true">
        <div className="orientation-card">
          <span>Landscape</span>
          <strong>请横屏观看</strong>
        </div>
      </div>

      <section className="top-panel" aria-label="照片与手势控制">
        <div className="upload-row">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy}>
            {uploadBusy ? "处理中" : "上传图片"}
          </button>
          <span className="count-pill">{photos.length} / 32</span>
        </div>

        <div className="camera-row">
          <video ref={videoRef} className="camera-preview" muted playsInline />
          <div className="camera-actions">
            <button type="button" onClick={() => void start()} disabled={status === "ready" || status === "loading"}>
              开启手势
            </button>
            <button type="button" onClick={() => void stop()} disabled={status !== "ready" && status !== "model-error" && status !== "camera-error"}>
              关闭
            </button>
          </div>
        </div>
      </section>

      <div className="dock-edge-zone" aria-hidden="true" />

      <section
        className="gesture-dock"
        aria-label="模拟手势"
        onMouseEnter={() => setDockOpen(true)}
        onFocus={() => setDockOpen(true)}
      >
        <button type="button" onClick={() => handleGesture("fist")} title="F">
          握拳成树
        </button>
        <button type="button" onClick={() => handleGesture("openPalm")} title="O / Space">
          张掌散开
        </button>
        <button type="button" onClick={() => handleGesture("swipeLeft")} title="ArrowRight">
          右区 下一张
        </button>
        <button type="button" onClick={() => handleGesture("swipeRight")} title="ArrowLeft">
          左区 上一张
        </button>
        <button type="button" onClick={() => handleGesture("swipeUp")} title="ArrowUp / R">
          上方重置
        </button>
      </section>

      <div className="visually-hidden" aria-live="polite">
        {notice}
      </div>

      <section className="gesture-zone-overlay" aria-hidden="true">
        <div className={getZoneClass("left", recognizerDebug, zonePermissions.side)} />
        <div className={getZoneClass("right", recognizerDebug, zonePermissions.side)} />
        <div className={getZoneClass("reset", recognizerDebug, zonePermissions.reset)} />
        <div className={getZoneClass("center", recognizerDebug, zonePermissions.side && zonePermissions.center)} />
      </section>

      {SHOW_GESTURE_DEBUG && (
        <section className="gesture-debug-panel" aria-label="Gesture debug">
          <div><strong>gesture</strong> {recognizerDebug.emittedGesture ?? recognizerDebug.detectedGesture ?? "none"}</div>
          <div><strong>state</strong> {currentFlowState}</div>
          <div><strong>allowed</strong> {allowedGestures.join(", ")}</div>
          <div><strong>action</strong> {gestureActionDebug.detectedGesture ?? "none"} / {gestureActionDebug.allowed ? "allowed" : "blocked"}</div>
          <div><strong>reason</strong> {gestureActionDebug.ignoredReason}</div>
          <div><strong>last ok</strong> {gestureActionDebug.lastSuccessfulGesture ?? "none"}</div>
          <div><strong>shape</strong> {recognizerDebug.shape} ({recognizerDebug.stableFrames}) conf {recognizerDebug.confidence.toFixed(2)}</div>
          <div><strong>palm</strong> {formatPalm(recognizerDebug.palm)}</div>
          <div><strong>zone</strong> {recognizerDebug.activeZone} success {recognizerDebug.successZone}</div>
          <div><strong>progress</strong> {formatZoneProgress(recognizerDebug)}</div>
          <div><strong>locks</strong> L {recognizerDebug.zoneLocked.left ? "on" : "off"} R {recognizerDebug.zoneLocked.right ? "on" : "off"}</div>
          <div><strong>cooldown</strong> {formatCooldowns(gestureActionDebug.cooldowns)} / G {Math.ceil(gestureActionDebug.globalCooldown)}</div>
          <div><strong>recognizer</strong> {recognizerDebug.ignoredReason}</div>
        </section>
      )}

      {visiblePhoto && (
        <section className="photo-viewer" key={`${visiblePhoto.id}-${transitionKey}`}>
          <div className="photo-frame">
            <img src={visiblePhoto.displayUrl} alt={visiblePhoto.name} />
            <div className="photo-caption">
              <span>{selectedLabel} / {photos.length}</span>
              <strong>{visiblePhoto.name}</strong>
            </div>
          </div>
          {mode === "gallery" && (
            <button className="viewer-close" type="button" onClick={() => setGalleryFocusIndex(null)} aria-label="关闭当前照片">
              x
            </button>
          )}
        </section>
      )}

      {mode === "gallery" && photos.length > 0 && (
        <aside className="gallery-panel" aria-label="整理图库">
          <div className="gallery-header">
            <span>整理图库</span>
            <span>{photos.length} 张</span>
          </div>
          <div className="gallery-grid">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                className={index === selectedIndex ? "gallery-card is-active" : "gallery-card"}
                type="button"
                onClick={() => handleGalleryPick(index)}
              >
                <img src={photo.previewUrl} alt={photo.name} />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
        </aside>
      )}
    </main>
  );
}

function deriveGestureFlowState(mode: SceneMode): GestureFlowState {
  if (mode === "idle") {
    return "INIT_FLOATING";
  }
  if (mode === "tree") {
    return "TREE_READY";
  }
  if (mode === "burst") {
    return "PETAL_RAIN";
  }
  if (mode === "gallery") {
    return "GALLERY_BROWSING";
  }
  return "PHOTO_BROWSING";
}

function getAllowedGestures(state: GestureFlowState): GestureName[] {
  if (state === "INIT_FLOATING") {
    return ["fist", "swipeUp"];
  }
  if (state === "TREE_READY") {
    return ["openPalm", "swipeUp"];
  }
  return ["swipeLeft", "swipeRight", "swipeUp"];
}

function getZonePermissions(state: GestureFlowState): EnabledGestureZones {
  const sideEnabled = state === "PETAL_RAIN" || state === "PHOTO_BROWSING" || state === "GALLERY_BROWSING";
  return {
    side: sideEnabled,
    center: sideEnabled,
    reset: true,
  };
}

function isGestureAllowedInState(state: GestureFlowState, gesture: GestureName) {
  return getAllowedGestures(state).includes(gesture);
}

function getActionCooldowns(lastEmit: Record<GestureName, number>, now: number): Record<GestureName, number> {
  return {
    fist: Math.max(0, ACTION_COOLDOWNS.fist - (now - lastEmit.fist)),
    openPalm: Math.max(0, ACTION_COOLDOWNS.openPalm - (now - lastEmit.openPalm)),
    swipeLeft: Math.max(0, ACTION_COOLDOWNS.swipeLeft - (now - lastEmit.swipeLeft)),
    swipeRight: Math.max(0, ACTION_COOLDOWNS.swipeRight - (now - lastEmit.swipeRight)),
    swipeUp: Math.max(0, ACTION_COOLDOWNS.swipeUp - (now - lastEmit.swipeUp)),
  };
}

function formatCooldowns(cooldowns: Record<GestureName, number>) {
  return `F ${Math.ceil(cooldowns.fist)} O ${Math.ceil(cooldowns.openPalm)} L ${Math.ceil(cooldowns.swipeLeft)} R ${Math.ceil(cooldowns.swipeRight)} U ${Math.ceil(cooldowns.swipeUp)}`;
}

function formatPalm(palm: { x: number; y: number } | null) {
  if (!palm) {
    return "none";
  }
  return `${palm.x.toFixed(2)}, ${palm.y.toFixed(2)}`;
}

function formatZoneProgress(debug: GestureDebugInfo) {
  const progress = debug.zoneProgress;
  return `L ${Math.round(progress.left * 100)} R ${Math.round(progress.right * 100)} C ${Math.round(progress.center * 100)} U ${Math.round(progress.reset * 100)}`;
}

function getZoneClass(zone: GestureZone, debug: GestureDebugInfo, enabled: boolean) {
  const classes = ["gesture-zone", `gesture-zone-${zone}`];
  if (!enabled) {
    classes.push("is-disabled");
  }
  if (enabled && debug.activeZone === zone) {
    classes.push("is-active");
  }
  if (enabled && debug.successZone === zone) {
    classes.push("is-success");
  }
  if (enabled && ((zone === "left" && debug.zoneLocked.left) || (zone === "right" && debug.zoneLocked.right))) {
    classes.push("is-locked");
  }
  return classes.join(" ");
}

function statusLabel(status: ReturnType<typeof useGestureControl>["status"]) {
  if (status === "loading") {
    return "手势加载中";
  }
  if (status === "ready") {
    return "手势已开启";
  }
  if (status === "camera-error") {
    return "摄像头不可用";
  }
  if (status === "model-error") {
    return "模型加载失败";
  }
  return "手势未开启";
}

export default App;
