---
name: Admin expiry and expiryTick ordering
description: AdminRecord expiresAt feature — key constraints on variable ordering and expiry pattern.
---

## Rule
`const [expiryTick, setExpiryTick] = useState(0)` **must be declared before** `const now = Date.now()` and all computed values that use `now` (`activeFirestoreAdmins`, `adminEmails`, `isAdmin`, `currentAdminPermissions`, `visibleAdmins`). React functional components execute top-to-bottom; placing `expiryTick` after `const now` caused a duplicate-const parse error because an earlier session had `now` defined twice.

**Why:** The 30-second tick is what makes `now` re-evaluate and expired admin rows drop out of the lists. If `expiryTick` comes after the computed values, those values don't re-evaluate when the tick fires.

**How to apply:** In AdminContext.tsx, the order inside AdminProvider is:
1. `expiryTick` state + interval effect
2. `const now = Date.now()` + `void expiryTick`
3. `activeFirestoreAdmins` filter
4. `adminEmails`, `isAdmin`, `currentAdminPermissions`, `superAdminEntries`, `visibleAdmins`
5. Share expiry lists (`pendingShares`, `acceptedShares`, etc.)
6. Auto-expiry effects (shares + admin records)

## Admin expiry pattern
- `AdminRecord.expiresAt?: number` — unix ms; undefined = permanent
- `VisibleAdminEntry.expiresAt?: number` — mirrored for UI
- `activeFirestoreAdmins` filters expired records for access checks; `visibleAdmins` shows ALL records (including expired) so managers can renew them
- Auto-expiry effect: when any `firestoreAdminRecords` entry has `expiresAt <= now`, re-reads Firestore and filters expired entries out — idempotent, any logged-in user can trigger it
- `updateAdminDuration(email, addValue, addUnit)`: positive = extend, negative = reduce; base is `expiresAt` if still in future, else `now`; never sets to past (min 60 s from now)
- `addAdmin` accepts optional `durationValue` + `durationUnit`; omitting both = permanent admin
