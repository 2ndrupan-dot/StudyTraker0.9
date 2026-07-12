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

If the preview shows "artifact crashed" with `vite: not found` or similar, dependencies just need installing (`pnpm install --registry https://registry.npmjs.org` from the repo root), then restart the `artifacts/study-tracker: web` workflow. On a fresh import a leftover generic "Start application" workflow may also appear alongside the artifact workflows — remove it, since it conflicts with the artifact-managed ones and isn't needed.

## Note-saving architecture (why notes don't get lost)
Firestore documents have a 1 MB limit. Rich-text notes (Tiptap HTML) are stored outside the main `studyData` document to avoid hitting it:
- Per-item notes (subject/chapter/topic/.../tempNote) live in a companion `users/{uid}/courseNotes/{courseId}` document as a flat map.
- If that flat map itself grows past ~800 KB (many/large notes accumulated over time), it's automatically offloaded to Firebase Storage (`users/{uid}/courseNotes/{courseId}.json`) and the Firestore doc keeps only a `notesUrl` reference — this has no practical size ceiling.
- Full-page notes (`notePages`) follow the same Storage-offload pattern individually per page.
If a user reports "notes don't save" with a browser console error mentioning `courseNotes` document size exceeding Firestore's limit, this offload path handles it going forward — but it only "self-heals" once they perform a new save. Try dismissed changes on the affected course by reopening the note editor and saving once.

## Firebase Config
Firebase credentials are read from `VITE_FIREBASE_*` environment variables (see `.env.example`). Firestore offline persistence is enabled with `persistentMultipleTabManager`.

## User Preferences
- Respond in Bengali when the user writes in Bengali
- Always explain what was changed at the end of each task
- Do not make code changes without permission (analysis-only mode when asked)
