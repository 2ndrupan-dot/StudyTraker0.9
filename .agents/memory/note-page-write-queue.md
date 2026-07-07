---
name: Note page write queue
description: saveNotePage uses a deduplicated serial write queue and tombstone set to prevent Firestore race conditions for large notes.
---

## Rule
`saveNotePage` in `StudyContext.tsx` uses two refs:
1. `noteWriteQueueRef` — serial Promise chain: all Firestore notePages writes execute one at a time
2. `noteWritePendingRef` — Map<pageId, NotePage>: deduplication of rapid autosaves; if a write is already queued for a page, subsequent calls just update the pending data instead of adding more queue entries

`deleteNotePage` marks the page in `deletedNotePageIds` (tombstone Set) before enqueuing the delete, so any queued save for that page is skipped.

**Why:** Two problems were found:
1. Large notes (~900 words) that are actively edited trigger autosave every 600ms, accumulating many Firestore writes in the queue — the dedup map collapses these to one write per "burst"
2. Multiple notes saved concurrently caused race conditions — the serial queue prevents this
3. Delete-then-save race: deleting a note while a save is queued could resurrect the document — the tombstone set prevents this

**How to apply:** Any new notePages write must go through `noteWriteQueueRef`. Check `deletedNotePageIds` at the start of each queued write.
