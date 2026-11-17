---
name: Personal test privacy
description: The boundary between shared Course Test cards and private Personal Test cards.
---

Personal Test and Extra Test cards must remain private to the current user, even when stored under an active course. Course Test cards are the only test data included in course shares, admin live-sync relays, or accepted shared-course snapshots.

**Why:** Notes already distinguish shareable course content from private personal content. Mixing either personal test collection into course sharing would expose a user's private study material to course recipients or administrators.

**How to apply:** Keep Course Test data in `testDecks`, Personal Test data in `personalTestDecks`, and Extra Test data in `extraTestDecks`; any future sharing, snapshot, relay, import, or export code must include only `testDecks`.