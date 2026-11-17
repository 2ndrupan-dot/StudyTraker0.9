---
name: Mockup production builds
description: Environment requirements for building the standalone component preview artifact outside its managed workflow.
---

## Rule
The mockup preview Vite build must receive a valid `PORT` and `BASE_PATH`. The managed artifact workflow injects these values at runtime, but a workspace-wide production build does not.

**Why:** The preview Vite config intentionally validates both values before loading, so `pnpm run build` otherwise fails even though the dev workflow runs correctly.

**How to apply:** Keep safe defaults in the mockup package's build command while allowing explicitly supplied environment values to override them.