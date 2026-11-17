---
name: StudyTrack "first save of session" guards must never block, only warn
description: Blocking the first flushSave when it looks empty breaks a real user's very first action (open note, clear, save) after loading the app — the guard can't tell that apart from the stale-state bug it was meant to catch.
---

## Symptom
Open a subject/topic note that already has content, click Clear, click Save. The note badge disappears from the list (looks saved), but reloading the page brings the old note content right back — the clear never actually reached Firestore.

## Root cause
`StudyContext.tsx`'s `flushSave` had "first flush of the session" guards (`notesGuardArmedRef`, and later `subjectsGuardArmedRef`) that would silently **skip the Firestore write** if the incoming state looked empty on the very first flush after load, on the theory that an empty first-flush state was more likely a stale-cache/migration artifact than genuine intent.

**Why this was wrong:** `isInitialLoad` already prevents the load itself from ever triggering a save — so by the time any `flushSave` runs, it is always caused by a real, live, user-driven state change, never by the load/hydration itself. But a real user's very first action after opening a course is very commonly "open a note and clear it" — which produces exactly the same signature (empty payload, non-empty existing Firestore doc) the guard was watching for. Blocking on that signature blocks the user's real clear, forever re-triggered on every fresh page load since the guard re-arms per session.

**How to apply:** Any "looks empty on first save, might be a stale-state bug" heuristic in this codebase must be diagnostic-only (log and continue), never write-blocking — the class of underlying bugs it was guarding against (non-atomic writes, clock-skew savedAt comparisons, stale cache merges) has since been fixed at the source; don't reintroduce a heuristic block for it.
