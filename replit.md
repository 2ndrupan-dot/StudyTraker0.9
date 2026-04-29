# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## StudyTrack App — Key Features

- **Multi-Course system**: Each user can create and manage multiple courses (e.g. SSC 2025, HSC Physics). After first registration, user must create a course before accessing any feature. Each course is completely isolated (own subjects, settings, temp notes, note pages). Courses managed via `CourseContext` (`context/CourseContext.tsx`). Add/Switch course from Progress page.
- **Hierarchy**: Subject > Chapter > Topic > Subtopic > Concept > Point (6 levels)
- **Responsive**: Mobile bottom nav, Desktop sidebar nav
- **Cloud sync**: Firebase Firestore (requires Firestore enabled in Firebase console)
- **Profile photo + note attachments**: Firebase Storage upload (requires Storage enabled in Firebase console)
- **i18n**: English + Bengali, all strings via `t()` translation function
- **Persistence**: Firestore primary, localStorage fallback. Study data stored per course at `users/{uid}/studyData/{courseId}`. Course list at `users/{uid}/courses/{courseId}`. Active course tracked in localStorage `@study_activeCourse_{email}`.
- **Marks**: per-item Important/Weak flags + free-form Notes at every hierarchy level (`MarkPath` + `ItemActions`)
- **Weak boost**: when an item is marked Weak, the time engine multiplies its estimated minutes (`WEAK_MULTIPLIER` in `lib/timeEngine.ts`)
- **Important/Weak filter**: on Subjects page, toggling either chip swaps the tree view for a flat breadcrumbed list of every flagged item (`gatherFlaggedItems` in `pages/Subjects.tsx`)
- **Temp Notes**: hierarchical Firestore-backed to-do list rendered atop the Subjects page (newest first, NOT synced to Today plan)
- **Note Pages**: A4 (794×1123 px) rich pages with draggable/resizable text, links, images, and PDFs. Multi-page, zoomable, paste-image support. Each page is its own Firestore doc at `users/{uid}/notePages/{id}` with `notePagesIndex` as the lightweight list. Routes: `/notes` and `/notes/:id`
- **Global search**: Ctrl/Cmd+K (or sidebar/floating button) — searches every subject-tree node, temp notes, and note page titles with highlighted matches and breadcrumbs
- **Today extras**: per-task Note/Important/Weak buttons inline on every card; Load More additions are tagged with `loadedFrom` (Extra badge) and can be returned to their original day with one click
- **PWA**: installable + offline-capable via `public/manifest.webmanifest` + `public/sw.js` (network-first navigation, stale-while-revalidate static assets, Firebase calls bypassed). `PWAUpdater` shows install + update prompts. Icon: `public/images/icon-512.jpeg` (the app logo).

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── study-tracker/      # React + Vite StudyTrack app (main)
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
