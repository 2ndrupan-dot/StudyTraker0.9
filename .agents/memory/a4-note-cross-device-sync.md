---
name: A4 note cross-device sync
description: Consistency rules for independently stored A4 note-page documents.
---

## Rule
A4 note content stored outside the course index must be watched through a live parent-document snapshot. If the page is chunked, re-read the chunks after that snapshot and discard results from older snapshot callbacks. A local Saved indicator should wait for the queued Firestore write rather than only confirming localStorage or queue insertion.

**Why:** The index and page body have different persistence paths. An editor that only performs an initial document read can leave another device stale, while an optimistic Saved label hides queue latency.

**How to apply:** Preserve local edits when the snapshot has identical content, apply newer remote content without re-autosaving it, and use the same ordering/tombstone rules for deletes.