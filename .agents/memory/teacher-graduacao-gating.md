---
name: Teacher/admin self-graduação gating on Profile
description: Why the profile graduação card + grade editors for teacher/admin are NOT gated by modality flags
---

# Teacher/admin graduação is ungated from modality

On the Profile screen (web `artifacts/academia/src/pages/Profile.tsx` and mobile
`artifacts/academia-mobile/app/(tabs)/profile.tsx`), the "Minha Graduação" card and its
grade editors (prajied + faixa) render for `isTeacherOrAdmin` **unconditionally** — they do
NOT depend on `modalityThai`/`modalityJiu`. Students keep modality-based gating.

**Why:** Teacher/admin/mestre accounts never have the modality flags set in the DB (they're
null for every teacher/admin), so gating the card on modality made it impossible for a mestre
to ever see or set their own prajied/faixa. Instructors are graduated in both arts, so both
boxes always show for them.

**How to apply:** Do not re-introduce a `user.modalityThai && ...` guard around the teacher/admin
graduação display or editors. Grade source differs by role: teacher/admin read grades from the
user object (usersTable, served via serializeUser); students read from studentData
(studentProfilesTable via useGetStudent). Saving goes through PATCH /users/:id (UserUpdate
schema accepts all grade fields, no clamping).
