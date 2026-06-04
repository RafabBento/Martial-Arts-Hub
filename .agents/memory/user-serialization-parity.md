---
name: User serialization grade-field parity
description: serializeUser in the API must include every grade field the OpenAPI User schema declares
---

The two `serializeUser` helpers (api-server `routes/auth.ts` and `routes/users.ts`) hand-build the User response object field-by-field. They are easy to drift from the OpenAPI `User` schema.

**Rule:** when adding/displaying a user grade field, verify BOTH serializeUser helpers emit it, not just the DB column + schema.

**Why:** `jiuDegree` was declared in the OpenAPI User schema and stored in DB, but both serializeUser helpers omitted it. Result: teacher/admin `user.jiuDegree` was always undefined, so master-view belt degree stripes never rendered even though the UI supported them.

**How to apply:** grep `serializeUser` across `artifacts/api-server/src/routes/` and confirm parity with the `User` schema in `lib/api-spec/openapi.yaml` after any user-field change. The PATCH /users/:id route spreads the validated body generically, so updates work even when serialization lags — the bug only shows on read.
