---
name: StudyTrack Today-page sync bugs (cross-device clock skew, plan reseeding, multi-write flicker)
description: Root causes found for three related "Today" plan bugs (unwanted auto plan changes, cross-device completion not syncing, Pending/Revision list flicker) and the fix pattern used.
---

## Cross-device completion not syncing (app vs website showing different done state)
`StudyContext.tsx`'s `pickNewerData` (initial load) and the `onSnapshot` remote-update
handler used to decide "is this data newer?" by comparing `savedAt` timestamps
that were `Date.now()` values written by **two different devices' clocks**.
Any clock drift between the phone/app and the browser meant one device could
permanently reject the other's genuinely newer writes (or keep re-serving its
own stale cache).

**Why:** client clocks are not synchronized across devices; comparing
`Date.now()` from device A against `Date.now()` from device B is not a valid
ordering test even though it looks like one.

**How to apply:** never gate "should I accept this remote update / prefer my
local cache" on a raw cross-device timestamp comparison. Instead, track a
device-local "I have an edit not yet confirmed written" flag (in memory +
mirrored to localStorage so it survives a reload) and gate on that. Firestore
already delivers snapshots for a single document in server-commit order, so
once you're not guarding against your own device's in-flight edit, it's safe
to just always apply the incoming snapshot.

## Today plan changing subjects mid-day without "Load More"
`generateSmartPlan`'s weighted-random subject selection was seeded with
`Math.floor(Date.now() / 86400000)` (UTC day boundary), while the app's actual
"today" (`todayStr`) is computed in IST. UTC midnight is 5:30 AM IST, so a
regenerate triggered later the same IST day (e.g. by the "new structural item"
effect or an hours-setting change) could land on a different UTC day bucket
and reseed with a different random sequence — silently swapping which
subjects appear, looking exactly like an unrequested "Load More".

**Why:** any per-day-deterministic seed must be derived from the app's own
calendar-day string, not from a UTC-based `Date.now()` division.

**How to apply:** derive day-based seeds from the already-computed local date
string (e.g. `parseISO(todayStr)`), never from raw `Date.now()`.

## Pending/Revision list flicker
Actions that logically change two `todayData` fields at once (e.g. completing
a pending task removes it from `pending` AND adds an entry to `revisions`)
were written as two separate `setDoc(..., {merge:true})` calls. Firestore's
`onSnapshot` fires once per commit, so this produced two consecutive
snapshots, each reflecting only one of the two fields — a visible flicker
where the panel briefly showed the half-updated state.

**Why:** merge:true writes are still separate commits; only writes made in
the *same* `setDoc` call are atomic/observed together.

**How to apply:** when a single user action needs to change multiple sibling
fields in one document, batch them into one `setDoc` call with all the
changed fields, instead of calling separate per-field sync helpers back to
back.
