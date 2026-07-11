---
name: StudyTrack artifact conversion
description: StudyTrack pnpm monorepo now runs as 3 separate Replit artifacts, not one workflow.
---

StudyTrack (study-tracker repo) is set up as three Replit artifacts, each with its own platform-managed workflow generated from `artifact.toml`: `artifacts/study-tracker` (web, path `/`), `artifacts/api-server` (path `/api`), `artifacts/mockup-sandbox` (path `/__mockup`). There is no longer a single "Start application" workflow — a leftover one conflicted/duplicated the study-tracker artifact workflow and was removed.

**Why:** After GitHub import, `node_modules` was missing (fresh clone) causing `vite: not found`; separately the repo had a stale pre-conversion workflow from before it became a multi-artifact project.

**How to apply:** If StudyTrack's preview crashes on import/re-import, first run `pnpm install --registry https://registry.npmjs.org` from repo root, then restart the specific artifact workflow (e.g. `artifacts/study-tracker: web`) — don't recreate a generic "Start application" workflow.
