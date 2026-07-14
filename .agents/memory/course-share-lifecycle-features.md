---
name: Course share countdown/trash/subject-level lifecycle
description: How live countdowns, auto-expiry, manual trash, and partial-subject sharing were designed for the Admin Panel share system.
---

- Automatic expiry (pendingExpiresAt / actualExpiresAt passing) is always a **hard delete** of the shareRequest doc — never routed through trash. Trash (`status: 'trashed'`, `trashedAt`, `trashedFromStatus`) is reserved exclusively for admin-initiated manual deletes from the Sent tab, so restore/permanent-delete only ever apply to those.
  **Why:** the user explicitly distinguished "auto-delete on expiry" from "manual delete → trash → restore/permanent-delete" as two different flows that must not be conflated.
- Expiry purge runs client-side and best-effort (`.catch(() => {})`) from *both* sides independently — the admin's sent-shares listener and the recipient's received-shares listener each delete their own expired, non-trashed docs. This matches the existing pattern in `CourseContext.tsx`'s deleted-course purge.
  **Why:** there's no Cloud Function / scheduled job in this project; purging only works when a relevant user's client is open, so both sides purge independently for reliability.
- Partial (subject-level) course sharing filters a flat notes map (keyed like `s:<id>`, `c:<id>`, etc.) down to selected subjects by collecting all node ids under the chosen subjects' full tree (chapters/topics/subtopics/concepts/points) and matching the id portion after the first colon — see `collectAllIds`/`filterNotesMapByIds` in `AdminContext.tsx`.
- "Add more subjects" to an active accepted share reuses the existing `courseSnapshot` + `syncedAt` content-sync channel instead of inventing new propagation — bumping `syncedAt` on the shareRequest doc is what the recipient's live-sync listener already watches for ordinary edits.
- The subject-filter helpers (`collectAllIds`/`filterSubjectsByIds`/`filterNotesMapByIds`) now live in `src/lib/courseShare.ts`, shared by both `AdminContext.tsx` (initial share snapshot) and `StudyContext.tsx` (the live-sync push on every subsequent admin save).
  **Why:** the live-sync push previously wrote the admin's *unfiltered* `mainPayload.subjects` straight into every accepted share's `courseSnapshot`, so a partial-subject share reverted to showing all subjects the moment the admin next edited the course — the filter must be re-applied per-share on every sync, not just at send time.
