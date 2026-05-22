# Research Brief — Issue #42

## Issue

- **Number:** #42
- **Title:** feat(file-explorer): filter `.git` and other noise directories from the file tree
- **Repository:** jsburckhardt/devdeck
- **Description:** The file explorer currently shows ALL filesystem entries including
  `.git`, `node_modules`, `.next`, and other internal tool directories. These entries are
  noise for most users. Issue #42 requests server-side filtering of these directories
  from the file tree to improve UX without sacrificing the ability to see project files.

---

## Scope Classification

- **scope_type:** `issue`
- **Rationale:** This is a targeted change to the file-tree API endpoint and its tests.
  It does NOT introduce a new technology, persistence model, or cross-cutting pattern.
  It DOES require updating CORE-COMPONENT-0008 (which holds the current "all-files
  visibility" mandate) and superseding Decision #72 in the DECISION-LOG. Those document
  updates are mandatory side-effects of this issue, not new architectural decisions
  requiring a new ADR. The planner will amend CORE-COMPONENT-0008 and update
  DECISION-LOG.md.

---

## Problem Analysis

### Current Behavior

The API at `GET /api/files` calls `fs.readdir()` and returns every entry to the client
with no filtering whatsoever (`src/app/api/files/route.ts:120`). This was an explicit
design decision: Decision #72 ("Preserve all-files visibility; prohibit performance
hide-lists in file tree", DECISION-LOG.md:99) was adopted on 2026-05-13 as part of the
issue #32 all-files-visibility feature.

CORE-COMPONENT-0008 rules at lines 56–57 state:

> "The file-tree API MUST preserve all-files visibility: dotfiles, lockfiles, `.git`,
> `.next`, `node_modules`, and other filesystem entries MUST NOT be hidden by hardcoded
> performance filters."
>
> "File-tree performance MUST come from lazy direct-child loading, request deduplication,
> and stale-response guards; it MUST NOT come from a hardcoded hide-list."

Line 119 reinforces this in Expectations:

> "Lazy loading MUST preserve issue #32 all-files visibility; users must still see
> dotfiles, lockfiles, `.git`, `.next`, `node_modules`, unreadable entries, and non-regular
> entries."

And the Rationale (line 125) states:

> "A hardcoded hide-list was rejected because it would regress the visibility contract
> and hide real project state from users."

### The UX Problem Issue #42 Addresses

While the lazy-loading introduced in issue #32 solved the **performance** problem (no
more depth-6 eager traversal into `node_modules`), the **UX** problem remains:

- `.git` has hundreds of internal object entries (packs, refs, objects) that are
  meaningless to browse and confusing to new users.
- `node_modules` can contain thousands of package directories, overwhelming the tree.
- `.next` contains build artifacts — an implementation detail, never user-browsed.

Users of typical code editors (VS Code, Codespaces, JetBrains IDEs) see these entries
hidden by default, with an opt-in to show them. DevDeck's current all-files default is
the outlier, not the norm.

### Why This Is Now Safe to Change

The original rationale for Decision #72 was **performance**, not UX preference:
hiding entries was rejected to avoid silently concealing real project state. Now that:

1. Lazy loading is in place (direct-child only, no recursive traversal), and
2. The UX cost of showing `.git` etc. is understood to be real and negative,

a **smart default exclusion list** is the correct evolution — especially if it can be
overridden by the user.

---

## Codebase Investigation

### `src/app/api/files/route.ts`

- **Lines 110–192:** `readDirectoryChildren()` calls `fs.readdir(dirPath, { withFileTypes: true })`
  (line 120) and processes every returned entry with no filtering. The resulting `nodes`
  array is returned directly.
- **No `EXCLUDED_DIRS`, no filter predicate, no opt-in/opt-out logic exists.**
- The `GET` handler (lines 216–283) passes all entries from `readDirectoryChildren()`
  directly to `NextResponse.json()`.
- The `readDirectoryChildren` function accepts `dirPath`, `projectRoot`, and `gitStatus`
  — it does NOT accept a filter/exclusion parameter. Adding one would be a clean,
  backwards-compatible extension.

### `src/app/api/files/route.test.ts`

Two tests explicitly assert that no filtering occurs and would need to be updated:

