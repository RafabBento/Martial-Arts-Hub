# Academia Fight Club

A full-stack management platform for a Muay Thai and Jiu-Jitsu academy. Handles student enrollment, training session management, post-training photo attendance with 100% server-side facial recognition, belt/grade tracking, and attendance rankings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/academia run dev` — run the frontend (port 18373)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React + Vite + Wouter + TanStack Query + Shadcn UI + Tailwind (web); Expo / React Native (mobile)
- **API**: Express 5
- **Face recognition**: `@vladmandic/face-api` runs **server-side** in the API server (Node canvas backend); model weights vendored locally in the api-server
- **Object storage**: App Storage (presigned upload URLs + serve endpoint) for profile photos and team photos
- **DB**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Where things live

- `artifacts/academia/` — React frontend (preview path `/`)
- `artifacts/api-server/` — Express API server (prefix `/api`)
- `lib/api-client-react/` — Generated hooks + types from OpenAPI spec
- `lib/api-zod/` — Generated Zod schemas from OpenAPI spec
- `lib/api-spec/openapi.yaml` — Source of truth API contract
- `lib/db/src/schema/` — Drizzle ORM table definitions

## Architecture decisions

- Contract-first: OpenAPI spec drives both server Zod validation and client React Query hooks via Orval codegen.
- **Facial recognition is 100% server-side.** No client-side face-api / CDN models. Flow: client uploads an image to object storage (presigned URL) → sends the object path to a face endpoint → the server downloads the bytes, detects faces, and computes/compares 128-float descriptors.
  - **Reference face = profile photo.** `POST /api/face/profile-photo` ({userId, objectPath}) sets `profilePhotoUrl` and computes + stores the student's face descriptor (returns `faceDetected` so the UI can warn when no face is found).
  - **Team attendance.** A mestre uploads ONE post-training group photo → `POST /api/face/recognize-team` ({objectPath}) detects every face, matches against stored descriptors, returns matches (with each student's trained modalities) + unmatched count → `POST /api/attendance/bulk` marks attendance in EVERY modality each matched student trains, finding/creating today's session per modality and deduping server-side.
- Express session auth with cookies (`credentials: include` already set in custom-fetch.ts).
- Role-based UI: teachers/admins see create/delete session buttons + team-photo attendance; students see only their own data on profile.

## Product

- **Dashboard**: Stats overview (total students, sessions, monthly attendance, modality distribution) + recent activity feed + quick actions.
- **Students**: Searchable/filterable grid with modality badges, grades, attendance counts. Click through to detailed profile.
- **Student Detail**: Belt/grade management (Thai grade/color, Jiu faixa/color), attendance history per modality, face descriptor status. Mestre can set/update a student's reference photo (camera/gallery → upload → `/api/face/profile-photo`).
- **Sessions**: List/create training sessions by modality (Muay Thai / Jiu-Jitsu) with teacher assignment.
- **Session Detail**: View attendees per session, remove individual attendance records.
- **Attendance** (mestre only): "Foto da equipe" mode — upload/capture one group photo → server recognizes all students → review list with per-student modality badges → bulk-mark attendance. Plus a "Manual" mode (session + student picker) fallback.
- **Rankings**: Attendance percentage leaderboard with filters for modality (Thai/Jiu/both) and period (week/month/year/all).
- **Profile**: View/edit personal info; set/change profile photo (= reference face) via web upload or mobile camera/gallery; students see their full attendance history.

## Seed Users

| Email                  | Password  | Role    |
|------------------------|-----------|---------|
| carlos@academia.com    | senha123  | teacher |
| ana@academia.com       | senha123  | teacher |
| admin@academia.com     | admin123  | admin   |
| rodrigo@academia.com   | senha123  | student |
| beatriz@academia.com   | senha123  | student |
| lucas@academia.com     | senha123  | student |
| (+ 4 more students)    | senha123  | student |

## User Preferences

- Language: Portuguese (pt-BR) for all UI text
- Dark mode mandatory; red primary color (hsl 0 84% 45%)

## Gotchas

- Face recognition runs server-side; model weights are vendored in the api-server and loaded once at startup (no per-client CDN download). First recognize call after a cold start can be slightly slower while models initialize.
- Clients never compute descriptors. Always upload the image to object storage first (presigned URL), then pass the returned object path to the face endpoint. Web uses `src/lib/uploadImage.ts`; mobile uses `lib/uploadImage.ts` + `lib/imageUrl.ts` (prefixes stored paths with `https://${EXPO_PUBLIC_DOMAIN}` for `<Image>`).
- The `ANY` SQL operator with Drizzle requires `inArray()` helper — do not use raw `sql` template with arrays.
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change before editing frontend pages.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
