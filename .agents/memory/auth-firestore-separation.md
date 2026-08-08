---
name: Auth and Firestore separation
description: Authentication state must settle independently from optional Firestore profile and data listeners.
---

Firebase Auth callbacks should update the app user synchronously and should not await Firestore reads or profile metadata. Firestore listeners may start after auth state is established, but a profile-read failure must never turn a successful login into an auth redirect or render crash.

**Why:** Mobile browsers can suspend and resume tabs while Firebase Auth and Firestore are changing network state. Coupling the two made intermittent Firestore internal assertions appear as failed email/Google logins.

**How to apply:** Keep auth persistence and redirect handling in the Auth context. Load optional profile data in a separate best-effort effect, and avoid manually forcing Firestore network transitions during visibility changes.