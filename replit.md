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

# Run study-tracker frontend
pnpm --filter @workspace/study-tracker run dev
```

The study-tracker workflow runs automatically via Replit.

## Firebase Config
Firebase credentials are read from `VITE_FIREBASE_*` environment variables (see `.env.example`). Firestore offline persistence is enabled with `persistentMultipleTabManager`.

## User Preferences
- Respond in Bengali when the user writes in Bengali
- Always explain what was changed at the end of each task
- Do not make code changes without permission (analysis-only mode when asked)
