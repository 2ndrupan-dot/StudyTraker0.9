# StudyTrack

A full-stack study tracker app built as a pnpm monorepo.

## Stack
- **Frontend:** React 19, Vite 7, Tailwind CSS 4, Framer Motion, Tiptap (rich text editor), Radix UI
- **Backend/API:** Node.js with tsx
- **Database:** Firestore (Firebase) with Drizzle ORM for schema
- **Auth:** Firebase Auth (Google + email/password)
- **Data Fetching:** TanStack Query, Zod, Orval (OpenAPI client generation)

## Monorepo Structure
```
artifacts/
  study-tracker/    ← Main React frontend (port 5000 in dev)
  api-server/       ← Node.js API server
  mockup-sandbox/   ← UI component playground
lib/
  db/               ← Drizzle ORM schemas
  api-spec/         ← OpenAPI specs
  api-client-react/ ← Generated API client
  api-zod/          ← Generated Zod schemas
```

## Running the App
```bash
# Install dependencies (use --registry flag to bypass package firewall)
pnpm install --registry https://registry.npmjs.org
```

This project runs as three separate Replit artifacts, each with its own managed workflow (no manual workflow setup needed — restart via the artifact's own workflow if it stalls):
- **StudyTrack** (`artifacts/study-tracker`) — web frontend, preview path `/`
- **API Server** (`artifacts/api-server`) — preview path `/api`
- **Component Preview Server** (`artifacts/mockup-sandbox`) — preview path `/__mockup`

If the preview shows "artifact crashed" with `vite: not found` or similar, dependencies just need installing (`pnpm install --registry https://registry.npmjs.org` from the repo root), then restart the `artifacts/study-tracker: web` workflow.

## Firebase Config
Firebase credentials are read from `VITE_FIREBASE_*` environment variables (see `.env.example`). Firestore offline persistence is enabled with `persistentMultipleTabManager`.

## User Preferences
- Respond in Bengali when the user writes in Bengali
- Always explain what was changed at the end of each task
- Do not make code changes without permission (analysis-only mode when asked)
