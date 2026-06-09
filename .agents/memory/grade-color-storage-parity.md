---
name: Grade color storage parity (web vs mobile)
description: Thai/Jiu belt grade colors are stored inconsistently across platforms; any UI rendering a grade color must resolve both formats.
---

# Grade color storage inconsistency

`thaiGradeColor` / `jiuGradeColor` in the DB can be EITHER a CSS color **name**
(`white`, `red`, `blue`, ...) or a **hex** string (`#dc2626`), depending on which
client wrote it:

- **Web** grade pickers save color **names** (their `PRAJIED_GRADES`/`JIU_COLORS`
  `primary` values are names).
- **Mobile** grade pickers save **hex** (their `PRAJIED_GRADES`/`JIU_COLORS`
  `primary` values are hex).

**Why:** the two platforms maintain separate grade-table constants that were never
unified, so the same field holds two formats.

**How to apply:** any component that renders a grade color must normalize both —
treat values starting with `#` as hex, otherwise lowercase+trim and look up a
color-name→hex map, then fall back to a grade-label→hex map, then a neutral gray.
See `StudentCard.tsx` `resolveHex` for the canonical resolver.

# Student-card badge parity rule

Web `Students.tsx` shows a belt badge whenever `thaiGrade`/`jiuGrade` is truthy —
it does NOT gate on the modality flags. Mobile `StudentCard` must match: render the
Thai/Jiu badge based on grade presence alone, not on `modalityThai`/`modalityJiu`.
