# StudyTrack

An AI-powered study tracker app built with React + Vite and Firebase (Firestore + Auth).

## Stack
- **Frontend**: React 19, Vite 7, Tailwind CSS v4, TipTap rich-text editor, Framer Motion
- **Backend/DB**: Firebase Firestore (NoSQL), Firebase Authentication
- **Monorepo**: pnpm workspaces — artifacts live under `artifacts/`

## Project structure
```
artifacts/
  study-tracker/   ← main React/Vite frontend
  api-server/      ← Express API server (optional backend)
  mockup-sandbox/  ← Vite sandbox for UI mockups
lib/               ← shared libraries (api-zod, db, etc.)
```

## Running on Replit
This project is set up as three Replit artifacts, each with its own managed workflow:
- **StudyTrack** (`artifacts/study-tracker`, web) — main React/Vite frontend
- **API Server** (`artifacts/api-server`, api) — optional Express backend
- **Component Preview Server** (`artifacts/mockup-sandbox`, design) — Vite sandbox for UI mockups

The platform assigns each artifact's dev server a dynamic port via `$PORT`; don't hardcode a port in the `dev` script (previously `PORT=5000` was hardcoded in `study-tracker/package.json`, which conflicted with the platform-assigned port — removed).

## Environment variables
Firebase credentials are configured in `.replit` under `[userenv.shared]`:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

For Render deployment, set these same variables as environment variables in the Render dashboard.

## Deploying to Render
1. Push this repo to GitHub.
2. Create a new **Static Site** on Render pointing to the repo.
3. **Build command**: `npm install -g pnpm && pnpm install && cd artifacts/study-tracker && pnpm build`
4. **Publish directory**: `artifacts/study-tracker/dist/public`
5. Add all `VITE_FIREBASE_*` env vars in the Render dashboard (values from `.replit` `[userenv.shared]`).

## User preferences
- User plans to deploy via Render (GitHub → Render static site).
