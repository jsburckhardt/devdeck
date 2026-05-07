# Research Brief — Issue #9

## Scope Classification
- **Scope Type:** `issue`
- **Requires ADRs:** Yes
  - **ADR-0003 — Project Registry & Persistence Strategy** (storage mechanism, file location, atomic-write semantics, path resolution contract)
- **Requires Core-Components:** No — the registry data-access layer is not a cross-cutting concern at this stage. The planner should reassess if the registry later serves terminal, theming, or other subsystems.

---

## Problem Analysis

### 1. Current Auto-Discovery Model

Projects are discovered purely at request time by scanning `DEVDECK_PROJECTS_DIR` (default `/workspaces`) for directories containing `.git` or `package.json`. The process is entirely stateless — nothing is persisted between requests and there is no way to track projects outside that single directory.

**File:** `src/app/api/projects/route.ts:6–11`
```typescript
const PROJECTS_DIR = process.env.DEVDECK_PROJECTS_DIR ?? "/workspaces";

export function resolveProjectPath(slug: string): string {
  const sanitized = slug.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.resolve(PROJECTS_DIR, sanitized);
}
```

`resolveProjectPath` is **synchronous** and bakes in the assumption that every project lives at `PROJECTS_DIR/<slug>`. It is exported from the route module and consumed by two downstream API routes.

### 2. `resolveProjectPath` Consumers

Both file-serving routes import this utility synchronously:

- `src/app/api/files/route.ts:6` — called at line 137: `const root = resolveProjectPath(slug);`
- `src/app/api/files/content/route.ts:4` — called at line 21: `const root = resolveProjectPath(slug);`

Both routes are already `async` functions, so migrating them to `await resolveProjectPath(slug)` is mechanically straightforward but touches security-critical path resolution code.

### 3. `Project` Type is Missing Fields

**File:** `src/lib/types.ts:1–7`
```typescript
export interface Project {
  slug: string;
  name: string;
  description: string;
  language?: string;
  lastModified?: string;
}
```

Three fields are missing that this feature requires:
- **`path: string`** — the absolute filesystem path to the project root (currently implicit via `PROJECTS_DIR + slug`)
- **`source: 'auto' | 'manual'`** — distinguishes discovery origin; governs removal semantics
- **`hidden?: boolean`** — for soft-removal of auto-discovered projects (they should not reappear after the scan)

### 4. No Persistence Layer Exists

There is zero server-side persistence in the current application. No database, no config file, no state held between Next.js server requests. Introducing manual project tracking requires an explicit persistence mechanism — this is the primary architectural gap and the reason an ADR is required.

### 5. No Dialog/Modal Primitives Installed

Despite ADR-0002 declaring "Tailwind CSS v4 + shadcn/ui" as the UI stack, **no `@radix-ui/*` packages are installed**. `package.json` contains no Radix UI dependencies. The UI is entirely hand-built with Tailwind classes and plain `<button>` elements. There is no reusable dialog, modal, or form primitive to build "Add Project" and "Edit Project" dialogs from.

**`sonner` is already installed** (`package.json:37`) and `<Toaster />` is mounted in the root layout (`src/app/layout.tsx:3,35`). It should be used for post-mutation toast feedback.

### 6. Slug Stability and URL Routing

The workspace page is served at `/project/[slug]`. The project page (`src/app/project/[slug]/page.tsx:19-24`) fetches `GET /api/projects` and finds the matching project by slug. Slugs **must remain stable across edits** — editing name or description must not change the slug. Slug should be assigned at creation time and locked.

For auto-discovered projects, slug = directory name (existing behavior, preserved). For manual projects at arbitrary paths, slug must be derived deterministically (e.g., `path.basename(projectPath)`) with collision detection.

---

## Codebase Findings

### Key Files and Their Roles

| File | Current Role | Change Required |
|------|-------------|----------------|
| `src/lib/types.ts` | `Project` interface | Add `path`, `source`, `hidden` fields |
| `src/app/api/projects/route.ts` | Auto-discovery + `resolveProjectPath` export | Extract `resolveProjectPath` to `src/lib/registry.ts`; add POST handler; merge registry + scan |
| `src/app/api/projects/[slug]/route.ts` | Does not exist | New file: PUT (update) + DELETE (remove/hide) handlers |
| `src/app/api/files/route.ts` | File tree — calls `resolveProjectPath` | Update import path + await async resolver |
| `src/app/api/files/content/route.ts` | File content — calls `resolveProjectPath` | Update import path + await async resolver |
| `src/app/page.tsx` | Landing page | Add "Add Project" button/card; handle post-mutation refresh |
| `src/components/project-card.tsx` | Project card (full-card button) | Add edit + remove action slots (stop-propagation from nav) |
| `src/lib/registry.ts` (new) | Registry read/write + path resolution | New: `loadRegistry`, `saveRegistry`, `resolveProjectPath` (async), merge helpers |

