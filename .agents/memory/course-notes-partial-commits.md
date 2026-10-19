---
name: Course-notes partial commits
description: Recovery behavior when the courseNotes companion write succeeds but the studyData marker write does not.
---

Course saves write the complete `courseNotes/{courseId}` snapshot before updating `studyData/{courseId}` with `hasNotesDoc`. If the app closes or the second write fails, the newer notes snapshot can exist while the older main document still says notes are embedded. When loading an unmarked main document, accept the companion only when its `savedAt` is at least as recent as the main document; use it as a complete snapshot so removed notes do not return from stale embedded fields. Ignore an older companion to preserve legacy inline notes.

**Why:** trusting `hasNotesDoc` alone hid successfully committed notes after an interrupted two-document save, while blindly trusting any sidecar could replace valid legacy notes with stale data.

**How to apply:** preserve this freshness check whenever changing course-note write order or load/migration behavior.
