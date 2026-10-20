---
name: Global Firestore save status
description: Project convention for showing save progress and retaining failures across all user-facing data mutations.
---

Route user-facing Firestore mutations through the shared tracked-write layer rather than importing write methods directly from the Firebase SDK. This keeps syncing, saved, and failure feedback consistent across screens.

**Why:** Users asked for one project-wide save indicator, and a direct SDK write bypasses its progress and error reporting.

**How to apply:** When adding or moving a Firestore mutation, use the shared wrappers for document writes and batch commits. Keep failures visible until the user dismisses them; do not add timeout-based clearing.
