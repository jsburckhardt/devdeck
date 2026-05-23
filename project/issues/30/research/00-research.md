# Research Brief — Issue #30: Visualize git worktrees from .trees/ directory with terminal integration and sidebar enhancement

## Meta

| Field | Value |
|-------|-------|
| Issue | GitHub Issue #30 |
| Scope type | `issue` |
| Stage | Research |
| Date | 2026-05-27 |

---

## 1. Problem Statement

DevDeck developers who use `git worktree` with the `.trees/` convention have no UI to discover, navigate, or open terminals scoped to individual worktrees. The current workspace shows only the main project file tree and opens a terminal in the project root. Additionally, the project sidebar is 48 px wide showing only the first letter of a project name — barely useful when multiple projects are open. Together these gaps force developers to manually `cd` into `.trees/<branch>` in the terminal, with no visual inventory of existing worktrees and no quick way to switch terminal context.

The fix involves five coordinated areas:
1. A new `GET /api/worktrees?slug=<slug>` endpoint parsing `git worktree list --porcelain` and filtering to `.trees/`-relative entries.
2. A `useWorktrees` React hook for client-side data fetching.
3. A `WorktreeTree` component rendered above `FileTree` in the Explorer panel, with per-worktree "Open Terminal" affordances.
4. Extension of `useTerminal` and the terminal server to accept a `worktree` query parameter, spawning a shell-only PTY in the worktree directory (bypassing the tmux decision tree).
5. A wider project sidebar (~176 px) displaying project names as visible text labels.

---

## 2. Scope Classification

**`issue`** — self-contained feature addition. No new ADRs are required. Three existing core-components require targeted updates:

| Document | Change type |
|----------|-------------|
| CORE-COMPONENT-0003 | Add `worktree` WebSocket query param, `extractWorktree` function, and shell-only-mode contract |
| CORE-COMPONENT-0007 | Update sidebar width rule ~48 px → ~176 px; add project-name display rule |
| CORE-COMPONENT-0008 | Add `activeWorktree` / `worktreesSectionCollapsed` workspace state; `useWorktrees` hook and `WorktreeTree` render rules |

---

## 3. Existing Codebase Analysis

### 3.1 `.gitignore` — Current State

**Citation:** `.gitignore:29`

```
.trees/*
```

Currently uses glob `.trees/*` — ignores files *inside* `.trees/` but not the directory entry itself. Issue requests changing to `.trees/` for consistent directory-level exclusion matching the `git worktree` convention. One-line change, zero code impact.

---

### 3.2 API Route Pattern

**Citation:** `src/app/api/files/route.ts:220-287`, `src/app/api/projects/route.ts:9-109`

