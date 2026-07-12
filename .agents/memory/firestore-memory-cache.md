---
name: Firestore cache switch to memory
description: Why StudyTrack uses memoryLocalCache instead of persistentLocalCache for Firestore.
---

Switched `firebase.ts` from `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` to `memoryLocalCache()`.

**Why:** With persistent IndexedDB cache, `setDoc()` resolves after writing to local IndexedDB — not after server confirmation. As the cache accumulates over time it can get into a stuck state where local writes succeed but server sync is silently blocked. Clearing browser cache fixed it (reset IndexedDB), confirming IndexedDB was the culprit. The app already writes everything to localStorage before every Firestore call, so the IndexedDB cache was redundant.

**How to apply:** Do NOT re-add `persistentLocalCache` or `persistentMultipleTabManager` — this was an intentional removal to fix silent write failures. If offline support needs improvement, enhance the existing localStorage layer instead. The sync status UI (syncStatus: idle/syncing/success/failed in StudyContext) now correctly reflects actual write outcomes.
