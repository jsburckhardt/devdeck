# Task Breakdown — Issue #9: Manual Project Tracking

## Task 1: Update `Project` type and create `src/lib/registry.ts`

- **Status:** Not Started
- **Complexity:** High
- **Dependencies:** None
- **Related ADRs:** ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Extend the `Project` interface in `src/lib/types.ts` with three new fields: `path` (string), `source` (`'auto' | 'manual'`), and `available` (optional boolean). Add a new `ProjectRegistryEntry` interface and `ProjectRegistry` interface.

Create `src/lib/registry.ts` with the following exports:
- `getDataDir(): string` — returns `DEVDECK_DATA_DIR` or `~/.config/devdeck/`
- `loadRegistry(): Promise<ProjectRegistry>` — reads and parses `registry.json`; returns empty registry if file missing
- `saveRegistry(registry: ProjectRegistry): Promise<void>` — atomic write (temp + `fs.rename`); creates data dir if needed
- `resolveProjectPath(slug: string): Promise<string>` — looks up slug in registry, falls back to `PROJECTS_DIR/<slug>`
- `detectLanguage(projectPath: string): Promise<string>` — extracted from `src/app/api/projects/route.ts`
- `readPackageJson(projectPath: string): Promise<{name?: string; description?: string}>` — extracted from route

Remove `resolveProjectPath`, `detectLanguage`, and `readPackageJson` from `src/app/api/projects/route.ts`.

### Files to create/modify
- Modify: `src/lib/types.ts`
- Create: `src/lib/registry.ts`
- Modify: `src/app/api/projects/route.ts` (remove extracted functions)

### Acceptance Criteria
- [ ] `Project` interface has `path: string`, `source: 'auto' | 'manual'`, `available?: boolean` fields
- [ ] `ProjectRegistryEntry` and `ProjectRegistry` types are exported from `src/lib/types.ts`
- [ ] `loadRegistry` returns `{ version: 1, projects: [] }` when file does not exist
- [ ] `loadRegistry` parses valid JSON and returns the registry
- [ ] `saveRegistry` writes to temp file then renames atomically
- [ ] `saveRegistry` creates `DEVDECK_DATA_DIR` directory if it does not exist
- [ ] `resolveProjectPath` returns registry path when slug is found, falls back to `PROJECTS_DIR/<sanitized-slug>`
- [ ] `detectLanguage` and `readPackageJson` produce identical results to current implementations
- [ ] Old exports removed from `src/app/api/projects/route.ts`
- [ ] TypeScript compiles with no errors

### Test Coverage
- `src/lib/registry.test.ts`:
  - `loadRegistry` — returns empty registry when file missing; parses valid file; handles corrupt JSON gracefully
  - `saveRegistry` — writes file atomically (mock `fs.writeFile` + `fs.rename`); creates directory on first write
  - `resolveProjectPath` — returns registry path for known slug; falls back for unknown slug; sanitizes slug input
  - `detectLanguage` — detects each supported language; returns "Unknown" for unrecognized
  - `readPackageJson` — reads name/description; handles missing file

---

## Task 2: Update `GET /api/projects` to merge registry with auto-discovery

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Modify the existing `GET` handler in `src/app/api/projects/route.ts` to:
1. Load the registry via `loadRegistry()`.
2. Perform auto-discovery scan as before, but now populate `path` and `source: 'auto'` on each result.
3. Exclude auto-discovered projects whose slug has `hidden: true` in the registry.
4. Apply registry metadata overrides (name, description) for auto-discovered projects with registry entries.
5. Add manual registry entries (after checking path accessibility via `fs.access`), marking unavailable ones with `available: false`.
6. Merge and sort results.

### Files to modify
- `src/app/api/projects/route.ts`

### Acceptance Criteria
- [ ] Auto-discovered projects include `path` and `source: 'auto'` fields
- [ ] Auto-discovered projects with `hidden: true` in registry are excluded
- [ ] Registry metadata overrides auto-discovered name/description when present
- [ ] Manual registry entries are included with correct `source: 'manual'`
- [ ] Inaccessible manual projects have `available: false` (not omitted)
- [ ] Response remains backward-compatible (existing fields unchanged)
- [ ] Cache-Control header preserved

### Test Coverage
- `src/app/api/projects/route.test.ts`:
  - Returns auto-discovered projects with `path` and `source` fields
  - Excludes hidden auto-discovered projects
  - Includes manual registry entries
  - Marks inaccessible manual projects as `available: false`
  - Applies registry metadata overrides
  - Returns empty array when no projects found

---

## Task 3: Update file API routes to use async resolver

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0003
- **Related Core-Components:** None

### Description
Update both file-serving API routes to import `resolveProjectPath` from `src/lib/registry.ts` instead of `src/app/api/projects/route.ts`, and add `await` to the call.

