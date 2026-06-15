---
name: API server auth model
description: How authentication/authorization is enforced in artifacts/api-server (there is no middleware).
---

The Express api-server has a global `bearerAuth` middleware (`src/middlewares/bearerAuth.ts`),
but it is **populate-only, not a guard**: it sets `req.session.userId` when a valid session
cookie or Bearer token is present and otherwise just calls `next()` — it never returns 401.
There is no `requireAuth`/`requireRole` guard. So every route handler that needs auth must
still manually:

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

Object storage routes are part of this same no-middleware model: the presigned
upload-URL issuer (`/storage/uploads/request-url`) and the private object server
(`/storage/objects/*`) must each check `session.userId` themselves, or any caller
can upload to / read from the bucket. Uploads are restricted to image content
types under a size cap. `/storage/public-objects/*` stays intentionally open.

**Per-object ACL model (avatars are shared; team photos are private).** Beyond the
session gate, `/storage/objects/*` enforces the object's ACL policy (`lib/objectAcl.ts`,
stored as `custom:aclPolicy` metadata): profile photos get `visibility:"public"`
(readable by ANY authenticated user — required for rankings/lists/dashboard), team
photos get `visibility:"private"` owner=uploading-mestre (never re-shown to others).
Policies are set at assignment time in `/face/profile-photo` and `/face/recognize-team`.
Those endpoints also IDOR-guard the client-supplied `objectPath`: an object already
owned by a different user is rejected (fresh uploads have no policy → allowed).
**Why:** the product intentionally shows avatars across accounts, so blanket
owner-only ACLs are WRONG — only team photos are truly private. **How to apply:**
when adding a route that consumes a client `objectPath`, verify ownership before
processing and set an ACL policy after. Objects with NO policy fall back to
authenticated-read (legacy avatars predating ACLs; team photos always get a policy).

**Mobile private images need the Bearer token, NOT cookies.** The native app
authenticates with a Bearer token (AsyncStorage → `setAuthTokenGetter`), and sends
NO session cookie. A plain `<Image source={{ uri }}>` therefore gets 401 from the
cookie/session-gated `/storage/objects/*`. Fix: mobile renders remote private
images via `components/AuthImage.tsx`, which attaches `headers: { Authorization:
Bearer <token> }` to the Image source so `bearerAuth` can populate `session.userId`.
Do not assume `<Image>` shares a cookie jar with the API client — it does not.
