---
name: Offline reachability checks
description: Reliable connection detection for app startup and network-dependent flows
---

Do not use `navigator.onLine` as the only signal for internet availability. Devices connected to Wi-Fi without upstream internet can still report `true`; use a short reachability probe before starting auth or remote-data loading.

**Why:** On mobile browsers, the app can otherwise remain on an authentication or data splash screen indefinitely while the browser reports an online link.

**How to apply:** Gate network-dependent startup behind a bounded probe, listen to `online`/`offline` events for changes, and always provide a retry path when the probe fails.