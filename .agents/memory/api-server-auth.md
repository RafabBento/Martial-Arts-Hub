---
name: API server auth model
description: How authentication/authorization is enforced in artifacts/api-server (there is no middleware).
---

The Express api-server has **no auth middleware**. There is no `requireAuth`/`requireRole`
guard mounted on the router. Each route handler that needs auth must manually:

1. Read the session user id: `(req.session as unknown as Record<string, unknown>).userId as number | undefined`
2. Look up the role from `usersTable` (roles: `student` | `teacher` | `admin`)
3. Return 401 if not authenticated, 403 if the role/ownership check fails.

**Why:** A new route is completely unprotected unless it replicates this pattern. The
server-side face endpoints (`/face/profile-photo`, `/face/recognize-team`) and
`/attendance/bulk` were initially shipped with NO authz, allowing IDOR-style overwrites
and recognition by any caller. They were retrofitted with manual session+role checks.

**How to apply:** When adding any route that mutates data or exposes sensitive data,
derive identity from the session — never trust a client-supplied `userId`/`teacherId` in
the body. For "act on a user" routes, allow self OR teacher/admin; for master-only
actions (team recognition, bulk attendance), require `teacher`/`admin`. For bulk
attendance, the session user is used as the session owner (`teacherId`), ignoring the
client-sent value. Bulk attendance also derives each student's modalities from
`student_profiles` server-side and ignores the client-sent `modalities` array —
attendance must follow registration, not the request payload.