### Files to modify
- `src/app/api/files/route.ts` — change import, add `await` at call site (~line 137)
- `src/app/api/files/content/route.ts` — change import, add `await` at call site (~line 21)

### Acceptance Criteria
- [ ] Both files import `resolveProjectPath` from `@/lib/registry`
- [ ] Both files `await` the call to `resolveProjectPath`
- [ ] Path traversal guard in `files/content/route.ts` still functions correctly
- [ ] No import of `resolveProjectPath` from `@/app/api/projects/route` remains anywhere
- [ ] TypeScript compiles with no errors

### Test Coverage
- Manual verification that file browsing and content viewing still work for auto-discovered projects
- `src/app/api/files/route.test.ts` (new, minimal): verify `resolveProjectPath` is called with the slug parameter
- `src/app/api/files/content/route.test.ts` (new, minimal): verify path traversal guard rejects `..` paths

---

## Task 4: Add `POST /api/projects` endpoint

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Create a `POST` handler in `src/app/api/projects/route.ts` (same file as GET) that:
1. Accepts JSON body: `{ path: string, name?: string, description?: string }`
2. Validates `path` exists and is a directory via `fs.stat`
3. Derives slug from `path.basename(path)`, sanitized to URL-safe characters
4. Checks for slug collision in registry and auto-discovered projects; returns `409` if collision
5. Auto-populates `name` and `description` from `package.json` if not provided
6. Detects language
7. Saves entry to registry with `source: 'manual'`
8. Returns the created `Project` object with `201` status

### Files to modify
- `src/app/api/projects/route.ts` — add `POST` export

### Acceptance Criteria
- [ ] Accepts valid path and creates registry entry
- [ ] Returns `201` with created `Project` object
- [ ] Returns `400` if `path` is missing or empty
- [ ] Returns `400` if path does not exist or is not a directory
- [ ] Returns `409` if derived slug collides with existing project
- [ ] Auto-populates name/description from `package.json` when not provided
- [ ] Detects language for the new project
- [ ] Slug is sanitized to `[a-zA-Z0-9_-]` characters only

### Test Coverage
- `src/app/api/projects/route.test.ts` (extend):
  - POST happy path — valid path, returns 201 with project
  - POST with missing path — returns 400
  - POST with nonexistent path — returns 400
  - POST with slug collision — returns 409
  - POST auto-populates metadata from package.json
  - POST with user-provided name/description uses those values

---

## Task 5: Add `PUT /api/projects/[slug]` and `DELETE /api/projects/[slug]` endpoints

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 1, Task 4
- **Related ADRs:** ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Create new route file `src/app/api/projects/[slug]/route.ts` with:

**PUT handler:**
- Accepts JSON body: `{ name?: string, description?: string, path?: string }`
- Finds entry in registry by slug; returns `404` if not found
- Updates provided fields (slug cannot be changed)
- If `path` is changed, validates new path exists
- Saves updated registry

**DELETE handler:**
- For `source: 'manual'` entries: removes from registry entirely
- For `source: 'auto'` entries (or entries not in registry): adds/updates entry with `hidden: true`
- Returns `200` with confirmation

### Files to create
- `src/app/api/projects/[slug]/route.ts`

### Acceptance Criteria
- [ ] PUT updates name, description, and/or path for existing registry entry
- [ ] PUT returns `404` if slug not found in registry
- [ ] PUT returns `400` if new path is invalid
- [ ] PUT does not allow slug modification
- [ ] DELETE removes manual entries from registry
- [ ] DELETE sets `hidden: true` for auto-discovered projects
- [ ] DELETE returns `404` if slug does not exist at all
- [ ] DELETE returns `200` with success message

### Test Coverage
- `src/app/api/projects/[slug]/route.test.ts`:
  - PUT updates name — returns 200 with updated project
  - PUT with unknown slug — returns 404
  - PUT with invalid new path — returns 400
  - PUT ignores slug field in body
  - DELETE manual project — removes from registry, returns 200
  - DELETE auto-discovered project — sets hidden, returns 200
  - DELETE unknown slug — returns 404

---

## Task 6: Install dialog primitives and build Add/Edit/Remove dialogs

- **Status:** Not Started
- **Complexity:** High
- **Dependencies:** Task 4, Task 5
- **Related ADRs:** ADR-0002, ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0005

### Description
Install `@radix-ui/react-dialog` to provide accessible modal primitives aligned with ADR-0002's shadcn/ui stack.

Build three dialog components:

1. **`src/components/add-project-dialog.tsx`** — Form with path input (required), optional name and description fields. Submits to `POST /api/projects`. Shows validation errors and 409 conflict errors. Uses `sonner` toast on success.

