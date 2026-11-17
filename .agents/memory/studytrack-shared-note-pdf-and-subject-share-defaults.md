---
name: StudyTrack shared-note PDF footer + partial-subject-share default
description: Two related "shared content looks/behaves wrong" bugs in StudyTrack's admin-share feature and their root causes.
---

## Shared single-note PDF footer showed only "Created by"
`NoteEditorModal`'s PDF export (`ui.tsx`) already branches correctly on `pdfIsShared`/`pdfIsAdmin` to show the full footer (WhatsApp/Website/Printed by), but the call site matters: whichever component renders `NoteEditorModal` must actually pass those `pdf*` props, or they silently default to undefined and the footer falls back to "Created by" only.

**Why:** `NotificationBell.tsx`'s `SharedNoteModal` (the viewer used when a recipient opens a single shared note from the notification bell) rendered `NoteEditorModal` without any `pdf*` props at all — a different call site than `Subjects.tsx`/`Today.tsx`, which do wire them up. Only the note-type share path was missing them.

**How to apply:** When adding/debugging PDF-footer or other `pdf*`-prop-driven behavior in `NoteEditorModal`, check *every* place that renders it — `Subjects.tsx`, `Today.tsx`, `NotificationBell.tsx`'s `SharedNoteModal`, and also `NotesIndex.tsx` (the /notes page) and `Progress.tsx`'s `NoteSearchModal`/`OverallNotesCard` — not just the primary editor page. Several of these hardcoded `pdfIsShared={false}` instead of deriving it from `sharedCoursesMeta[activeCourseId]` like `Subjects.tsx` does, so a shared course's own notes/overall-note/notes-index still printed the recipient's email instead of "StudyTrack team" in the PDF footer.

## Partial-subject course sharing "leaked" unselected subjects
The actual filtering code (`filterSubjectsByIds`/`collectAllIds`/`filterNotesMapByIds` in `src/lib/courseShare.ts`, applied in both `sendShare` and the `StudyContext` live-sync relay) is correct and scoped. The real bug was a UX default: the subject checkbox list in `AdminPanel.tsx`'s share wizard defaulted to **all subjects pre-checked** when a course was picked.

**Why:** An admin who wanted to share only 1-2 subjects would click just those, but since they were already checked by default, clicking did nothing — every other still-checked subject went out with the share too. The user perceived this as "the filter doesn't work."

**How to apply:** The subject picker now defaults to an **empty** selection (`setSelectedSubjectIds([])`) so nothing is shared until the admin explicitly checks it — "what's checked" always equals "what gets shared." If subject-level sharing regresses again, check this default first before suspecting the id-filtering helpers.
