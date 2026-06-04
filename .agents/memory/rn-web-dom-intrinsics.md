---
name: react-native-web DOM intrinsics
description: How to use raw DOM elements (video/canvas/input/img) inside Expo screens for web-only features
---

# Raw DOM elements in Expo (react-native-web) screens

For web-only features (facial recognition camera, gallery file upload) inside Expo
screens, render lowercase JSX DOM tags (`<video>`, `<canvas>`, `<input>`, `<img>`)
gated behind `Platform.OS === "web"`. They render natively under react-native-web.

**Why:** These features need the browser DOM (getUserMedia, file inputs, face-api.js
on `<video>`/canvas). React Native primitives can't host them. The mobile Attendance
tab mirrors the web Attendance page this way; `app/student/[id].tsx` was the first to
do it for gallery upload.

**How to apply:**
- Gate all camera/gallery/face UI behind an `isWeb` flag; show a manual-only fallback
  + hint banner on native.
- Use DOM **style objects** (e.g. `{ width: "100%", objectFit: "cover" }`) for these
  elements, not RN StyleSheet entries.
- Do **NOT** add `@ts-expect-error` above these tags — this RN/Expo TS setup already
  types DOM intrinsics, so the directive becomes an unused-directive error (TS2578).
- Refs: type them as the DOM element (e.g. `useRef<HTMLVideoElement>(null)`).
- Direct `fetch` to the API uses `credentials: "include"` and a base URL helper:
  `process.env.EXPO_PUBLIC_DOMAIN ? https://${EXPO_PUBLIC_DOMAIN} : ""`.

## Continuous face-scan flow parity (camera mode)
After a face match is confirmed in camera mode, resume the scan loop: clear matches,
reset scan status to idle, and restart the continuous-scan interval. Otherwise the
operator must manually restart scanning after every check-in, breaking the web's
continuous workflow. Verify with `pnpm --filter @workspace/academia-mobile run typecheck`.
