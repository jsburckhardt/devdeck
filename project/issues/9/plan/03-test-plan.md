# Test Plan — Issue #9: Manual Project Tracking

All tests are co-located next to source files per CORE-COMPONENT-0006. Test runner: vitest + @testing-library/react + jsdom.

---

## Test T1: Registry — `loadRegistry` returns empty registry when file missing

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
- Mock `fs.readFile` to throw `ENOENT`

### Steps
1. Call `loadRegistry()`

### Expected Result
- Returns `{ version: 1, projects: [] }`
- Does not throw

---

## Test T2: Registry — `loadRegistry` parses valid JSON file

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
- Mock `fs.readFile` to return valid registry JSON with 2 entries

### Steps
1. Call `loadRegistry()`

### Expected Result
- Returns parsed registry with 2 project entries
- Entries have correct slug, path, source fields

---

## Test T3: Registry — `loadRegistry` handles corrupt JSON gracefully

- **Type:** Unit
- **Task:** Task 1
- **Priority:** Medium

### Setup
- Mock `fs.readFile` to return `"not valid json{"`

### Steps
1. Call `loadRegistry()`

### Expected Result
- Returns empty registry `{ version: 1, projects: [] }` (or throws a descriptive error)
- Does not crash with unhandled exception

---

## Test T4: Registry — `saveRegistry` writes atomically

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
- Mock `fs.writeFile`, `fs.rename`, `fs.mkdir`

### Steps
1. Call `saveRegistry({ version: 1, projects: [entry] })`

### Expected Result
- `fs.writeFile` called with temp file path and JSON content
- `fs.rename` called to move temp file to `registry.json`
- `fs.mkdir` called with `{ recursive: true }` to ensure data dir exists

---

## Test T5: Registry — `resolveProjectPath` returns registry path for known slug

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
- Mock `loadRegistry` to return registry with entry `{ slug: 'myproject', path: '/custom/path/myproject' }`

### Steps
1. Call `resolveProjectPath('myproject')`

### Expected Result
- Returns `'/custom/path/myproject'`

---

## Test T6: Registry — `resolveProjectPath` falls back for unknown slug

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
- Mock `loadRegistry` to return empty registry

### Steps
1. Call `resolveProjectPath('someslug')`

### Expected Result
- Returns `path.resolve(PROJECTS_DIR, 'someslug')`

---

## Test T7: Registry — `resolveProjectPath` sanitizes slug

- **Type:** Unit
- **Task:** Task 1
- **Priority:** Medium

### Setup
- Mock `loadRegistry` to return empty registry

### Steps
1. Call `resolveProjectPath('../etc/passwd')`

### Expected Result
- Returns path with sanitized slug `etcpasswd` (special chars stripped)

---

## Test T8: Registry — `detectLanguage` identifies supported languages

- **Type:** Unit
- **Task:** Task 1
- **Priority:** Medium

### Setup
- Mock `fs.readdir` to return different file lists for each case

### Steps
1. Call `detectLanguage` with dir containing `package.json` → "TypeScript"
2. Call with `Cargo.toml` → "Rust"
3. Call with `go.mod` → "Go"
4. Call with `requirements.txt` → "Python"
5. Call with no known files → "Unknown"

### Expected Result
- Each call returns the expected language string

---

## Test T9: GET /api/projects — returns auto-discovered projects with new fields

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
- Mock `fs.readdir` to return directory entries
- Mock `loadRegistry` to return empty registry
- Mock `fs.stat`, `fs.access` as needed

### Steps
1. Call `GET()` handler

### Expected Result
- Response includes projects with `path`, `source: 'auto'` fields
- Status 200

---

## Test T10: GET /api/projects — excludes hidden auto-discovered projects

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
- Mock `fs.readdir` to return `['projectA', 'projectB']`
- Mock `loadRegistry` to return registry with `{ slug: 'projectA', hidden: true }`

### Steps
1. Call `GET()` handler

### Expected Result
- Response contains only `projectB`
- `projectA` is excluded

---

## Test T11: GET /api/projects — includes manual registry entries

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
- Mock `loadRegistry` with manual entry `{ slug: 'external', path: '/other/external', source: 'manual' }`
- Mock `fs.access` to succeed for the path

### Steps
1. Call `GET()` handler

### Expected Result
- Response includes the manual project with `source: 'manual'`

---

## Test T12: GET /api/projects — marks inaccessible manual projects

- **Type:** Unit
- **Task:** Task 2
- **Priority:** Medium

### Setup
- Mock `loadRegistry` with manual entry pointing to non-existent path
- Mock `fs.access` to throw for that path

### Steps
1. Call `GET()` handler

### Expected Result
- Project included in response with `available: false`

---

## Test T13: POST /api/projects — happy path

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- Mock `fs.stat` to return directory stats for the given path
- Mock `loadRegistry` to return empty registry
- Mock `saveRegistry`

### Steps
1. Call `POST` with body `{ path: '/workspaces/newproject' }`

### Expected Result
- Returns 201 with project object containing derived slug `newproject`
- `saveRegistry` called with new entry

---

## Test T14: POST /api/projects — missing path returns 400

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- None

### Steps
1. Call `POST` with body `{}`

### Expected Result
- Returns 400 with error message

---

