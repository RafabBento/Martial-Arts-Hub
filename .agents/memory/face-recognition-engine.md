---
name: Server face recognition engine
description: How artifacts/api-server detects/matches faces for team-photo attendance, and why it is multi-pass.
---

Face recognition is 100% server-side (`artifacts/api-server/src/lib/face.ts`, used by
`routes/face.ts`). It runs `@vladmandic/face-api` on the WASM tfjs backend with SSD
MobileNet v1 + landmark68 + recognition nets loaded once at startup.

## Detection strategy (the durable part)
`detectAllDescriptors()` does NOT do a single pass. For high recall on whole-team group
photos (where some faces are small/far) it runs:
1. one capped full-frame pass (downscaled to `FACE_MAX_DIM` if bigger), then
2. an overlapping NxN tiled pass (`FACE_TILE_GRID`), each tile upscaled so small faces
   gain pixels, then
3. **spatial + descriptor dedupe**: two detections collapse only when their boxes
   overlap (IoU ≥ `FACE_DEDUP_IOU`) AND descriptors are within `FACE_DEDUP_DISTANCE`.

**Why both gates:** descriptor-only dedupe can merge two genuinely different people with
similar embeddings; requiring spatial overlap means we only collapse the *same* face seen
across overlapping passes. Detection boxes are mapped back to original-image coordinates
(offset + box/scale) before comparing.

**Why clamp every env knob:** worst-case detector passes = `1 + FACE_TILE_GRID^2`, and each
pass is full detect+landmarks+descriptor on the WASM backend. Unbounded `FACE_TILE_GRID`
or `FACE_MAX_DIM` would spike latency/CPU, so all params are range-clamped in `envNum()`.

## Matching
`routes/face.ts` matches each detected descriptor to the nearest enrolled student by
euclidean distance; a match requires distance ≤ `FACE_MATCH_THRESHOLD` (default 0.5,
strict to avoid false positives). Matched students dedupe by userId (best distance wins);
unmatched = detected faces with no student within threshold. The mestre reviews/removes
matches before bulk-marking, so slightly favoring recall is acceptable.

## How to apply
- Tune via env, not code: `FACE_MIN_CONFIDENCE` (0.3), `FACE_MAX_DIM` (1600),
  `FACE_TILE_GRID` (2), `FACE_TILE_OVERLAP` (0.18), `FACE_MAX_TILE_UPSCALE` (2),
  `FACE_DEDUP_DISTANCE` (0.4), `FACE_DEDUP_IOU` (0.3), `FACE_MATCH_THRESHOLD` (0.5).
- `detectSingleDescriptor()` (profile enrollment) retries upscaled when the first pass
  finds nothing, so low-res selfies still enroll.
- A bigger future accuracy win would be multiple reference descriptors per student
  (averaged), which needs a schema + re-enrollment change — not yet done.
