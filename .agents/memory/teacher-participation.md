---
name: Teacher participation in recognition & rankings
description: How non-students take part in face recognition, bulk attendance, and rankings — the student_profiles row is the universal participation key.
---

# Training-profile row is the participation key

A user takes part in face recognition, bulk attendance, and rankings **only if they have a `student_profiles` row** (with `faceDescriptor` + modality flags). The `users.role` value is NOT what gates these flows — the profile row is.

- `recognize-team` and `attendance/bulk` are intentionally role-agnostic: they key off `student_profiles` (descriptor + modalities), so any user with a profile row is matchable and markable.
- Rankings DO filter by role: `role IN ('student','teacher')` (admin excluded), joined to `student_profiles` on modality flags.

# Teachers participate by being given a profile row

To let teachers be recognized and ranked, they need a `student_profiles` row. Two paths keep this consistent:
1. Setting a profile photo (`POST /face/profile-photo`) auto-creates a row when missing, **only for `student`/`teacher`** (admins are guarded out so they don't accidentally become attendance participants). New rows default `modalityThai=true, modalityJiu=true`.
2. Existing teachers were backfilled with both-modality profile rows.

**Why both modalities default true:** the academy runs only Muay Thai + Jiu-Jitsu and mestres typically cover both mats; "participate in the ranking" means appear in both tabs by default. A per-teacher modality toggle was intentionally NOT built — refine only if a specific mestre asks.

**Consequences to remember:**
- Teachers with no attendance show at 0% at the bottom of rankings — expected, not a bug.
- Because bulk attendance marks every modality on a matched profile, a teacher (both modalities) recognized in a single-modality team photo is marked in both — same pre-existing behavior as students who train both.
- Admin excluded from rankings by design; if an admin is also a training mestre, that's a future refinement.