## Test T15: POST /api/projects — nonexistent path returns 400

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- Mock `fs.stat` to throw `ENOENT`

### Steps
1. Call `POST` with body `{ path: '/does/not/exist' }`

### Expected Result
- Returns 400 with error describing invalid path

---

## Test T16: POST /api/projects — slug collision returns 409

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- Mock `loadRegistry` with existing entry `{ slug: 'myproject' }`
- Mock `fs.stat` to succeed

### Steps
1. Call `POST` with body `{ path: '/other/myproject' }`

### Expected Result
- Returns 409 with conflict error message

---

## Test T17: PUT /api/projects/[slug] — updates metadata

- **Type:** Unit
- **Task:** Task 5
- **Priority:** High

### Setup
- Mock `loadRegistry` with entry `{ slug: 'proj', source: 'manual', name: 'Old' }`
- Mock `saveRegistry`

### Steps
1. Call `PUT` with slug `proj` and body `{ name: 'New Name' }`

### Expected Result
- Returns 200 with updated project
- `saveRegistry` called with updated name

---

## Test T18: PUT /api/projects/[slug] — unknown slug returns 404

- **Type:** Unit
- **Task:** Task 5
- **Priority:** High

### Setup
- Mock `loadRegistry` with empty registry

### Steps
1. Call `PUT` with slug `nonexistent` and body `{ name: 'Test' }`

### Expected Result
- Returns 404

---

## Test T19: DELETE /api/projects/[slug] — removes manual entry

- **Type:** Unit
- **Task:** Task 5
- **Priority:** High

### Setup
- Mock `loadRegistry` with manual entry `{ slug: 'manual-proj', source: 'manual' }`
- Mock `saveRegistry`

### Steps
1. Call `DELETE` with slug `manual-proj`

### Expected Result
- Returns 200
- `saveRegistry` called with entry removed from projects array

---

## Test T20: DELETE /api/projects/[slug] — hides auto-discovered project

- **Type:** Unit
- **Task:** Task 5
- **Priority:** High

### Setup
- Mock `loadRegistry` with empty registry
- Mock auto-discovered projects to include slug `auto-proj`

### Steps
1. Call `DELETE` with slug `auto-proj`

### Expected Result
- Returns 200
- `saveRegistry` called with new entry `{ slug: 'auto-proj', hidden: true }`

---

## Test T21: ProjectCard — renders edit and remove buttons

- **Type:** Component
- **Task:** Task 7
- **Priority:** High

### Setup
- Render `ProjectCard` with mock project and `onEdit`/`onRemove` callbacks

### Steps
1. Find edit and remove buttons
2. Click edit button
3. Click remove button

### Expected Result
- `onEdit` called once; navigation not triggered
- `onRemove` called once; navigation not triggered

---

## Test T22: ProjectCard — shows unavailable indicator

- **Type:** Component
- **Task:** Task 7
- **Priority:** Medium

### Setup
- Render `ProjectCard` with `project.available = false`

### Steps
1. Check for unavailable visual indicator

### Expected Result
- Card shows warning/unavailable styling or icon

---

## Test T23: Add Project Dialog — submits and shows toast

- **Type:** Component
- **Task:** Task 6
- **Priority:** High

### Setup
- Render `AddProjectDialog` with `open={true}` and mock `onSuccess`
- Mock `fetch` to return 201

### Steps
1. Type path into input field
2. Click submit button

### Expected Result
- `fetch` called with `POST /api/projects` and correct body
- `onSuccess` callback called
- Toast shown (verify `sonner` toast call)

---

## Test T24: Add Project Dialog — shows 409 conflict error

- **Type:** Component
- **Task:** Task 6
- **Priority:** High

### Setup
- Render `AddProjectDialog` with `open={true}`
- Mock `fetch` to return 409

### Steps
1. Type path into input
2. Click submit

### Expected Result
- Error message about slug conflict displayed in dialog
- Dialog remains open

---

## Test T25: Landing page — Add Project button renders and opens dialog

- **Type:** Component
- **Task:** Task 8
- **Priority:** High

### Setup
- Render `Home` page component
- Mock `fetch` for `/api/projects` to return project list

### Steps
1. Find "Add Project" button
2. Click it

### Expected Result
- Button is present in the DOM
- Add Project dialog opens (dialog element becomes visible)

---

## Test T26: Landing page — refreshes after mutation

- **Type:** Component
- **Task:** Task 8
- **Priority:** High

### Setup
- Render `Home` page component
- Mock `fetch` — first call returns initial projects, second call returns updated list

### Steps
1. Wait for initial load
2. Trigger `onSuccess` callback (simulate successful mutation)

### Expected Result
- `fetch` called twice for `/api/projects`
- Second call uses `cache: 'no-store'`
- UI updates to reflect new project list

---

## Test T27: File API routes — use async `resolveProjectPath` from registry

- **Type:** Unit
- **Task:** Task 3
- **Priority:** Medium

### Setup
- Mock `resolveProjectPath` from `@/lib/registry`

### Steps
1. Verify import in `src/app/api/files/route.ts` references `@/lib/registry`
2. Verify import in `src/app/api/files/content/route.ts` references `@/lib/registry`

### Expected Result
- No imports from `@/app/api/projects/route` for `resolveProjectPath`
- `resolveProjectPath` is awaited in both files
