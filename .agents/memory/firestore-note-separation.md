---
name: Firestore 1MB note separation
description: Rich-text note content is saved to a separate courseNotes/{courseId} document to prevent the main studyData document from exceeding Firestore's 1MB limit. Large note pages (>800KB) are offloaded to Firebase Storage.
---

## Rule
The main Firestore document `users/{uid}/studyData/{courseId}` must NOT contain `note` fields from subjects/chapters/topics/etc. or `overallNote`. These are stored in a companion document `users/{uid}/courseNotes/{courseId}` as a flat map keyed by item id (`s:{id}`, `c:{id}`, `t:{id}`, `st:{id}`, `con:{id}`, `pt:{id}`, `tn:{id}`). The main doc has `hasNotesDoc: true` when the companion exists.

**Why:** Tiptap HTML wraps every text run in `<span style="font-size:14px;">`, inflating 900-word notes to >100KB. Multiple notes easily exceed Firestore's 1MB document limit, causing silent `invalid-argument` failures where the save appears to succeed locally (localStorage) but never reaches Firestore.

**How to apply:**
- `extractNotes(subjects, tempNotes)` → strips notes and returns flat map
- `mergeNotes(subjects, tempNotes, notes)` → restores notes from flat map
- `flushSave()` calls extractNotes, writes both docs concurrently via Promise.all
- `onSnapshot` callback: calls `withNotesDoc(fsData)` after getting main doc snapshot
- localStorage still stores the FULL payload including notes (no size limit)
- Backward compat: old documents without `hasNotesDoc` flag are used as-is (notes already embedded)

## Large NotePage routing (notePages collection)
Individual note pages (`users/{uid}/notePages/{pageId}`) also have the 1MB limit. Fix: in `saveNotePage`, before writing to Firestore, `JSON.stringify(data).length` is checked against `FIRESTORE_NOTE_LIMIT = 800_000`. If over limit:
- Elements array is uploaded to Firebase Storage as `users/{uid}/notePages/{pageId}.json`
- Firestore doc stores `elementsUrl` (the Storage download URL) and `elements: []`
- `loadNotePage` checks for `elementsUrl` and fetches from Storage if present
- `NotePage` type has `elementsUrl?: string` field to support this

**Why:** Bengali text + canvas element metadata can exceed 800KB, especially when images are stored as Base64 data URLs. With `memoryLocalCache` (no IndexedDB), failures are now visible as "Failed" status — the Storage offload prevents the error.
