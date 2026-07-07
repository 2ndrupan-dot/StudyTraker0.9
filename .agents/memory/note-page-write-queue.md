---
name: Note page write queue
description: saveNotePage uses a serial write queue and tombstone set to prevent Firestore race conditions for large notes.
---

## Rule
`saveNotePage` in `StudyContext.tsx` enqueues all Firestore writes through `noteWriteQueueRef` (a chained Promise) so writes are serialized. `deleteNotePage` marks the page ID in `deletedNotePageIds` before enqueuing the delete, so any queued save for that page is skipped.

**Why:** Large notes (800-900 words) caused silent sync failures when two notes were saved concurrently — the second write lost the Firestore race. Deleting the first note would free the queue and let the second sync, confirming the root cause.

**How to apply:** Any future write to `notePages/{id}` must be enqueued via `noteWriteQueueRef.current = noteWriteQueueRef.current.then(async () => { ... })`. Check `deletedNotePageIds.current.has(pageId)` at the start of each queued write.
