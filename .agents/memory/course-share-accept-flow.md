---
name: Course share accept flow
description: How admin-to-user course sharing works end-to-end, including snapshot embedding, data copy, permission enforcement, and the sharedCourses metadata collection.
---

## The rule
When an admin shares a course, the full course data is embedded in the shareRequest document at send-time. When the user accepts, the data is copied to their own Firestore collections and sharedCourses metadata is written for permission tracking.

**Why:** Cross-user Firestore reads are blocked by default security rules. Embedding the snapshot in the shareRequest (which both sender and recipient can read per existing rules) avoids needing new Firestore security rules.

## How to apply

### Send time (`sendShare` in AdminContext.tsx)
- Reads `users/{adminUid}/studyData/{courseId}` (subjects tree without note HTML)
- Reads `users/{adminUid}/courseNotes/{courseId}` — handles both chunked and non-chunked formats
- Stores as `courseSnapshot: { studyData, notesJson }` in the shareRequest document
- Best-effort: if reading fails, the share still goes through (without snapshot)

### Accept time (`acceptShare` in AdminContext.tsx)
- Reads `share.courseSnapshot` (already in state via onSnapshot)
- Creates course entry at `users/{uid}/courses/{shareId}` — shareId used as courseId for uniqueness
- Writes `users/{uid}/studyData/{shareId}` with `hasNotesDoc: true` so StudyContext loads notes
- Writes `users/{uid}/courseNotes/{shareId}` with the merged notes map
- Writes `users/{uid}/sharedCourses/{shareId}` with permissions + expiry metadata
- After Firestore writes, NotificationBell triggers `window.location.reload()` to refresh CourseContext

### Permissions (runtime enforcement)
- CourseContext loads `users/{uid}/sharedCourses` with real-time onSnapshot → `sharedCoursesMeta: Record<courseId, SharedCourseMeta>`
- `Subjects.tsx` reads `sharedCoursesMeta[activeCourseId]` → `activeSharedMeta`
- `NoteEditorModal` receives: `editAllowed`, `downloadAllowed`, `copyAllowed` from permissions
- `saveNote` in Subjects.tsx also guards against `editNotes=false` as belt-and-suspenders

### UI indicator
- Subjects page header shows "🔗 Shared · AdminName" subtitle when active course is a shared one

## Known limitation
The combined studyData + notesJson payload in the shareRequest must be under Firestore's 1MB document limit. Very large courses with many long notes (chunked notesDocs) may exceed this. If `addDoc` fails, the admin sees an error from Firebase. Future improvement: chunk the snapshot across a subcollection.
