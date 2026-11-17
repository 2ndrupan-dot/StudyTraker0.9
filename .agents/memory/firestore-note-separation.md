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

## The courseNotes companion doc itself can also outgrow 1MB
The flat map described above (all subject/chapter/topic/etc. notes for one course, combined into one `courseNotes/{courseId}` doc) is itself unbounded — as a user accumulates notes over months it can exceed Firestore's 1MB limit too, causing the exact same silent-looking "notes don't save" symptom (console shows `Firestore save failed... exceeds the maximum allowed size of 1,048,576 bytes` referencing the `courseNotes` doc).

**Why:** The original note-separation fix solved the *main* doc's size problem but didn't anticipate the companion doc growing unbounded on its own.

**How to apply:** Same Storage-offload pattern as notePages, applied one level up: before writing `courseNotes`, check the real byte size of `{overallNote, notes}` against `FIRESTORE_NOTE_LIMIT`; if over, upload the whole object to Storage at `users/{uid}/courseNotes/{courseId}.json` and write only `{savedAt, notesUrl}` (notes/overallNote left empty) to Firestore. Loader checks for `notesUrl` and fetches from Storage when present. If this problem resurfaces, check whether Storage upload itself is now failing (e.g. Storage security rules) rather than assuming the Firestore side is broken again.

## No Firebase Storage — this project stays on the free Spark plan
Oversized courseNotes/notePages content is NOT offloaded to Firebase Storage. Enabling Storage now requires upgrading to the paid Blaze plan (confirmed via a live `curl` to the storage REST endpoint returning 404 "Not Found" — the bucket doesn't exist on Spark), and the user explicitly declined to upgrade.

**Why:** Storage-based offload (uploadBytes/uploadString to `firebasestorage.googleapis.com`) silently fails end-to-end with what looks like a CORS error in the browser console, but the real cause is the bucket not existing on the free plan.

**Reserved-field-name pitfall:** don't store arbitrary user-provided keys (e.g. `__overall__`) as Firestore field/map-key names — Firestore rejects any field name at any nesting level matching `__.*__`. Store such keyed data as an **array of `{k, v}` pairs** instead of an object/map, since array entries aren't field names and have no naming restriction.

**How to apply:** Oversized `courseNotes` and `notePages` documents are instead split across a Firestore **"chunks" subcollection** (`courseNotes/{courseId}/chunks/{i}`, `notePages/{pageId}/chunks/{i}`), each chunk kept under `FIRESTORE_NOTE_LIMIT` bytes via greedy bin-packing (`packEntries`/`packElements` in StudyContext.tsx); a single oversized string value is itself split via `splitLargeValue`. The parent doc gets `{chunked: true, chunkCount}` instead of a Storage URL. If any future feature needs real file storage (e.g. image uploads in NoteEditor.tsx, which still use `firebase/storage` and are NOT yet fixed), it will hit this same Blaze-plan wall — surface that to the user before assuming Storage works.

## Critical: size checks MUST use real UTF-8 byte length, not JS string `.length`
Both this courseNotes check and the notePages check originally compared `JSON.stringify(data).length` (UTF-16 code units) against the byte-based `FIRESTORE_NOTE_LIMIT`. For Bengali (and other non-Latin scripts), each character is ~3 bytes in UTF-8 but only 1 UTF-16 code unit — so `.length` undercounts actual byte size by up to 3x. This let genuinely oversized documents slip past the "should we offload to Storage?" check, causing the exact `exceeds the maximum allowed size of 1,048,576 bytes` Firestore error the offload was supposed to prevent.

**Why:** Silent, hard-to-reproduce-in-English bug — anyone testing with ASCII text would never see the size check fail, only real Bengali-content users would.

**How to apply:** Always measure size with `new TextEncoder().encode(str).length` (real UTF-8 bytes), never `str.length`, before comparing against `FIRESTORE_NOTE_LIMIT` or Firestore's 1,048,576-byte hard limit. In `StudyContext.tsx` this is the `byteSize()` helper — reuse it for any future Firestore-size check in this file instead of writing a new `.length` comparison.