### `resolveProjectPath` — Current vs Required

**Current (synchronous, route-module export):**
```typescript
// src/app/api/projects/route.ts:8-11
export function resolveProjectPath(slug: string): string {
  const sanitized = slug.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.resolve(PROJECTS_DIR, sanitized);
}
```

**Required (async, registry lookup with fallback):**
```typescript
// src/lib/registry.ts (new)
export async function resolveProjectPath(slug: string): Promise<string> {
  const registry = await loadRegistry();
  const entry = registry.projects.find(p => p.slug === slug);
  if (entry) return entry.path;
  // Backward-compatible fallback for auto-discovered projects
  const sanitized = slug.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.resolve(PROJECTS_DIR, sanitized);
}
```

Both consumer routes are `async` and immediately follow `resolveProjectPath` with `await fs.access(root)`, so the migration is a two-line change per route (update import + add `await`).

### Detection Helpers to Preserve and Extract

`detectLanguage` (`src/app/api/projects/route.ts:13-26`) and `readPackageJson` (`src/app/api/projects/route.ts:28-38`) are currently private to the route module. They must be extracted to `src/lib/registry.ts` (or a new `src/lib/project-utils.ts`) so they can be called during manual project creation (auto-populating name/description from `package.json`).

### Existing Security Constraint — Path Traversal Guard

**File:** `src/app/api/files/content/route.ts:24-27`
```typescript
const relative = path.relative(root, fullPath);
if (relative.startsWith("..") || path.isAbsolute(relative)) {
  return NextResponse.json({ error: "Invalid path" }, { status: 403 });
}
```

This guard operates relative to the **resolved project root** and remains valid for manual projects once `root` is correctly resolved from the registry. No change to the guard logic is needed, but the `root` value it compares against changes source.

### Landing Page Data Flow (Current)

```
page.tsx (useEffect) → GET /api/projects → auto-scan PROJECTS_DIR → Project[]
                                                                         ↓
                                                                 ProjectCard grid
```

**Required additions:**
- Add project button/card triggers POST → re-fetch
- Edit action triggers PUT → re-fetch
- Remove action + confirm triggers DELETE → re-fetch

The current `useEffect` has no refetch mechanism. A `refreshProjects` callback or a `refreshKey` state increment will be needed.

### ProjectCard — Action Slot Gap

**File:** `src/components/project-card.tsx:48-85`

The entire card is a single `<button onClick={handleClick}>`. To add edit and remove icons without triggering navigation, action buttons must call `event.stopPropagation()`. The `group-hover:opacity-100` pattern already used for the `Code` icon (`src/components/project-card.tsx:57-61`) provides the correct visual precedent.

### Existing Test Patterns

| File | Pattern | Relevance to Issue #9 |
|------|---------|----------------------|
| `src/app/page.test.tsx:1-34` | Renders with ThemeProvider, mocks `next/navigation` | Model for extended landing page tests |
| `src/components/error-boundary.test.tsx:1-63` | Full interaction with `userEvent`, retry button | Model for dialog interaction tests |
| `src/hooks/use-terminal.test.ts` | Async hook tests with heavy mocking | Model for registry async function tests |
| `src/server/terminal-server.test.ts` | Server-side integration test | Only existing server-side test; model for API route tests |

**No `/api/projects` route tests exist.** All new API handlers need unit tests with `vi.mock('fs/promises')` for filesystem operations.

---

## Technical Risks & Considerations

### Risk 1: `resolveProjectPath` Signature Change — HIGH
Converting from synchronous to async is mechanically simple but touches the security-critical code path used by both file-serving routes. Both must be audited carefully to ensure the path traversal guard (`path.relative(root, fullPath)`) still operates correctly with the new async-resolved `root`.

### Risk 2: Registry Persistence Mechanism — HIGH (ADR Required)
No persistence exists. Candidates:
- **JSON file** (`$DEVDECK_PROJECTS_DIR/.devdeck-registry.json` or `~/.config/devdeck/registry.json`): no new dependencies, human-readable, requires atomic write (write-to-temp → `fs.rename`)
- **SQLite** (via `better-sqlite3`): strong concurrent-write safety, native dependency, harder to inspect
- **In-memory only**: not viable for persistence across restarts

JSON file aligns with the project's minimal-dependency philosophy. The file location needs to be configurable via a new environment variable (e.g., `DEVDECK_DATA_DIR`). The ADR must settle this before implementation begins.

### Risk 3: Slug Collision on Manual Add — MEDIUM
If `/some/external/devdeck` is added manually while `/workspaces/devdeck` is auto-discovered, both produce slug `devdeck`. `POST /api/projects` must detect this and return `409 Conflict` with a clear error message. The planner should define the disambiguation strategy (reject with error, or auto-suffix the slug).

