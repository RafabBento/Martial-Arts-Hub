# Academia Fight Club

A full-stack management platform for a Muay Thai and Jiu-Jitsu academy. Handles student enrollment, training session management, post-training photo attendance with facial recognition, belt/grade tracking, and attendance rankings.

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
- **Frontend**: React + Vite + Wouter + TanStack Query + Shadcn UI + Tailwind + face-api.js
- **API**: Express 5
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
- face-api.js models loaded lazily from vladmandic CDN on the Attendance page; descriptors stored as JSON arrays in PostgreSQL.
- Express session auth with cookies (`credentials: include` already set in custom-fetch.ts).
- Role-based UI: teachers/admins see create/delete session buttons; students see only their own data on profile.

## Product

- **Dashboard**: Stats overview (total students, sessions, monthly attendance, modality distribution) + recent activity feed + quick actions.
- **Students**: Searchable/filterable grid with modality badges, grades, attendance counts. Click through to detailed profile.
- **Student Detail**: Belt/grade management (Thai grade/color, Jiu faixa/color), attendance history per modality, face descriptor status.
- **Sessions**: List/create training sessions by modality (Muay Thai / Jiu-Jitsu) with teacher assignment.
- **Session Detail**: View attendees per session, remove individual attendance records.
- **Attendance**: Facial recognition via webcam (face-api.js → /api/face/identify) or manual student picker. Shows live confirmed list.
- **Rankings**: Attendance percentage leaderboard with filters for modality (Thai/Jiu/both) and period (week/month/year/all).
- **Profile**: View/edit personal info; students see their full attendance history.

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

- face-api.js models download on first camera use (~50MB). Expect a delay on first load.
- The `ANY` SQL operator with Drizzle requires `inArray()` helper — do not use raw `sql` template with arrays.
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change before editing frontend pages.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
