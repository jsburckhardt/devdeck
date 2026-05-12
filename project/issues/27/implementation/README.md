# Implementation Notes — Issue #27

`fix: File explorer should reflect git status changes after in-portal edits`

## Files Changed

| File | Lines (approx.) | Purpose |
|---|---|---|
| `src/lib/workspace-context.tsx` | +35 / -2 (interface ~25-40, state ~80-81, callback ~165-185, value/deps ~205-250) | Add `refreshFileTree` + `fileTreeRefreshing` to context. |
| `src/components/workspace-layout.tsx` | +14 / -16 (imports 1-9, hook usage ~92-120) | Drop local `fetchTree`; mount-effect now wraps `refreshFileTree()` with `setFileTreeLoading(true/false)`. Comment added at the `ExplorerContent` prop site documenting the silent-refresh contract. |
| `src/components/file-viewer.tsx` | +3 / -1 (`useWorkspace` destructure ~233, `handleSave` success branch ~393-401) | Pull `refreshFileTree` from context; call `void refreshFileTree()` after `toast.success("File saved")`; dep array updated. |
| `src/lib/workspace-context.test.tsx` | +160 (new `describe` block at end) | New tests T1–T4. |
| `src/components/workspace-layout.test.tsx` | +118 (new file) | New tests T7, T8. |
| `src/components/file-viewer.test.tsx` | +148 (after 4.19) plus default-context update | New tests T5, T6a, T6b. `setupWorkspace` defaults updated for the new context fields. |

## Task → Change Map

| Task | Change |
|---|---|
| **27.1** Extend `WorkspaceContextValue` | `src/lib/workspace-context.tsx` — added `fileTreeRefreshing` state and `refreshFileTree` callback (silent refresh, no-store, no-op without project, never touches `fileTreeLoading`). |
| **27.2** Migrate initial load | `src/components/workspace-layout.tsx` — removed `fetchTree`; mount/slug-change effect now `setFileTreeLoading(true)` → `await refreshFileTree()` → `setFileTreeLoading(false)`. |
| **27.3** Wire success-only refresh in `FileViewer` | `src/components/file-viewer.tsx` — `void refreshFileTree();` immediately after `toast.success("File saved")`; failure / 409 / network paths unchanged. |
| **27.4** Spinner gated by `fileTreeLoading` only | Inline comment at `ExplorerContent` prop site in `workspace-layout.tsx`; regression test T8. |
| **27.5** Tests | T1–T8 implemented across the three test files (see mapping below). |

## Test → Case Map

| Test | File | Case name |
|---|---|---|
| T1 | `src/lib/workspace-context.test.tsx` | `T1: issues no-store GET against /api/files and updates fileTree on success` |
| T2 | `src/lib/workspace-context.test.tsx` | `T2: toggles fileTreeRefreshing true→false and never mutates fileTreeLoading` |
| T3 | `src/lib/workspace-context.test.tsx` | `T3: no-op when no active project — no fetch, refreshing stays false` |
| T4 | `src/lib/workspace-context.test.tsx` | `T4: preserves prior fileTree on non-OK and on rejection, logs error` |
| T5 | `src/components/file-viewer.test.tsx` | `T5: save success calls refreshFileTree exactly once after toast.success` |
| T6 | `src/components/file-viewer.test.tsx` | `T6a: save HTTP failure does NOT call refreshFileTree` and `T6b: save network rejection does NOT call refreshFileTree` |
| T7 | `src/components/workspace-layout.test.tsx` | `T7: initial mount calls refreshFileTree once and toggles fileTreeLoading true→false` |
| T8 | `src/components/workspace-layout.test.tsx` | `T8: ExplorerContent spinner is NOT rendered when only fileTreeRefreshing is true` |

Existing 4.17 / 4.18 / 4.19 / 5.4 save-flow tests were left intact and continue to pass.

## Verification — last 30 lines of each command

### `npm run lint`
```
> devdeck@0.1.0 lint
> eslint


/workspaces/devdeck/src/server/terminal-server.test.ts
  55:28  warning  '_p' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)
```
Pre-existing, unrelated warning in `terminal-server.test.ts`. No errors.

### `npm run format:check`
```
> devdeck@0.1.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!
```

### `npm run build`
```
✓ Compiled successfully in 8.2s
  Running TypeScript ...
  Finished TypeScript in 9.1s ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (0/8) ...
  Generating static pages using 11 workers (2/8)
  Generating static pages using 11 workers (4/8)
  Generating static pages using 11 workers (6/8)
✓ Generating static pages using 11 workers (8/8) in 500ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/files
├ ƒ /api/files/content
├ ƒ /api/files/diff
├ ƒ /api/projects
├ ƒ /api/projects/[slug]
└ ƒ /project/[slug]
```

### `npm test`
```
 ✓ src/components/workspace-layout.test.tsx (2 tests) 184ms
 ✓ src/app/page.test.tsx (6 tests) 804ms
 ✓ src/components/edit-project-dialog.test.tsx (3 tests) 1135ms
 ✓ src/components/project-card.test.tsx (5 tests) 1062ms
 ✓ src/components/error-boundary.test.tsx (3 tests) 411ms
 ✓ src/components/remove-project-dialog.test.tsx (1 test) 377ms
 ✓ src/components/add-project-dialog.test.tsx (2 tests) 1268ms
 ✓ src/components/file-viewer.test.tsx (29 tests) 2061ms

 Test Files  22 passed (22)
      Tests  201 passed (201)
   Start at  07:31:05
   Duration  12.96s
```

## Notes for the Verifier

- No new dependencies introduced.
- All ADRs / core-components followed: ADR-0002 (TS strict), CORE-COMPONENT-0006 (co-located `*.test.tsx`, Prettier defaults), CORE-COMPONENT-0007 (shell layout), CORE-COMPONENT-0008 (silent refresh contract — `fileTreeRefreshing` deliberately not surfaced to UI; spinner remains gated solely by `fileTreeLoading`).
- Decisions #59–#62 are honored:
  - **#59** `cache: "no-store"` on every refresh fetch.
  - **#60** `refreshFileTree` is a no-op without an active project and never mutates `fileTreeLoading`.
  - **#61** `refreshFileTree` is invoked **only** on the successful save path in `FileViewer.handleSave`.
  - **#62** Initial-load spinner remains driven by `fileTreeLoading`; subsequent refreshes are silent.
- `useEffect` dependency array in `WorkspaceLayout` includes `project.slug`, so switching tabs re-runs the loading sequence as required.
- `findFileStatus` continues to read from `fileTree`, so the existing `FileViewer` "Changes" tab will pick up the new status badge on the very next render after the silent refresh completes.
- Pre-existing TypeScript test-file errors (e.g. `Project.description` missing in `setupWorkspace`, `xterm` event-handler typing in `terminal-server.test.ts`) are not introduced by this change and remain out of scope per the planner's guidance.
