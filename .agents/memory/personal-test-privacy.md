---
name: Personal test privacy
description: The boundary between shared Course Test cards and private Personal Test cards.
---

Personal Test cards must remain private to the current user, even when they are stored under an active course. Course Test cards are the only test data included in course shares, admin live-sync relays, or accepted shared-course snapshots.

**Why:** Notes already distinguish shareable course content from private personal content. Mixing the two test collections would expose a user's private study material to course recipients or administrators.

**How to apply:** Keep Course Test data in `testDecks` and Personal Test data in `personalTestDecks`; any future sharing, snapshot, relay, import, or export code must include only `testDecks`.