---
name: Global Firestore save status
description: Project convention for showing save progress and retaining failures across all user-facing data mutations.
---

Route user-facing Firestore mutations through the shared tracked-write layer rather than importing write methods directly from the Firebase SDK. This keeps syncing, saved, and failure feedback consistent across screens.

**Why:** Users asked for one project-wide save indicator, and a direct SDK write bypasses its progress and error reporting.

**How to apply:** When adding or moving a Firestore mutation, use the shared wrappers for document writes and batch commits. Keep failures visible until the user dismisses them; do not add timeout-based clearing.

The user confirmed this project-wide behavior: one corner indicator should cover edits and additions across Notes, Tests, and the rest of the app, with persistent, expandable failure reasons and an explicit close button.

**Why:** The user asked for broad, consistent save feedback and confirmed the implementation direction.

**How to apply:** Preserve the shared indicator and the explicit-dismissal behavior when extending save flows.

For an active failure, Retry hides that failure while the operation is pending. Success uses the normal short-lived Saved state; another failure restores the red error details. A retry targeting a document should use the latest action for that document, and generated document IDs must stay fixed across retries.

**Why:** The user explicitly requested this retry lifecycle; reusing the latest payload avoids overwriting newer edits, and a fixed ID avoids duplicate documents.

**How to apply:** Keep retries idempotent, replay batches as fresh batches, and return a failed retry to the same persistent error state.