All existing API routes follow:
- `NextRequest`/`NextResponse` with structured JSON errors `{ error, code, details? }`
- `resolveProjectPath(slug)` called server-side (Decision #43)
- `Cache-Control: private, max-age=N, stale-while-revalidate=M` headers
- `execFileAsync` from `child_process` for git subprocesses (pattern in `files/route.ts:9`)

The new `GET /api/worktrees?slug=<slug>` route must follow this exact pattern. No `Worktree` type currently exists in `src/lib/types.ts`.

---

### 3.3 `src/lib/types.ts` — Current State

**Citation:** `src/lib/types.ts:1-86`

Defines: `Project`, `ProjectRegistryEntry`, `ProjectRegistry`, `FileKind`, `FileNode`, `FileContent`, `DiffLine`, `DiffHunk`, `PerProjectWorkspaceState`.

**Missing — must add:**

```typescript
export interface Worktree {
  path: string;      // absolute filesystem path to the worktree
  branch: string;    // e.g. "refs/heads/feature/foo" or "(detached)"
  commit: string;    // HEAD commit SHA
  name: string;      // basename of the worktree under .trees/
  isMain: boolean;   // always false for .trees/ entries
}
```

`PerProjectWorkspaceState` (lines 77-85) is missing:
- `activeWorktree: string | null`
- `worktreesSectionCollapsed: boolean`

These must be added for per-tab cache persistence (consistent with `showFileViewer`, `showTerminal` — saved/restored in `workspace-context.tsx:159-172`).

---

### 3.4 `src/lib/workspace-context.tsx` — Current State

**Citation:** `src/lib/workspace-context.tsx:15-39`

`WorkspaceState` currently holds `project`, `selectedFile`, `expandedFolders`, `showFileViewer`, `showTerminal`, `fileTree`, `fileTreeLoading`, `fileTreeError`, `directoryLoading`, `directoryErrors`.

State is saved to cache on unmount (lines 159-172) and restored on mount (lines 108-109). The `stateRef` tracking pattern (lines 139-157) must be extended for the new fields.

**Missing — must add to both `WorkspaceState` and `WorkspaceContextValue`:**
- `activeWorktree: string | null`
- `worktreesSectionCollapsed: boolean`
- `setActiveWorktree: (path: string | null) => void`
- `toggleWorktreesSection: () => void`

---

### 3.5 `src/hooks/use-terminal.ts` — Current State

**Citation:** `src/hooks/use-terminal.ts:14-49`

`UseTerminalOptions` (lines 14-17):
```typescript
export interface UseTerminalOptions {
  wsUrl?: string;
  slug?: string;
  theme?: ITheme;
}
```

`buildWsUrl` (lines 39-49) currently only sets `slug`, `cols`, `rows`. `baseWsUrl` is derived at line 59 from `buildWsUrl(options?.slug)`.

**Required changes:**
1. Add `worktree?: string` to `UseTerminalOptions`.
2. `buildWsUrl` signature becomes `buildWsUrl(slug?: string, worktree?: string, cols?: number, rows?: number)` and sets `worktree` param when provided.
3. The `worktree` value passed is the **relative path** (e.g. `.trees/feature-branch`) — server resolves absolute path server-side (Decision #43).

---

### 3.6 `src/server/terminal-server.mts` — Current State

**Citation:** `src/server/terminal-server.mts:85-190`

Key functions:
- `extractSlug(req)` (lines 85-92) — reads `slug` from URL query params.
- `extractDimensions(req)` (lines 94-105) — reads `cols`/`rows` with clamping.
- `resolveTerminalSetup(slug, defaultCwd, shell, shellArgs)` (lines 130-190) — three-branch tmux decision tree.
- `handleConnection(ws, slug, ...)` (lines 228-451) — async PTY lifecycle.
- `wss.on('connection', ...)` (lines 469-494) — calls `extractSlug`, `extractDimensions`.

**Required additions:**
1. New `extractWorktree(req: IncomingMessage): string | null` — reads `worktree` query param; rejects absolute paths and `..` segments; returns sanitized relative path or `null`.
2. Modify `resolveTerminalSetup` to accept `worktree: string | null` as a new parameter. When `worktree` is non-null: resolve `<resolvedCwd>/<worktree>`, verify path is within project root, return `{ command: shell, args: shellArgs, cwd: worktreeAbsPath, mode: "shell" }` — bypassing the entire tmux branch.
3. Pass `worktree` from `wss.on('connection')` → `handleConnection` → `resolveTerminalSetup`.
4. Worktree terminal sessions always result in `{ type: "setup", mode: "shell" }` (the `spawnAndWirePty` function at lines 390-421 already handles this when `isTmux=false`).

---

### 3.7 `src/components/workspace-layout.tsx` — Current State

**Citation:** `src/components/workspace-layout.tsx:51-98, 203-215, 243-253`

`ExplorerContent` (lines 51-98) renders a header "Explorer" then either a spinner, error+retry, or `<FileTree nodes={nodes} />`.

`WorkspaceLayout` (lines 104-257) renders:
- Explorer panel (lines 208-215): `<ExplorerContent ...>`
- Terminal panel (lines 243-253): `<TerminalPanel slug={project.slug} />`

**Required changes:**
1. Render `<WorktreeTree slug={project.slug} />` above the loading/FileTree content inside `ExplorerContent` (or directly in the explorer panel before `ExplorerContent`). Always mounted per Decision #84.
2. When `activeWorktree` is set in context, render a worktree-scoped terminal. Two approaches:
   - **Preferred:** Add a third panel below the existing terminal for the worktree terminal, collapsible when `activeWorktree` is null.
   - **Alternative:** Extend `TerminalPanel` to accept `worktree?` prop and switch its `useTerminal` options.
   The issue states "shell-only mode" — either approach achieves this via `useTerminal({ slug, worktree: activeWorktree })`.

---

### 3.8 `src/components/project-sidebar.tsx` — Current State

**Citation:** `src/components/project-sidebar.tsx:8-74`

```tsx
// Line 16 — nav width
<nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/50 py-2">

// Lines 38-48 — project tab button (square, letter only)
<button className="flex h-9 w-9 items-center justify-center rounded-md text-xs font-bold text-white ...">
  {project.name.charAt(0).toUpperCase()}
</button>
```

CORE-COMPONENT-0007 line 30: `"fixed-width sidebar (~48px)"` — must be updated.
CORE-COMPONENT-0008 line 39: `"fixed-width vertical strip (~48px)"` — must be updated.
CORE-COMPONENT-0008 line 40: `"display the first letter of the project name"` — must be updated.
Decision #47 (DECISION-LOG:77): `"~48px"` — to be superseded by new Decision #88-89.
Decision #53 (DECISION-LOG:83): `"native title attribute"` — PRESERVED (title attr stays, tooltip dependency still prohibited).

**Required changes:**
```tsx
// Nav — wider
<nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-card/50 py-2">

// Home button — full width
<button className="flex h-9 w-full items-center gap-2 rounded-md px-2 ...">
  <House size={20} weight="bold" />
  <span className="truncate text-xs">Home</span>
</button>

// Project tab — badge + name
<button className="flex h-9 w-full items-center gap-2 rounded-md px-2 ...">
  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white ${languageColor(project.language)}`}>
    {project.name.charAt(0).toUpperCase()}
  </span>
  <span className="truncate text-xs">{project.name}</span>
</button>
```

---

### 3.9 `src/components/file-tree.tsx` — Current State

**Citation:** `src/components/file-tree.tsx:257-273`

`FileTree` is a pure component accepting `nodes: FileNode[]` with no worktree awareness. `WorktreeTree` will be a **separate, sibling component** — not a modification of `FileTree`.

---

### 3.10 Existing Test Patterns

Co-located `*.test.tsx` / `*.test.ts` files exist alongside every component and hook. New files each need a co-located test file. The vitest + `@testing-library/react` stack is used throughout; `execFileAsync` is mocked using `vi.mock('child_process')` in `src/app/api/files/route.test.ts` as reference pattern.

---

## 4. Affected ADRs and Core-Components

### 4.1 CORE-COMPONENT-0003 — WebSocket Terminal Communication

**File:** `project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md`

**Proposed additions to Rules section:**
1. The client MAY pass `worktree=<relative-path>` (e.g. `.trees/feature-branch`) as a query parameter on the WebSocket upgrade URL to open a terminal scoped to a git worktree directory.
2. When `worktree` is present, the server MUST resolve CWD to `<resolvedProjectRoot>/<relativeWorktreePath>` and MUST bypass the tmux decision tree entirely, spawning a plain login shell in the worktree directory.
3. The server MUST reject `worktree` paths containing `..` segments or resolving outside the project root; on rejection, fall back to the project root shell.
4. A `extractWorktree(req: IncomingMessage): string | null` function MUST be added to `terminal-server.mts` to extract and sanitize the `worktree` query param before it reaches `resolveTerminalSetup`.
5. Worktree terminal sessions MUST always result in `{ type: "setup", mode: "shell" }` sent to the client.

**Proposed update to Interfaces section:**
- WebSocket endpoint: `/api/terminal?token=<bearer>&slug=<project-slug>&worktree=<relative-path>&cols=<N>&rows=<N>` — `worktree` is optional; when present combined with `slug`, overrides CWD to the worktree directory in shell-only mode.
- Frontend hook: `useTerminal(options?: { slug?, worktree?, wsUrl?, theme? })` — add `worktree` to options.

---

### 4.2 CORE-COMPONENT-0007 — Shell Layout

**File:** `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md`

**Proposed rule updates:**
- Line 30: `"a fixed-width sidebar (~48px) MUST render..."` → `"a fixed-width sidebar (~176px) MUST render..."`
- Add rule: `"Each sidebar tab MUST display the project's language-color badge and the project name as a visible truncated text label."`
- Supersede Decision #47 with new Decision #88.

---

### 4.3 CORE-COMPONENT-0008 — Multi-Project Tabs and Workspace State

**File:** `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md`

**Proposed rule updates:**
- Line 39: `"fixed-width vertical strip (~48px)"` → `"(~176px)"`
- Line 40: `"first letter of the project name"` → `"language-color badge (first letter) and project name as a visible truncated text label"`

**Proposed rule additions:**
1. `WorkspaceContext` MUST expose `activeWorktree: string | null` and `setActiveWorktree(path: string | null)` for worktree terminal scoping.
2. `WorkspaceContext` MUST expose `worktreesSectionCollapsed: boolean` and `toggleWorktreesSection()`.
3. `PerProjectWorkspaceState` MUST include `activeWorktree: string | null` and `worktreesSectionCollapsed: boolean` for per-project cache persistence.
4. `WorktreeTree` MUST be rendered above `FileTree` inside `ExplorerContent`, always mounted per Decision #84, hidden via CSS when the worktree list is empty.
5. Worktree data MUST be fetched via `GET /api/worktrees?slug=<slug>` returning `Worktree[]`; an empty array MUST be returned (not a server error) when `.trees/` is absent or git is unavailable.
6. A `useWorktrees(slug: string)` hook MUST be provided exposing `{ worktrees: Worktree[], loading: boolean, error: string | null, refresh: () => void }`.

**Proposed interface additions:**
- `Worktree: { path: string; branch: string; commit: string; name: string; isMain: boolean }`
- `GET /api/worktrees?slug=<slug>` → `Worktree[]`
- `WorkspaceContextValue` gains: `activeWorktree`, `worktreesSectionCollapsed`, `setActiveWorktree`, `toggleWorktreesSection`
- `PerProjectWorkspaceState` gains: `activeWorktree`, `worktreesSectionCollapsed`

---

## 5. New Files Required

| File | Purpose |
|------|---------|
| `src/app/api/worktrees/route.ts` | `GET /api/worktrees?slug=<slug>` — parse `git worktree list --porcelain`, filter to `.trees/`, return `Worktree[]` |
| `src/app/api/worktrees/route.test.ts` | Unit tests: parser, filtering, error handling |
| `src/hooks/use-worktrees.ts` | `useWorktrees(slug)` hook — fetch, loading/error state, refresh |
| `src/hooks/use-worktrees.test.ts` | Unit tests for `useWorktrees` |
| `src/components/worktree-tree.tsx` | Collapsible worktree section rendered above FileTree |
| `src/components/worktree-tree.test.tsx` | Unit tests for `WorktreeTree` |

---

## 6. Modified Files Required

| File | Change Summary |
|------|---------------|
| `.gitignore:29` | `.trees/*` → `.trees/` |
| `src/lib/types.ts` | Add `Worktree` interface; add `activeWorktree`, `worktreesSectionCollapsed` to `PerProjectWorkspaceState` |
| `src/lib/workspace-context.tsx` | Add `activeWorktree`, `worktreesSectionCollapsed`, `setActiveWorktree`, `toggleWorktreesSection` to state, context value, stateRef, save/restore |
| `src/server/terminal-server.mts` | Add `extractWorktree()`, extend `resolveTerminalSetup` for shell-only worktree path, thread through `handleConnection` and `wss.on('connection')` |
| `src/hooks/use-terminal.ts` | Add `worktree?` to `UseTerminalOptions`; update `buildWsUrl` signature and call site |
| `src/components/workspace-layout.tsx` | Render `WorktreeTree` above FileTree in `ExplorerContent`; add worktree terminal panel |
| `src/components/project-sidebar.tsx` | `w-12` → `w-44`; tab buttons show badge + name text |
| `CORE-COMPONENT-0003-websocket-terminal.md` | Add `worktree` query param rules and interface |
| `CORE-COMPONENT-0007-shell-layout.md` | Update sidebar width to ~176 px; add name-display rule |
| `CORE-COMPONENT-0008-multi-project-tabs.md` | Add worktree state fields, hook contract, `WorktreeTree` render rules |
| `project/architecture/ADR/DECISION-LOG.md` | Add Decision #85–#94 |

---

## 7. Technical Design Notes

### 7.1 `GET /api/worktrees` Parser

`git worktree list --porcelain` output format (blank-line-separated blocks, stable since git 2.7):
```
worktree /abs/path/to/main
HEAD abc123def456
branch refs/heads/main

worktree /abs/path/to/.trees/feature-branch
HEAD def456abc123
branch refs/heads/feature-branch

worktree /abs/path/to/.trees/hotfix
HEAD 789abc
detached
```

Parse blocks → filter to entries whose `path` starts with `<projectRoot>/.trees/` → derive `name` as `path.relative(join(projectRoot, '.trees'), worktreePath)`. Return `[]` on any error (git not found, not a git repo, `.trees/` absent, subprocess failure).

### 7.2 Terminal Server — Worktree Path Extraction

```typescript
function extractWorktree(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    const raw = url.searchParams.get('worktree');
    if (!raw) return null;
    if (path.isAbsolute(raw)) return null;           // reject absolute paths
    const normalized = path.normalize(raw);
    if (normalized.startsWith('..')) return null;    // reject traversal
    return normalized;
  } catch {
    return null;
  }
}
```

In `resolveTerminalSetup`, when `worktree` is non-null (after slug resolution):
```typescript
const worktreeAbsPath = path.resolve(resolvedCwd, worktree);
const relative = path.relative(resolvedCwd, worktreeAbsPath);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
  // traversal attempt → fall back to project root shell
  return { command: shell, args: shellArgs, cwd: resolvedCwd, mode: 'shell' };
}
const stat = await fs.stat(worktreeAbsPath);
if (!stat.isDirectory()) {
  return { command: shell, args: shellArgs, cwd: resolvedCwd, mode: 'shell' };
}
return { command: shell, args: shellArgs, cwd: worktreeAbsPath, mode: 'shell' };
```

### 7.3 Sidebar Widening — Before/After

```tsx
// BEFORE — project-sidebar.tsx:16
<nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/50 py-2">

// AFTER
<nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-card/50 py-2">

// BEFORE — project-sidebar.tsx:38-47 (square letter button)
<button className="flex h-9 w-9 items-center justify-center rounded-md text-xs font-bold text-white ...">
  {project.name.charAt(0).toUpperCase()}
</button>

// AFTER (badge + name row)
<button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left ...">
  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white ${languageColor(project.language)}`}>
    {project.name.charAt(0).toUpperCase()}
  </span>
  <span className="truncate text-xs">{project.name}</span>
</button>
```

Decision #53 (native `title` attribute for tooltips, no Radix tooltip dependency) is preserved.

---

## 8. Technical Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `git worktree list --porcelain` format varies across git versions | Low | Medium | Format stable since git 2.7; add parser unit tests with fixture output strings |
| Absolute worktree path exposure to client via WS URL | Medium | High | Client passes relative path only; server resolves absolute path server-side (Decision #43) |
| Path traversal via `worktree` query param in WebSocket URL | Medium | High | `extractWorktree` rejects `..` segments and absolute paths; second check in `resolveTerminalSetup` |
| Sidebar width breaks narrow viewport layouts | Low | Medium | 176 px sidebar leaves ≥848 px workspace at 1024 px; test at 1024 px breakpoint |
| Two concurrent terminals (project + worktree) | Medium | Medium | Each `TerminalPanel` is an independent React subtree with own `useTerminal` instance; no shared PTY or WS state |
| `WorktreeTree` mount flicker on project switch | Low | Low | Always mounted per Decision #84; collapse via CSS height animation (framer-motion) |
| git unavailable or not a git repo | Medium | Low | API returns `[]` (not HTTP error); `WorktreeTree` renders nothing when list is empty |
| `activeWorktree` stale after project switch | Medium | Medium | `setProject` in workspace-context resets workspace state; include `activeWorktree: null` in the reset |

---

## 9. Dependencies and Prerequisites

**No new npm packages required.** All capabilities already present:
- `execFile` / `promisify` — used in `src/app/api/files/route.ts:9`
- `fs/promises` — used throughout
- `path` — used throughout
- WebSocket / node-pty — `src/server/terminal-server.mts`
- React hooks, context — established patterns in `src/lib/workspace-context.tsx`
- framer-motion — installed, used in `src/components/file-tree.tsx`

**Suggested implementation order (minimizes blocking dependencies):**
1. `.gitignore` — trivial one-line change
2. `src/lib/types.ts` — add `Worktree`, update `PerProjectWorkspaceState`
3. `src/app/api/worktrees/route.ts` + `route.test.ts`
4. `src/hooks/use-worktrees.ts` + `use-worktrees.test.ts`
5. `src/lib/workspace-context.tsx` — add worktree state fields
6. `src/server/terminal-server.mts` — add `extractWorktree`, modify `resolveTerminalSetup`
7. `src/hooks/use-terminal.ts` — add `worktree` option to `UseTerminalOptions` and `buildWsUrl`
8. `src/components/worktree-tree.tsx` + `worktree-tree.test.tsx`
9. `src/components/workspace-layout.tsx` — integrate `WorktreeTree` and worktree terminal panel
10. `src/components/project-sidebar.tsx` — widen, add name text
11. Update CORE-COMPONENT-0003, CORE-COMPONENT-0007, CORE-COMPONENT-0008
12. Update `project/architecture/ADR/DECISION-LOG.md` (Decision #85–#94)

---

## 10. Proposed Decision Records (DECISION-LOG.md — #85–#94)

| # | Decision | Source | Date |
|---|----------|--------|------|
| 85 | Worktree terminals MUST use shell-only mode (bypass tmux decision tree), with CWD set to the resolved worktree directory | CORE-COMPONENT-0003 | TBD |
| 86 | Add `worktree=<relative-path>` as an optional WebSocket query parameter on `/api/terminal`; server resolves it relative to the project root server-side | CORE-COMPONENT-0003 | TBD |
| 87 | `extractWorktree()` MUST reject paths containing `..` segments and paths resolving outside the project root; on rejection fall back to the project root shell | CORE-COMPONENT-0003 | TBD |
| 88 | Sidebar width MUST be ~176 px; project names MUST be displayed as visible truncated text labels alongside the language-color badge | CORE-COMPONENT-0007 | TBD |
| 89 | Supersedes Decision #47: sidebar tabs show language-color badge (initial letter) + full project name text label, not initial letter only | CORE-COMPONENT-0007 | TBD |
| 90 | `WorkspaceContext` MUST expose `activeWorktree: string \| null` and `setActiveWorktree(path: string \| null)` for worktree terminal scoping | CORE-COMPONENT-0008 | TBD |
| 91 | `WorkspaceContext` MUST expose `worktreesSectionCollapsed: boolean` and `toggleWorktreesSection()` | CORE-COMPONENT-0008 | TBD |
| 92 | `PerProjectWorkspaceState` MUST include `activeWorktree: string \| null` and `worktreesSectionCollapsed: boolean` for per-project cache persistence | CORE-COMPONENT-0008 | TBD |
| 93 | Worktree data MUST be fetched via `GET /api/worktrees?slug=<slug>` returning `Worktree[]`; an empty array MUST be returned (not an HTTP error) when `.trees/` is absent or git is unavailable | CORE-COMPONENT-0008 | TBD |
| 94 | `WorktreeTree` MUST be rendered above `FileTree` inside `ExplorerContent`, always mounted per Decision #84, hidden via CSS when the worktree list is empty | CORE-COMPONENT-0008 | TBD |

