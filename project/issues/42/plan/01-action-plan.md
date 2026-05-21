# Action Plan: Filter `.git` and noise directories from the file tree

## Feature
- **ID:** 42
- **Research Brief:** project/issues/42/research/00-research.md

## ADRs Created
- None — this is a scoped issue change, not a new architectural decision.

## Core-Components Updated
- **CORE-COMPONENT-0008** (Multi-Project Tabs and Workspace State) — Updated to replace the all-files visibility mandate with a server-side default exclusion list for noise directories, and superseded Decision #72 with Decision #73 in DECISION-LOG.md.

## Implementation Tasks

### Goal
Add server-side directory filtering to the file-tree API so that internal tooling directories (specifically `.git`) are excluded from API responses, improving UX without sacrificing visibility of user-relevant entries.

### Approach
1. **Add `EXCLUDED_NAMES` constant** — Define `const EXCLUDED_NAMES = new Set([".git"]);` as a module-level constant in `src/app/api/files/route.ts`.
2. **Filter entries in `readDirectoryChildren()`** — Insert a `.filter()` call on `entries` before the `Promise.all(entries.map(...))` call to exclude entries whose names are in `EXCLUDED_NAMES`.
3. **Filtering applies at all directory levels** — Because `readDirectoryChildren()` is called for both root and path-scoped requests, the filter applies universally (not just at root).

### Scope
- Only `.git` is in the default exclusion list. `node_modules`, `.next`, and other directories remain visible.
- No client-side changes needed — `file-tree.tsx` renders whatever the API returns.
- No query parameter override (e.g., `?showExcluded=true`) in this issue — deferred to a follow-up.

### Key Constraints
- Decision #73 (CORE-COMPONENT-0008): Server-side exclusion list must filter `.git` by default at all directory levels.
- Dotfiles (`.env`, `.devcontainer`), lockfiles (`package-lock.json`), `node_modules`, `.next`, and other user-relevant entries MUST remain visible.
- Lazy loading, request deduplication, and stale-response guards remain the primary performance mechanisms.
