---
name: StudyTrack fast-close recovery
description: Durability rules for user edits when a tab closes before Firestore acknowledges the write.
---

Every user-triggered save that can be interrupted by a tab close must persist its local draft and unsynced marker synchronously in the click/action handler, before debounce or network work. Set the pending snapshot at the same time so an unload handler cannot overwrite it with stale state. Treat `beforeunload` and `pagehide` as backup paths, not the only durability mechanism. Keep a queued unload snapshot only until the matching Firestore save succeeds; an older acknowledgement must not clear a newer edit's marker.

**Why:** React passive effects and network acknowledgements can be cut off by a fast tab close. An unload handler can also re-mark already-saved data if it retains a stale pending snapshot.

**How to apply:** Persist the course snapshot in the user action and again in the commit/layout phase before scheduling Firestore work, use the current user/course context for unload handling, and clear the pending snapshot only when the acknowledged write matches it. Item-specific stores such as test decks and A4 pages must likewise write their local copy before awaiting Firestore.
