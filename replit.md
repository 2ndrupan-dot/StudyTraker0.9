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

### Admin Panel env var
- `VITE_ADMIN_EMAILS` — comma-separated list of Gmail addresses that are **Super Admins** (e.g. `you@gmail.com,other@gmail.com`). Super admins cannot be removed from the admin list. Additional admins can be added/removed from inside the Admin Panel UI (stored in Firestore `adminConfig/adminList`).

For Render deployment, set all the `VITE_FIREBASE_*` vars **plus** `VITE_ADMIN_EMAILS` in the Render dashboard.

## Admin Panel

### How it works
- Any email in `VITE_ADMIN_EMAILS` is a **super admin**.
- Super admins can promote other emails to admin via the Admin Panel → Admins tab.
- Admins see a **"Switch to Admin Panel"** button in Profile → Settings (regular users do not).
- A **notification bell** 🔔 on the Progress page header shows pending share requests to any logged-in user.

### Admin Panel tabs
| Tab | Description |
|-----|-------------|
| **Admins** | Super admin can add/remove admin emails. |
| **Share** | 3-step wizard: pick recipient email + content type (course or note drill-down) + duration & granular permissions. |
| **Sent** | List of all shares sent by this admin. Edit permissions or cancel pending shares. |

### Granular permissions (per share)
- Edit notes
- Delete notes
- Download notes (PDF)
- Copy notes

### Firestore Security Rules
Set these in the Firebase Console → Firestore → Rules (these are **not** in the repo — set them manually):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // shareRequests: sender or recipient can read/write their own docs
    match /shareRequests/{shareId} {
      allow read, write: if request.auth != null &&
        (request.auth.uid == resource.data.fromAdminUid ||
         request.auth.token.email == resource.data.toEmail);
      allow create: if request.auth != null;
    }

    // adminConfig: all authenticated users can read; only admins write
    // (write guard enforced in app logic via VITE_ADMIN_EMAILS)
    match /adminConfig/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

## Deploying to Render
1. Push this repo to GitHub.
2. Create a new **Static Site** on Render pointing to the repo.
3. **Build command**: `npm install -g pnpm && pnpm install && cd artifacts/study-tracker && pnpm build`
4. **Publish directory**: `artifacts/study-tracker/dist/public`
5. Add all `VITE_FIREBASE_*` env vars **and** `VITE_ADMIN_EMAILS` in the Render dashboard.

## Course Sharing (Admin → User)

### How it works
1. Admin opens **Admin Panel → Share tab**, picks a course, sets permissions & duration, sends.
2. The user sees a notification bell 🔔. They click **গ্রহণ করুন / Accept**.
3. The accepted course immediately appears in their course list (page reloads to pick it up).
4. The user can study the course — open subjects, chapters, topics, and notes — exactly like their own courses.

### Permissions enforced in the note viewer
| Admin sets | Effect on user's NoteEditorModal |
|---|---|
| `editNotes: false` | Edit/pencil button hidden; note is read-only |
| `downloadNotes: false` | Download-as-PDF button hidden |
| `copyNotes: false` | Copy button hidden |

### Shared course indicator
The Subjects page header shows **🔗 Shared · AdminName** when a shared course is active.

### Architecture note
The course data (studyData + notes) is embedded as a snapshot in the shareRequest Firestore document at send-time. On accept, it is copied to the user's own `users/{uid}/studyData`, `users/{uid}/courseNotes`, and `users/{uid}/courses` collections. A separate `users/{uid}/sharedCourses/{courseId}` doc tracks permissions and expiry for runtime enforcement. No new Firestore security rules are required.

### Firestore Security Rules
No changes needed beyond what is already in the Firebase console. The existing `shareRequests` rules allow both admin and recipient to read the document (which includes the course snapshot).

### Live countdowns, subject-level sharing, extend, and trash
- **Live countdowns**: pending notifications (bell) and accepted shares ("My Courses" / Subjects header / Admin's Sent tab) show a live `D:HH:MM:SS` countdown (`src/components/Countdown.tsx`). When it hits zero the card/course disappears automatically — pending shares and accepted shares are hard-deleted from Firestore (via best-effort client-side purge loops in `AdminContext.tsx` and `CourseContext.tsx`), not moved to trash.
- **Extend time**: admin can add extra time to a still-active pending or accepted share from the Sent tab ("Extend Time") — `extendShare()` in `AdminContext.tsx`.
- **Subject-level sharing**: when sharing a course that has subjects, Step 2 of the wizard shows a checkbox list (+ "Select all"); only the chosen subjects (and their notes) are embedded in the snapshot (`sharedSubjectIds` field + `filterSubjectsByIds`/`filterNotesMapByIds` helpers in `AdminContext.tsx`). Courses with no subjects skip this and share as a whole.
- **Add more subjects later**: for an active accepted course share, admin can reopen it ("Add Subjects") and send additional subjects — already-sent ones are shown as checked/disabled, only new ones can be picked. Reuses the existing content-sync channel (`courseSnapshot` + `syncedAt`) so the recipient picks it up live — `addSubjectsToShare()`.
- **Manual delete → Trash**: admin deleting a share card (course/note/message) from the Sent tab requires confirmation and moves it to a Trash sub-tab (`status: 'trashed'`, `trashedAt`/`trashedFromStatus` fields) instead of deleting it outright. From Trash, admin can Restore or permanently delete. This only applies to manual deletes — automatic expiry always hard-deletes, never touches trash.

## User preferences
- User plans to deploy via Render (GitHub → Render static site).