1. **"TP5 preserves all-files visibility in path-scoped requests"** (line 188–218):
   Sets up a mock directory containing `.git`, `.next`, `node_modules`, `.env`,
   `package-lock.json` and asserts ALL five are returned in that exact order.
   This test name and assertion directly encode Decision #72.

2. **"TP1 includes hidden/config/dependency entries instead of filtering them"** (line 221–248):
   Mocks the root with `.devcontainer`, `.git`, `node_modules`, `package-lock.json`,
   `.env`, `src` and asserts all six are returned.

Both tests must be updated/replaced to assert the new filtering behavior. Existing tests
TP1–TP4 (the first describe block, lines 70–186) test lazy loading, path scoping,
traversal rejection, and directory state — these do NOT assert filtering and will not
need to change.

### `src/components/file-tree.tsx`

- Pure rendering component, no filtering logic (lines 1–276).
- Renders whatever `nodes: FileNode[]` it receives from the workspace context.
- No changes needed to the component itself if filtering is done server-side.

### `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md`

The binding constraints that must be superseded:

| Location | Current Rule |
|----------|--------------|
| Line 56 | "The file-tree API MUST preserve all-files visibility…" |
| Line 57 | "File-tree performance MUST come from lazy direct-child loading … it MUST NOT come from a hardcoded hide-list" |
| Line 119 | "Lazy loading MUST preserve issue #32 all-files visibility…" |
| Line 125 (Rationale) | "A hardcoded hide-list was rejected…" |
| Line 229 (Enforcement) | "Lazy file-tree work must preserve all-files visibility with no hardcoded hide-list" |

### `project/architecture/ADR/DECISION-LOG.md`

- **Decision #72** (line 99): "Preserve all-files visibility; prohibit performance
  hide-lists in file tree" — Source: CORE-COMPONENT-0008, Date: 2026-05-13.
  This decision must be superseded.

---

## Proposed Approach

### Server-Side Filtering in the API Route

Filtering belongs in `src/app/api/files/route.ts`, inside `readDirectoryChildren()`,
as a small set of names to exclude before building the `nodes` array.

### Default Exclusion List

Recommended **minimal default** (safest, least controversial):

```typescript
const DEFAULT_EXCLUDED_DIRS = new Set([".git"]);
```

Rationale: `.git` is universally safe to hide — no user ever needs to browse
`.git/objects/pack/` or `.git/refs/remotes/`. Unlike `node_modules`, `.git` contains
no browsable user code; it is an internal VCS database.

### Implementation Pattern

```typescript
// In readDirectoryChildren(), after fs.readdir():
const EXCLUDED_NAMES = new Set([".git"]);

const classifiedEntries = await Promise.all(
  entries
    .filter((entry) => !EXCLUDED_NAMES.has(entry.name))
    .map(async (entry) => { ... }),
);
```

---

## ADR / Core-Component Requirements

### No New ADR Required

This change does not introduce a new framework, dependency, storage model, or
authentication pattern. It amends an existing behavior rule within an existing
core-component.

### CORE-COMPONENT-0008 Must Be Updated

The planner must update CORE-COMPONENT-0008 to replace the all-files-visibility mandate
with a smart-defaults rule, and update the DECISION-LOG to supersede Decision #72.

---

## Risks & Trade-offs

| Risk | Assessment |
|------|------------|
| Filtering `.git` hides real project data | Low. `.git` internals are VCS database entries. VS Code, Codespaces, JetBrains all hide `.git` by default. |
| Filtering `node_modules` hides dependency code some users want | Medium. Some developers legitimately inspect node_modules. Starting with `.git` only is conservative. |
| Tests explicitly named for all-files visibility will fail | Certain. These tests must be rewritten. |
| Future API consumers may rely on `.git` appearing | Low. The API is internal to this app. |

---

## Open Questions

1. **Exclusion list scope:** Should the initial implementation filter only `.git`, or also
   `node_modules` and `.next`? Recommend: `.git` only for minimal controversy.

2. **Subdirectory filtering:** Should exclusion apply at all directory levels, or root only?
   Recommend: all levels for consistency.

3. **User override mechanism:** Is a query parameter (`?showExcluded=true`) in scope?
   Recommend: defer to follow-up issue.

4. **Test name alignment:** Tests named for all-files visibility should be replaced with
   new tests asserting the exclusion behavior.
