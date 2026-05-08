# Research Brief — Issue #12

## Problem Statement

DevDeck currently requires the user to navigate **back to the landing page** to switch between projects, destroying all workspace UI state in the process. Issue #12 requests a **persistent vertical sidebar on the left edge** that shows open project tabs; clicking a tab navigates to that project instantly. The sidebar persists open projects in `localStorage` and is visible as long as at least one project has been opened.

The user's critical requirement is: **"projects on the sidebar are considered open so everything in that workspace should keep as is while jumping around"** — workspace UI state (selected file, expanded folders, panel visibility) must be preserved across tab switches, not just the terminal session.

## Scope Classification

- **scope_type:** `issue`
- **Issue Number:** 12

---

## Codebase Analysis

### Current Navigation Flow

```
Landing Page (/) → [click project card] → /project/[slug] → [click back arrow] → /
```

`src/app/project/[slug]/page.tsx` mounts `<WorkspaceProvider>` and `<WorkspaceLayout>` as children of a top-level `<div className="flex h-screen flex-col">`. When the user navigates away (back button calls `router.push("/")`), the entire component tree — including `WorkspaceProvider` and all its state — is **unmounted and garbage collected**. State is completely ephemeral today.

### Root Layout (`src/app/layout.tsx`)

The root layout is a **Server Component** wrapping `<ThemeProvider>{children}</ThemeProvider>` and `<Toaster />`. There is **no persistent shell** today — no sidebar, no global state beyond theme. Adding a sidebar here requires introducing a client-side wrapper below `ThemeProvider` but above `{children}`.

**Key constraint:** Anything touching `localStorage` or React state must be a Client Component. The root `layout.tsx` itself is a Server Component and must stay that way for SSR metadata.

### WorkspaceContext (`src/lib/workspace-context.tsx`)

The `WorkspaceProvider` holds 7 state values scoped to a single project:

| State field | Type | Notes |
|---|---|---|
| `project` | `Project \| null` | Current project metadata |
| `selectedFile` | `string \| null` | Open file path |
| `expandedFolders` | `Set<string>` | Not JSON-serializable directly |
| `showFileViewer` | `boolean` | Panel visibility |
| `showTerminal` | `boolean` | Panel visibility |
| `fileTree` | `FileNode[]` | File system tree (fetched from `/api/files`) |
| `fileTreeLoading` | `boolean` | Loading indicator |

`setProject()` at line 37–42 **resets all state** when a new project is set. This is the current single-project assumption baked into the context.

### WorkspaceLayout (`src/components/workspace-layout.tsx`)

Uses `react-resizable-panels` `<Group>` at lines 150–181. The `<Group>` is the inner workspace — **the sidebar must sit outside this Group** as a sibling, matching the intent already noted in CORE-COMPONENT-0007.

### Terminal (`src/hooks/use-terminal.ts` + `src/components/terminal-panel.tsx`)

