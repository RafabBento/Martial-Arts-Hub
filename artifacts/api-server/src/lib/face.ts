import path from "node:path";
import { createRequire } from "node:module";
import * as tf from "@tensorflow/tfjs";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
// The node-wasm build runs face-api on the WASM backend (pure-JS friendly,
// no native tfjs-node binary required).
import * as faceapi from "@vladmandic/face-api/dist/face-api.node-wasm.js";
import { Canvas, Image, ImageData, createCanvas, loadImage } from "@napi-rs/canvas";

const require = createRequire(import.meta.url);

// face-api was written for the browser; in Node we patch its environment with
// the @napi-rs/canvas implementations. createCanvasElement/createImageElement
// are overridden because @napi-rs/canvas's Canvas constructor requires explicit
// dimensions, unlike the browser's `new Canvas()`.
faceapi.env.monkeyPatch({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Canvas: Canvas as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Image: Image as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ImageData: ImageData as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createCanvasElement: () => createCanvas(1, 1) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createImageElement: () => new Image() as any,
});

const MODEL_DIR =
  process.env["FACE_MODEL_DIR"] ?? path.resolve(__dirname, "../models");

// ---------------------------------------------------------------------------
// Tunable detection parameters (env-overridable, clamped to safe ranges).
// Defaults are tuned for high recall on whole-team group photos where some
// faces are small/far, while keeping matching strict to avoid false positives.
// ---------------------------------------------------------------------------
function envNum(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Lower confidence finds more (incl. small/blurry) faces; false detections are
// filtered later by the strict descriptor match threshold.
const MIN_CONFIDENCE = envNum("FACE_MIN_CONFIDENCE", 0.3, 0.05, 0.9);
// Longest side (px) each detection pass is run at. Big phone photos are capped
// for the full-frame pass; tiles are upscaled toward this so small faces gain
// pixels.
const MAX_DIM = envNum("FACE_MAX_DIM", 1600, 320, 4096);
// NxN overlapping tiles for the multi-scale pass. 0/1 disables tiling. Clamped
// to keep the worst case (1 + GRID^2 detector passes) bounded on the WASM
// backend.
const TILE_GRID = Math.round(envNum("FACE_TILE_GRID", 2, 0, 4));
const TILE_OVERLAP = envNum("FACE_TILE_OVERLAP", 0.18, 0, 0.45);
// Max upscale applied to a tile (avoids huge canvases from tiny crops).
const MAX_TILE_UPSCALE = envNum("FACE_MAX_TILE_UPSCALE", 2, 1, 4);
// Two detections are treated as the same physical face — and collapsed — only
// when their boxes overlap (same region seen across overlapping passes) AND
// their descriptors are close. Requiring spatial overlap prevents merging two
// genuinely different people who happen to have similar embeddings.
const DEDUP_DISTANCE = envNum("FACE_DEDUP_DISTANCE", 0.4, 0.1, 0.6);
const DEDUP_IOU = envNum("FACE_DEDUP_IOU", 0.3, 0.1, 0.9);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetectedFace {
  descriptor: number[];
  box: Box; // in global (original-image) pixel coordinates
}

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

async function ensureModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const wasmDir =
      path.dirname(
        require.resolve("@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm"),
      ) + path.sep;
    setWasmPaths(wasmDir);
    await tf.setBackend("wasm");
    await tf.ready();
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
    modelsLoaded = true;
  })();
  return loadingPromise;
}

function options(): faceapi.SsdMobilenetv1Options {
  return new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE, maxResults: 200 });
}

/**
 * Draw a (possibly scaled) region of the source image onto a fresh canvas.
 * Scaling up gives small/distant faces more pixels to detect against.
 */
