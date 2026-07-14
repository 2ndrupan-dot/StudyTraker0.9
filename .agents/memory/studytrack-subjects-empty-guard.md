---
name: StudyTrack subjects-empty guard was blocking non-subject saves
description: A blanket "subjects.length === 0 -> skip save" guard blocked notePagesIndex/tempNotes/settings from ever persisting for courses with zero subjects, looking like deletes silently revert.
---

## Symptom
For a course that has no subjects (e.g. one used only for the standalone top-level "Notes" page), edits to notePagesIndex, tempNotes, settings, or overallNote appeared to save (optimistic local update) but reverted after reload — looked identical to the notes-empty-write-guard bug but for a different field.

## Root cause
Two separate places in `StudyContext.tsx` had an unconditional `if (subjects.length === 0) return;`:
1. The save-triggering `useEffect` (before the debounce timer is even set).
2. The top of `flushSave` itself.

Both ran on *every* save attempt, not just the risky first one after load — so any course that genuinely, permanently has zero subjects could never save ANY field to Firestore, not just subjects.

**Why:** The guard was meant to protect against a stale/buggy in-memory state wiping out real subjects data (same class of risk as the notes guard), but it conflated "protect the subjects field" with "block the entire payload."

**How to apply:** Use the same session-scoped arm/disarm pattern as `notesGuardArmedRef` (`subjectsGuardArmedRef`, re-armed in the course/user reset effect): only the first flush of a session checks Firestore for existing non-empty subjects and skips (only that flush, only if existing data is non-empty) — every later flush, and every other field, saves normally regardless of subjects being empty. Do not reintroduce a blanket subjects-length check outside this guard.
