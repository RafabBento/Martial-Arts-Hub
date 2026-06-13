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

/**
 * Detect every face in an image buffer and return one 128-float descriptor per
 * face. Used for the mestre's whole-team post-training photo.
 */
export async function detectAllDescriptors(buffer: Buffer): Promise<number[][]> {
  await ensureModels();
  const img = await loadImage(buffer);
  const detections = await faceapi
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .detectAllFaces(img as any, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return detections.map((d) => Array.from(d.descriptor));
}

/**
 * Detect the single most prominent face in an image buffer and return its
 * 128-float descriptor, or null if no face is found. Used when a user sets
 * their profile photo (the reference face).
 */
export async function detectSingleDescriptor(buffer: Buffer): Promise<number[] | null> {
  await ensureModels();
  const img = await loadImage(buffer);
  const detection = await faceapi
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .detectSingleFace(img as any, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) return null;
  return Array.from(detection.descriptor);
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