### Risk 4: No Dialog Primitives — MEDIUM
Installing `@radix-ui/react-dialog` (~15 KB gzip) is the lowest-friction path that aligns with ADR-0002's declared stack. Building a bespoke overlay is smaller but risks focus-trap and ARIA deficiencies. The planner must make this call in the Plan stage.

### Risk 5: Stale / Missing Tracked Paths — MEDIUM
Manually-tracked project paths can be moved or deleted outside DevDeck. `GET /api/projects` should defensively check `fs.access` for each registry entry and mark unavailable projects (rather than crashing with 500). The card must render an "unavailable" state, and the edit dialog should allow updating to a new valid path.

### Risk 6: Cache Invalidation After Mutations — LOW–MEDIUM
`GET /api/projects` currently returns `Cache-Control: private, max-age=10` (`src/app/api/projects/route.ts:85-87`). After a POST/PUT/DELETE the client must bypass the cache. The fetch call should use `cache: 'no-store'` after mutations, or the mutation response should instruct the client to refetch.

### Risk 7: `resolveProjectPath` Exported from Route Module — LOW
The current design exports a utility function from a Next.js route module (`src/app/api/projects/route.ts:8`). This is a design smell — route modules should not export utility functions consumed by other routes. Moving the function to `src/lib/registry.ts` is the correct fix and is part of the required registry work.

### Risk 8: Concurrent Registry Writes — LOW (at current scale)
Two simultaneous add/remove operations could corrupt a JSON registry file. Atomic write via `write-temp + fs.rename` mitigates most single-file corruption cases. File locking is overkill for the single-user use case but should be noted in the ADR.

---

## Recommendations for Plan Stage

### 1. Create ADR-0003 Before Implementation
**ADR-0003 — Project Registry & Persistence Strategy** must be written and accepted before any code is produced. It should settle:
- Storage format (JSON file recommended)
- File location and configuration (new env var `DEVDECK_DATA_DIR` or similar)
- Atomic write strategy (temp file + `fs.rename`)
- `ProjectRegistryEntry` schema (fields: `slug`, `path`, `source: 'auto' | 'manual'`, `hidden?: boolean`, `name?: string`, `description?: string`)
- Whether `resolveProjectPath` belongs in `src/lib/registry.ts` (recommended) or elsewhere

### 2. Strict Task Sequencing
The persistence foundation must be built first. Recommended implementation order:

1. **ADR-0003** (Plan stage — before any code)
2. Update `Project` type + create `src/lib/registry.ts` (load/save/merge/resolve)
3. Update `GET /api/projects` to merge registry entries with auto-discovery
4. Update `src/app/api/files/route.ts` and `src/app/api/files/content/route.ts` to use async resolver
5. Add `POST /api/projects` (validate path, detect language/name, save to registry)
6. Add `PUT /api/projects/[slug]` (update metadata/path in registry)
7. Add `DELETE /api/projects/[slug]` (remove manual entry or set `hidden: true` for auto-discovered)
8. Update `ProjectCard` with edit + remove action slots
9. Build "Add Project" dialog (after dialog primitive decision is made)
10. Build "Edit Project" dialog
11. Build "Remove" confirmation dialog
12. Wire landing page refresh after mutations + stale project handling

### 3. Dialog Primitive Decision
The planner should install `@radix-ui/react-dialog` to align with the ADR-0002 stack declaration and unblock building three accessible dialogs. This should be recorded in the action plan as an explicit decision.

### 4. Test Coverage Plan
Per CORE-COMPONENT-0006 (80% coverage target, co-located tests):
- `src/lib/registry.test.ts` — unit tests for `loadRegistry`, `saveRegistry`, `resolveProjectPath`, merge logic, with `vi.mock('fs/promises')`
- `src/app/api/projects/route.test.ts` — GET (merge), POST (happy path, invalid path, duplicate slug, missing dir)
- `src/app/api/projects/[slug]/route.test.ts` — PUT and DELETE (success, not found, auto-hide)
- `src/components/project-card.test.tsx` — edit + remove button rendering, stop-propagation behavior
- `src/app/page.test.tsx` — extend for Add button presence, post-mutation re-fetch
- Dialog component tests — `userEvent` for open/close, form submission, validation errors

### 5. Backward Compatibility Guarantee
`GET /api/projects` must remain backward-compatible. Auto-discovered projects must continue to appear and function without any registry entries. The `path` field addition is non-breaking (new optional field on a server response). The workspace page and all other consumers require no breaking changes.

### 6. No New Core-Component Required
The registry module (`src/lib/registry.ts`) is a data-access layer for a single feature and does not cross-cut other subsystems (terminal, theming, error handling). A core-component is not warranted at this stage. The planner should revisit if registry usage spreads beyond project management.
