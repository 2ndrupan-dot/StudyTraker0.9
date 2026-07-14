---
name: StudyTrack notes-empty-write guard was blocking real deletes
description: The safety net that skips writing empty courseNotes over existing non-empty ones was firing on every save, not just the first one after load, silently reverting intentional note clears/deletes on refresh.
---

## Symptom
Clearing a note's content, or deleting the last remaining note among several (temp notes, per-item rich-text notes, etc.), would show "saved"/"deleted" in the UI, but the old content reappeared after a page refresh. With several notes, deleting down to the last one behaved the same way — looked like it failed.

## Root cause
`flushSave` in `StudyContext.tsx` has a guard: if the in-memory notes payload is empty (no `overallNote`, no per-item note content) but Firestore's `courseNotes/{courseId}` doc already has content, it skips writing `courseNotes` (to protect against historical bugs — flawed migration / stale local cache winning a freshness comparison — that produced a spurious empty state and wiped real notes). The guard originally ran on *every* flush, not just the risky first one, so it also blocked genuine intentional "delete everything" actions by the user.

**Why:** an empty notes payload is genuinely ambiguous — it could be a stale/bugged state (right after load) or a real user delete (mid-session) — and the guard couldn't tell them apart.

**How to apply:** `notesGuardArmedRef` (a ref, re-armed on every course/user change in the reset effect) makes the guard fire only on the *first* `flushSave` of a course session. Every later flush disarms it (`notesGuardArmedRef.current = false`, set unconditionally right after the guard check) and is trusted at face value — if the user emptied their notes mid-session, that's real intent, not a load-time artifact. Do not remove the arm/disarm mechanism or the guard will either resume blocking real deletes (always armed) or lose its original crash protection (never armed).
