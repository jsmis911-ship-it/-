import type { PhotoAsset, PhotoLoadResult } from "../types";

const MAX_PHOTOS = 32;
const PREVIEW_EDGE = 1280;
const DISPLAY_EDGE = 2560;

export async function preparePhotoAssets(fileList: FileList): Promise<PhotoLoadResult> {
  const files = Array.from(fileList);
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const selected = imageFiles.slice(0, MAX_PHOTOS);
  const warnings: string[] = [];

  if (files.length !== imageFiles.length) {
    warnings.push("已跳过非图片文件。");
  }

  if (imageFiles.length > MAX_PHOTOS) {
    warnings.push(`最多支持 ${MAX_PHOTOS} 张图片，已自动保留前 ${MAX_PHOTOS} 张。`);
  }

  const assets: PhotoAsset[] = [];
  for (const [index, file] of selected.entries()) {
    try {
      assets.push(await buildPhotoAsset(file, index));
    } catch {
      warnings.push(`图片 ${file.name} 处理失败，已跳过。`);
    }
  }

  return { assets, warnings };
}

async function buildPhotoAsset(file: File, index: number): Promise<PhotoAsset> {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const previewUrl = drawScaled(bitmap, PREVIEW_EDGE, "image/jpeg", 0.88);
  const blurredUrl = drawScaled(bitmap, 720, "image/jpeg", 0.78, 9);
  const displayUrl = drawScaled(bitmap, DISPLAY_EDGE, "image/jpeg", 0.92);
  bitmap.close();

  return {
    id: `${file.name}-${file.lastModified}-${index}`,
    name: file.name,
    width,
    height,
    previewUrl,
    blurredUrl,
    displayUrl,
  };
}

function drawScaled(
  bitmap: ImageBitmap,
  maxEdge: number,
  mimeType: string,
  quality: number,
  blur = 0,
): string {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });

  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  ctx.fillStyle = "#07070f";
  ctx.fillRect(0, 0, width, height);
  ctx.filter = blur > 0 ? `blur(${blur}px) saturate(1.15) brightness(0.92)` : "none";

  const overscan = blur > 0 ? Math.ceil(blur * 2) : 0;
  ctx.drawImage(bitmap, -overscan, -overscan, width + overscan * 2, height + overscan * 2);
  return canvas.toDataURL(mimeType, quality);
}
