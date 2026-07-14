---
name: StudyTrack share permissions must gate every NoteEditorModal call site
description: Admin-set per-share permissions (editNotes/downloadNotes/copyNotes) only take effect where a page explicitly wires them into NoteEditorModal and guards the save handler; missed call sites silently behave as unrestricted.
---

## The rule
`SharePermissions.editNotes/downloadNotes/copyNotes` are enforced per call site, not globally. Each page that renders `NoteEditorModal` must independently:
1. Look up `activeSharedMeta = activeCourseId ? sharedCoursesMeta[activeCourseId] : undefined`.
2. Pass `editAllowed={!activeSharedMeta || activeSharedMeta.permissions.editNotes}` (same pattern for `downloadAllowed`/`downloadNotes` and `copyAllowed`/`copyNotes`).
3. Guard the actual save/clear handler with `if (activeSharedMeta && !activeSharedMeta.permissions.editNotes) { close(); return; }` — the modal prop only hides UI, it doesn't stop a handler that's called directly.

**Why:** `Subjects.tsx` had this wired correctly from the start, but `NotesIndex.tsx` (the `/notes` page) and `Progress.tsx`'s `NoteSearchModal` (item-note viewer) and `OverallNotesCard` did not pass `editAllowed`/`downloadAllowed`/`copyAllowed` at all and didn't guard their save handlers — so a shared course's admin-set permissions were fully ignored in those three spots even though they worked in `Subjects.tsx`/`Today.tsx`.

**How to apply:** When permissions regress or "work in one place but not another" for shared courses, grep every `NoteEditorModal` render site (`Subjects.tsx`, `Today.tsx`, `NotesIndex.tsx`, `Progress.tsx` x2, `NotificationBell.tsx`'s `SharedNoteModal`) and diff which ones wire `editAllowed`/`downloadAllowed`/`copyAllowed` + a save-guard against which ones don't. Same class of bug as the PDF-footer `pdfIsShared` issue — see `studytrack-shared-note-pdf-and-subject-share-defaults.md`.
