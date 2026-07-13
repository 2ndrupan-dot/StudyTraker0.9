---
name: StudyTrack granular overall-progress metric
description: How "Overall Progress" percentages are computed across the study tree, and why.
---

`computeGranularProgress(subjects)` in `timeEngine.ts` is the single source of truth for
any "Overall Progress" percentage (Progress page big card, per-subject breakdown, Today
page details panel). It counts every node at every level (subject, chapter, topic,
subtopic, concept, point) as one equally-weighted unit and averages their `completed`
flags — it does NOT weight by depth or leaf-only completion.

**Why:** earlier implementations only counted chapters (`completedChapters/totalChapters`)
or only counted the deepest leaf in each chain (`totalLeaves`/`completedLeaves`), so
students got 0% visible progress until an entire branch was fully finished. The product
goal is motivational: ticking any single "overview complete" checkbox anywhere in the
tree should nudge the percentage up immediately.

**How to apply:** any new "overall progress" or "subject progress" surface should call
`computeGranularProgress(subjects)` (or `computeGranularProgress([oneSubject])` for a
per-subject figure) rather than inventing a new ad-hoc ratio.
