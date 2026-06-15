---
name: api-server e2e testing
description: How to write end-to-end tests for the api-server, especially the face-recognition attendance pipeline.
---

# api-server e2e testing

Vitest is set up in `artifacts/api-server` (`pnpm --filter @workspace/api-server run test`, which builds then `vitest run`).

## Run the real built server, don't import the app into vitest
The face stack (`@tensorflow/tfjs`, `@vladmandic/face-api`, `@napi-rs/canvas`) is heavy and the build externalizes those packages. The e2e suite spawns the **built** `dist/index.mjs` on a dedicated test port via vitest `globalSetup` and hits it over HTTP. Tests import only `@workspace/db` (for setup/assert/cleanup) — never the server source — so vitest never has to transform tfjs/face-api.
**Why:** importing the server graph into vitest pulls in native/wasm modules that don't transform cleanly; the spawned-server approach also exercises the production bundle.

## Auth without cookies
Tests authenticate with `Authorization: Bearer <token>`, where the token is exactly what `/api/auth/register` and `/api/auth/login` return. The `bearerAuth` middleware accepts it and populates the session, so no cookie jar is needed.

## Deterministic face matching in tests
Build the "team photo" by compositing the **same** profile portraits side-by-side (via `@napi-rs/canvas`). Because the group-photo pixels are identical to the stored profile descriptors, match distance is ~0 (well under the 0.5 threshold) and each face maps unambiguously to the right student — no flakiness.

## Real dependencies are available in dev
The Replit object-storage sidecar (`PRIVATE_OBJECT_DIR`) and `DATABASE_URL` are live in the dev container, so tests go through the real presigned-upload → objectPath → face-endpoint flow. Use unique emails per run and clean up afterward: delete `training_sessions` by `teacherId` first (no FK cascade on teacherId), then delete the users (cascades profiles + attendance).
