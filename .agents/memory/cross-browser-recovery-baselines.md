---
name: Cross-browser recovery baselines
description: How StudyTrack decides whether a local recovery item is still unsaved after another browser changes the same item.
---

Keep the cloud state captured when a local edit first becomes unsynced. If another browser later changes that same note or card, treat the cloud version as resolved and remove the stale local recovery item. Preserve recovery for unrelated local edits.

**Why:** A closed or backgrounded browser cannot observe the other browser's write as it happens. Comparing only its stale local copy with the latest cloud copy cannot tell whether the cloud item is still old or has since been saved, and client timestamps are unreliable across devices.

**How to apply:** Persist a compact baseline across reloads, compare by stable item identity and content, and never use cross-device client-clock ordering to decide whether recovery is needed.
