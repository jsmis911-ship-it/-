export type SceneMode = "idle" | "tree" | "burst" | "viewer" | "gallery";

export type IntroPhase = "idle" | "video-prelude" | "photo-wall-enter" | "wall-to-tree" | "complete" | "skipped";

export type GestureName = "fist" | "openPalm" | "swipeLeft" | "swipeRight" | "swipeUp";

export type PhotoAsset = {
  id: string;
  name: string;
  width: number;
  height: number;
  previewUrl: string;
  blurredUrl: string;
  displayUrl: string;
};

export type PhotoLoadResult = {
  assets: PhotoAsset[];
  warnings: string[];
};