2. **`src/components/edit-project-dialog.tsx`** — Pre-populated form with name, description, and path fields. Submits to `PUT /api/projects/[slug]`. Shows validation errors. Uses `sonner` toast on success.

3. **`src/components/remove-project-dialog.tsx`** — Confirmation dialog showing project name. Explains behavior (removal vs hiding for auto-discovered). Submits to `DELETE /api/projects/[slug]`. Uses `sonner` toast on success.

All dialogs must:
- Use `@radix-ui/react-dialog` for overlay, focus trap, and ARIA attributes
- Follow existing Tailwind styling patterns (border-border, bg-card, text-foreground, etc.)
- Call an `onSuccess` callback to trigger project list refresh
- Handle loading and error states

### Files to create
- `src/components/add-project-dialog.tsx`
- `src/components/edit-project-dialog.tsx`
- `src/components/remove-project-dialog.tsx`

### Acceptance Criteria
- [ ] `@radix-ui/react-dialog` is installed as a dependency
- [ ] Add dialog validates path is non-empty before submit
- [ ] Add dialog displays 409 error when slug conflicts
- [ ] Edit dialog pre-populates current project values
- [ ] Edit dialog submits only changed fields
- [ ] Remove dialog shows project name and explains removal behavior
- [ ] All dialogs show loading state during submission
- [ ] All dialogs call `onSuccess` callback after successful mutation
- [ ] All dialogs show toast via `sonner` on success
- [ ] All dialogs are keyboard-accessible (Escape to close, Tab navigation)

### Test Coverage
- `src/components/add-project-dialog.test.tsx`:
  - Renders form fields; submits with valid path; shows error on 409; shows toast on success
- `src/components/edit-project-dialog.test.tsx`:
  - Pre-populates fields; submits changes; shows error on failure
- `src/components/remove-project-dialog.test.tsx`:
  - Shows project name; confirms deletion; shows toast on success

---

## Task 7: Update `ProjectCard` with edit and remove action slots

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 6
- **Related ADRs:** ADR-0003
- **Related Core-Components:** None

### Description
Modify `src/components/project-card.tsx` to:
1. Accept `onEdit` and `onRemove` callback props
2. Add edit (PencilSimple) and remove (Trash) icon buttons that appear on hover using the existing `group-hover:opacity-100` pattern
3. Each action button calls `event.stopPropagation()` to prevent card navigation
4. Render an "unavailable" visual state when `project.available === false` (muted styling, warning icon)
5. Show a `source` badge ("manual" indicator) for manually-added projects

### Files to modify
- `src/components/project-card.tsx`

### Acceptance Criteria
- [ ] Edit and remove buttons appear on card hover
- [ ] Clicking edit calls `onEdit` without navigating
- [ ] Clicking remove calls `onRemove` without navigating
- [ ] Unavailable projects show muted styling and warning indicator
- [ ] Manual projects show a visual source indicator
- [ ] Card navigation still works when clicking non-action areas
- [ ] Existing card layout and styling preserved

### Test Coverage
- `src/components/project-card.test.tsx` (new):
  - Renders project name and description
  - Calls `onEdit` when edit button clicked; does not navigate
  - Calls `onRemove` when remove button clicked; does not navigate
  - Shows unavailable indicator when `available: false`
  - Shows manual badge when `source: 'manual'`

---

## Task 8: Update landing page with Add button, refresh, and stale project handling

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 6, Task 7
- **Related ADRs:** ADR-0003
- **Related Core-Components:** None

### Description
Modify `src/app/page.tsx` to:
1. Add an "Add Project" button/card that opens the `AddProjectDialog`
2. Extract `fetchProjects` into a callable function; add `refreshProjects` that re-invokes it with `cache: 'no-store'`
3. Pass `refreshProjects` as `onSuccess` to all dialogs
4. Wire `ProjectCard` `onEdit` to open `EditProjectDialog` with the selected project
5. Wire `ProjectCard` `onRemove` to open `RemoveProjectDialog` with the selected project
6. Update empty state to mention the Add button

### Files to modify
- `src/app/page.tsx`

### Acceptance Criteria
- [ ] "Add Project" button is visible on the landing page
- [ ] Clicking "Add Project" opens the add dialog
- [ ] After successful add/edit/remove, project list refreshes automatically
- [ ] Refresh uses `cache: 'no-store'` to bypass 10-second cache
- [ ] Edit dialog opens with correct project data
- [ ] Remove dialog opens with correct project data
- [ ] Empty state mentions the ability to add projects manually
- [ ] Loading and error states still function correctly

### Test Coverage
- `src/app/page.test.tsx` (extend existing):
  - "Add Project" button is rendered
  - Projects refresh after mutation (mock fetch, verify second call)
  - Unavailable projects render with correct indicator