function regionCanvas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  img: any,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  scale: number,
): Canvas {
  const cw = Math.max(1, Math.round(sw * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  const canvas = createCanvas(cw, ch);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  return canvas;
}

/**
 * Run the detector on a region's canvas and map each detection's box back into
 * the original image's coordinate space so faces from different passes can be
 * spatially compared.
 */
async function detectRegion(
  canvas: Canvas,
  offsetX: number,
  offsetY: number,
  scale: number,
): Promise<DetectedFace[]> {
  const detections = await faceapi
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .detectAllFaces(canvas as any, options())
    .withFaceLandmarks()
    .withFaceDescriptors();
  return detections.map((d) => {
    const b = d.detection.box;
    return {
      descriptor: Array.from(d.descriptor),
      box: {
        x: offsetX + b.x / scale,
        y: offsetY + b.y / scale,
        width: b.width / scale,
        height: b.height / scale,
      },
    };
  });
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * Collapse detections that are the same physical face seen across overlapping
 * passes: require BOTH spatial overlap (IoU) and descriptor similarity so
 * distinct people are never merged.
 */
function dedupeFaces(all: DetectedFace[]): DetectedFace[] {
  const kept: DetectedFace[] = [];
  for (const face of all) {
    const dup = kept.some(
      (k) =>
        iou(face.box, k.box) >= DEDUP_IOU &&
        euclideanDistance(face.descriptor, k.descriptor) < DEDUP_DISTANCE,
    );
    if (!dup) kept.push(face);
  }
  return kept;
}

/**
 * Detect every face in an image buffer and return one 128-float descriptor per
 * distinct face. Used for the mestre's whole-team post-training photo.
 *
 * Strategy for high recall: one capped full-frame pass to catch large/near
 * faces, plus an overlapping tiled+upscaled pass to recover small/far faces,
 * then spatial+descriptor deduplication of faces seen in more than one pass so
 * detected/unmatched counts reflect real distinct people.
 */
export async function detectAllDescriptors(buffer: Buffer): Promise<number[][]> {
  await ensureModels();
  const img = await loadImage(buffer);
  const W = img.width;
  const H = img.height;

  const all: DetectedFace[] = [];

  // Full-frame pass (downscaled only if larger than MAX_DIM).
  const fullScale = Math.min(1, MAX_DIM / Math.max(W, H));
  all.push(...(await detectRegion(regionCanvas(img, 0, 0, W, H, fullScale), 0, 0, fullScale)));

  // Overlapping tiled pass — upscales each tile so small faces gain resolution.
  if (TILE_GRID >= 2) {
    const baseTileW = W / TILE_GRID;
    const baseTileH = H / TILE_GRID;
    for (let row = 0; row < TILE_GRID; row++) {
      for (let col = 0; col < TILE_GRID; col++) {
        const sx = Math.max(0, Math.floor(col * baseTileW - baseTileW * TILE_OVERLAP));
        const sy = Math.max(0, Math.floor(row * baseTileH - baseTileH * TILE_OVERLAP));
        const sw = Math.min(W - sx, Math.ceil(baseTileW * (1 + 2 * TILE_OVERLAP)));
        const sh = Math.min(H - sy, Math.ceil(baseTileH * (1 + 2 * TILE_OVERLAP)));
        if (sw < 2 || sh < 2) continue;
        const scale = Math.min(MAX_TILE_UPSCALE, Math.max(1, MAX_DIM / Math.max(sw, sh)));
        all.push(...(await detectRegion(regionCanvas(img, sx, sy, sw, sh, scale), sx, sy, scale)));
      }
    }
  }

  return dedupeFaces(all).map((f) => f.descriptor);
}

/**
 * Detect the single most prominent face in an image buffer and return its
 * 128-float descriptor, or null if no face is found. Used when a user sets
 * their profile photo (the reference face). Retries upscaled when the first
 * pass finds nothing, so lower-resolution selfies still enroll reliably.
 */
export async function detectSingleDescriptor(buffer: Buffer): Promise<number[] | null> {
  await ensureModels();
  const img = await loadImage(buffer);
  const W = img.width;
  const H = img.height;

  const scales = [Math.min(1, MAX_DIM / Math.max(W, H))];
  if (Math.max(W, H) < MAX_DIM) {
    scales.push(Math.min(MAX_TILE_UPSCALE, MAX_DIM / Math.max(W, H)));
  }

  for (const scale of scales) {
    const detection = await faceapi
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .detectSingleFace(regionCanvas(img, 0, 0, W, H, scale) as any, options())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (detection) return Array.from(detection.descriptor);
  }
  return null;
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
