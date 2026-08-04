# StudyTrack

A Firebase-backed React study tracker app ("Learning Sathi") for managing courses, subjects, notes, and daily study plans.

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Auth & Database**: Firebase (Firestore, Firebase Auth)
- **Rich text**: Tiptap editor
- **UI**: Radix UI primitives + shadcn/ui components

## Running the app

```
pnpm install
# Workflow: "artifacts/study-tracker: web" starts the dev server on port 5000
```

The dev server reads Firebase config from environment variables (already configured in the Replit environment):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_ADMIN_EMAILS` — comma-separated list of admin email addresses

## Project layout

```
artifacts/study-tracker/   # Main React app
  src/
    components/            # Shared UI components
    context/               # React context providers (auth, course data, etc.)
    hooks/                 # Custom hooks
    pages/                 # Route-level pages
    lib/                   # Firebase config, utilities
artifacts/api-server/      # (optional) API server artifact
artifacts/mockup-sandbox/  # Design/mockup sandbox
```

## User preferences

- Maintain the existing project structure and Firebase stack.
- Use pnpm for package management.
