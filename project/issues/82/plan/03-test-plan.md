# Test Plan: Add Visible Close Project Action to Wide Workspace Controls

## Test 82-T1: Workspace close action renders with accessible semantics

- **Type:** Component unit
- **Task:** Task 82-1, Task 82-2
- **Priority:** High

### Setup
- Mock `useWorkspace()` with the default visible panel state.
- Mock `useOpenProjects()` with the current `project` open.
- Mock `useRouter()` with a spyable `push`.
- Render `WorkspaceLayout` with `project.name = "Demo"` and `project.slug = "demo"`.

### Steps
1. Query the button by role/name: `Close project Demo`.
2. Assert the button is in the document and visible to the accessibility tree.
3. Assert the button has `title="Close project Demo"`.
4. Assert the button does not have `aria-pressed`.

### Expected Result
The close action is discoverable, named for the current project, uses a native title, and is not exposed as a panel toggle.

## Test 82-T2: Workspace close action preserves panel toggle semantics

- **Type:** Component regression
- **Task:** Task 82-1, Task 82-2
- **Priority:** Medium

### Setup
- Render `WorkspaceLayout` with Explorer, File Preview, and Terminal visible.

### Steps
1. Collect button `aria-label` values for labels containing `Explorer`, `File Preview`, or `Terminal`.
2. Assert the list remains `Hide Explorer`, `Hide File Preview`, `Hide Terminal`.
3. Assert those three panel toggles still expose `aria-pressed`.
4. Assert the Close Project button is separate and has no `aria-pressed`.

### Expected Result
Adding Close Project does not change panel toggle ordering, guarded toggle behavior, or toggle accessibility semantics.

## Test 82-T3: Workspace close action navigates to adjacent project

- **Type:** Component unit
- **Task:** Task 82-1, Task 82-2
- **Priority:** High

### Setup
- Mock open projects as `[alpha, demo, beta]`.
- Render `WorkspaceLayout` for `demo`.
- Spy on `closeProject` and `router.push`.

### Steps
1. Click `Close project Demo`.
2. Assert `closeProject` is called once with `demo`.
3. Assert `router.push` is called once with `/project/beta`.

### Expected Result
The workspace close action mirrors the shared `closeNavigationTarget()` behavior for an active middle project.

## Test 82-T4: Workspace close action navigates home for the final project

- **Type:** Component unit
- **Task:** Task 82-1, Task 82-2
- **Priority:** High

### Setup
- Mock open projects as `[demo]`.
- Render `WorkspaceLayout` for `demo`.
- Spy on `closeProject` and `router.push`.

### Steps
1. Click `Close project Demo`.
2. Assert `closeProject` is called once with `demo`.
3. Assert `router.push` is called once with `/`.

### Expected Result
Closing the final open project exits the workspace route and returns the user to the landing page.

## Test 82-T5: Harness verification passes after implementation

- **Type:** Verification
- **Task:** Task 82-3
- **Priority:** High

### Setup
- Complete Task 82-1 and Task 82-2.
- Ensure no unrelated source or test files are changed.

### Steps
1. Run `./harness test`.
2. Run `./harness verify` before implementation handoff.

### Expected Result
Both harness commands pass. If either command fails, implementation remains incomplete until the failure is fixed or the plan is revised.