The terminal connects to `/api/terminal?slug=<slug>` via WebSocket. The backend uses tmux: if `.devcontainer/.tmux-shared` exists, it attaches to a named tmux session keyed by the sanitized slug (decisions #44–#46 in DECISION-LOG.md).

**Terminal state preservation is already solved server-side:** reconnecting to the same slug reattaches to the existing tmux session. Running processes, shell history, and working directory all survive navigation. No changes are needed to the terminal layer for this feature.

### ProjectCard (`src/components/project-card.tsx`)

Contains `languageColor()` (lines 21–40) mapping language names to Tailwind color classes. This utility should be **reused or co-located** in the new sidebar component for consistent language dot colors on sidebar tabs.

### Header (`src/components/header.tsx`)

The header's back button calls `router.push("/")`. With the sidebar in place, the back button on the project page remains functional for users who open a project directly via URL.

### Authentication / Middleware (`src/middleware.ts`)

Client-side navigation (`router.push()`) does not re-run middleware, so tab switching via sidebar navigation is transparent to auth. No changes needed here.

---

## Key Dependencies

| Dependency | Already Available | Relevance |
|---|---|---|
| `framer-motion` ^12.38.0 | ✅ | Tab entry/exit animation |
| `@phosphor-icons/react` ^2.1.10 | ✅ | Tab icons, close button |
| `react-resizable-panels` ^4.11.0 | ✅ | Shell layout (sidebar is outside Group) |
| `localStorage` | Native browser API | Open project slugs + workspace state cache |

---

## Proposed Architecture

### Option A — Root-Level Open Projects Context (Recommended)

Introduce a new `OpenProjectsProvider` at the root layout level. This provider:

1. Stores `openProjects: Project[]` (ordered tab list) in React state
2. Persists the **slug list** to `localStorage` (not full project data — re-fetch on reload)
3. Caches per-project workspace UI state in a `Map<slug, PerProjectWorkspaceState>` in memory
4. Exposes `openProject(project)`, `closeProject(slug)`, `saveWorkspaceState()`, `restoreWorkspaceState()`

The `WorkspaceProvider` is modified to:
- On mount: call `restoreWorkspaceState(slug)` and hydrate from cache if available
- On unmount (or state change): call `saveWorkspaceState(slug, currentState)` to write to the cache

This means workspace UI state survives navigation entirely in React memory (no serialization needed during a session). On cold page load, the slug list is restored from `localStorage` and project metadata is re-fetched from `/api/projects`, but the workspace UI state starts fresh (acceptable — the user just loaded the page).

```typescript
interface PerProjectWorkspaceState {
  selectedFile: string | null;
  expandedFolders: string[];   // Array, not Set — serializable
  showFileViewer: boolean;
  showTerminal: boolean;
  fileTree: FileNode[];
}
```

### Option B — All Projects Mounted/Hidden (Rejected)

Mount all open project workspaces simultaneously, show only the active one via CSS `display:none`. Preserves 100% of state including terminal DOM.

**Rejected because:** mounting N xterm.js terminal instances simultaneously (each with a live WebSocket + ResizeObserver + PTY connection) is expensive.

### Option C — Serialize All State to localStorage (Rejected)

**Rejected because:** `fileTree` can be large and frequent writes to localStorage are wasteful.

**Verdict:** Option A with in-memory state cache + localStorage for slug list only.

---

## Shell Layout Change

The cleanest injection point is a new **intermediate layout** at `src/app/project/layout.tsx`. This keeps the landing page completely unaffected and naturally scopes the sidebar to project pages only.

```
src/app/layout.tsx           ← Adds OpenProjectsProvider (client wrapper)
src/app/project/layout.tsx   ← NEW: adds ProjectSidebar + flex-row shell
src/app/project/[slug]/page.tsx ← Calls openProject() on mount
```

---

## Affected Files

### Must Create
| File | Purpose |
|---|---|
| `src/lib/open-projects-context.tsx` | Root-level context for open tabs + workspace state cache |
| `src/components/project-sidebar.tsx` | Vertical sidebar with project tabs |
| `src/app/project/layout.tsx` | Intermediate layout adding sidebar to all project pages |

### Must Modify
| File | Change |
|---|---|
| `src/app/layout.tsx` | Wrap children with `OpenProjectsProvider` client wrapper |
| `src/lib/workspace-context.tsx` | Connect to `OpenProjectsProvider` for state save/restore |
| `src/app/project/[slug]/page.tsx` | Call `openProject()` on mount; simplify layout |
| `src/lib/types.ts` | Add `PerProjectWorkspaceState` interface |
| `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md` | Update to document sidebar slot |

---

## ADR / Core-Component Impact

### CORE-COMPONENT-0007 (Shell Layout) — Update Required

Must be extended to include the sidebar slot as a new positional rule.

### New Core-Component Proposed

**Proposed title:** `CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State`

Documents the `OpenProjectsProvider` contract, localStorage slug persistence, in-memory state cache, and save/restore lifecycle.

### No New ADR Required

This feature extends existing conventions. No new technology or irreversible constraint.

---

## Risk Analysis

| Risk | Severity | Mitigation |
|---|---|---|
| `Set<string>` serialization | Low | Convert to `string[]` at save/restore boundary |
| Stale slugs in localStorage | Low | Cross-reference with `/api/projects` on mount, prune stale |
| Tab count overflow | Low | Scrollable sidebar with compact tab height |
| Cross-context dependency | Medium | `WorkspaceProvider` calls `OpenProjectsProvider` functions but remains decoupled |
| Terminal disconnect on tab switch | Low | By design — tmux reattachment is fast and preserves state |

---

## Non-Goals

- Full state serialization to localStorage (in-memory only, lost on refresh)
- Drag-to-reorder tabs
- Project favicon/custom icon in sidebar
- Persisting panel resize proportions

---

## References

- `src/app/layout.tsx` — Root layout (Server Component, must remain so)
- `src/app/project/[slug]/page.tsx:65–74` — Current project page structure
- `src/lib/workspace-context.tsx:6–14` — WorkspaceState interface
- `src/lib/workspace-context.tsx:28–42` — WorkspaceProvider with single-project assumption
- `src/components/workspace-layout.tsx:150–181` — react-resizable-panels Group
- `src/components/project-card.tsx:21–40` — `languageColor()` function to reuse
- `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md` — Shell rules
- `project/architecture/core-components/CORE-COMPONENT-0004-theming.md` — CSS variables
- `project/architecture/ADR/DECISION-LOG.md:44–46` — tmux session attach decisions
