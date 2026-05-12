# CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State

## Status

Adopted (updated) — 2026-05-12

## Purpose

Enable users to keep multiple projects "open" simultaneously via persistent sidebar tabs, preserving per-project workspace UI state (selected file, expanded folders, panel visibility) in memory while switching between projects. This removes the need to navigate back to the landing page and re-enter a project, and ensures the workspace feels stateful across tab switches.

## Scope

- Open projects list management (add, remove, deduplicate)
- Per-project workspace UI state cache (in-memory `Map`)
- localStorage persistence of the open project slug list only
- Stale slug pruning on cold start
- Save/restore lifecycle between `WorkspaceProvider` and `OpenProjectsProvider`
- Sidebar rendering, interaction, and accessibility contracts
- File tree refresh contract exposed via `WorkspaceContext` for in-portal edits (silent refresh after save)

## Definition

### Rules
- The `OpenProjectsProvider` MUST be mounted inside the root layout (`src/app/layout.tsx`), below `ThemeProvider`, so it survives all client-side navigations
- The open projects slug list MUST be persisted to `localStorage` under the key `devdeck-open-projects`
- Only the slug array MUST be persisted; full project metadata and workspace state MUST NOT be written to `localStorage`
- On cold start, slugs from `localStorage` MUST be cross-referenced against `/api/projects`; stale slugs (projects that no longer exist) MUST be pruned silently
- `openProject(project)` MUST be idempotent — calling it with an already-open slug MUST NOT duplicate the entry
- `closeProject(slug)` MUST remove the project from the list and delete its cached workspace state
- Closing the last open project MUST navigate the user to the landing page (`/`)
- The in-memory workspace state cache MUST use a `Map<string, PerProjectWorkspaceState>` keyed by project slug
- `WorkspaceProvider` MUST call `restoreWorkspaceState(slug)` on mount to hydrate from cache when available
- `WorkspaceProvider` MUST call `saveWorkspaceState(slug, state)` on unmount (via cleanup effect) to persist current state to the cache
- The sidebar MUST render outside the `react-resizable-panels` `Group` as a sibling flex column (per CORE-COMPONENT-0007)
- The sidebar MUST be a fixed-width vertical strip (~48px) on the left edge of the project layout
- Each sidebar tab MUST display the first letter of the project name with the project's language color as background
- Sidebar tabs MUST show the full project name via the native `title` attribute (no `@radix-ui/react-tooltip` dependency)
- The active project tab MUST be visually distinguished (e.g., left border accent, brighter background)
- Each tab MUST have a close button (visible on hover) to remove the project from the open list
- The sidebar MUST include a "Home" button at the top to navigate to the landing page
- Clicking a sidebar tab MUST trigger client-side navigation via `router.push(`/project/${slug}`)` — no full page reload
- Sidebar MUST use CSS custom properties from CORE-COMPONENT-0004 for structural colors (borders, backgrounds, text). Language color badges use Tailwind palette classes via the shared `languageColor()` utility for consistency with `ProjectCard`
- All sidebar interactive elements MUST have `aria-label` attributes
- The active tab MUST have `aria-current="page"`
- Sidebar tabs MUST be keyboard-navigable (Tab key focuses tabs, Enter/Space activates)
- Close buttons MUST remain in the DOM (not `display:none`) and be revealed via opacity for keyboard accessibility
- `WorkspaceContext` MUST expose a `refreshFileTree: (explicitSlug?: string) => Promise<void>` function and a `fileTreeRefreshing: boolean` flag in addition to `setFileTree` / `setFileTreeLoading`
- `refreshFileTree` MUST be a no-op when neither `explicitSlug` nor the active context `project.slug` is available (no fetch issued, `fileTreeRefreshing` MUST remain `false`)
- `refreshFileTree` MUST issue `GET /api/files?slug=<targetSlug>` with `{ cache: "no-store" }` to bypass the short browser cache configured by the API route, where `targetSlug = explicitSlug ?? project.slug`
- `refreshFileTree` MUST accept an optional `explicitSlug` parameter so callers (notably the initial-load path in `WorkspaceLayout`) can fetch deterministically without waiting for the context `project` state to propagate from `setProject` (eliminates a no-op + double-pass spinner flicker on cold mount)
- `refreshFileTree` MUST update `fileTree` on success and log (not throw) on failure; the previous `fileTree` MUST remain intact on error
- `refreshFileTree` MUST track concurrent invocations via an internal in-flight counter; `fileTreeRefreshing` MUST be set to `true` on entry and only reset to `false` when the LAST in-flight call completes (prevents an early-finishing call from prematurely clearing the flag while a later refresh is still pending)
- `refreshFileTree` MUST toggle ONLY `fileTreeRefreshing` — it MUST NOT mutate `fileTreeLoading`
- The initial file-tree load MUST continue to use `fileTreeLoading` so `ExplorerContent` can render its initial spinner; subsequent (post-save) refreshes MUST be silent (no spinner, no layout shift, no flicker)
- `WorkspaceLayout` MUST trigger the initial load via `refreshFileTree(project.slug)` (passing the slug explicitly) and MUST wrap that call to set `fileTreeLoading=true` before invocation and `false` after completion; it MUST NOT define its own `fetchTree` callback
- `FileViewer` MUST call `refreshFileTree()` after a successful save (after `toast.success("File saved")`) and MUST NOT call it on failure paths (non-OK HTTP status, network error, or thrown exception)
- `ExplorerContent` MUST gate its loading spinner on `fileTreeLoading` only; it MUST NOT read `fileTreeRefreshing`

### Interfaces

- **OpenProjectsProvider:** React context providing `openProjects`, `openProject()`, `closeProject()`, `saveWorkspaceState()`, `restoreWorkspaceState()`
- **useOpenProjects():** Hook to consume the context; throws if used outside provider
- **PerProjectWorkspaceState:** `{ selectedFile: string | null; expandedFolders: string[]; showFileViewer: boolean; showTerminal: boolean; fileTree: FileNode[] }`
- **WorkspaceContextValue (extended):** in addition to existing members (`setProject`, `selectFile`, `toggleFolder`, `toggleFileViewer`, `toggleTerminal`, `setFileTree`, `setFileTreeLoading`), MUST include:
  - `refreshFileTree: (explicitSlug?: string) => Promise<void>` — silent refetch using `cache: "no-store"`; uses `explicitSlug` when provided, else the active context `project.slug`
  - `fileTreeRefreshing: boolean` — true while any silent refresh is in flight (counter-based — see Rules); never gates the initial spinner
- **ProjectSidebar:** Component rendering the vertical tab strip; consumes `useOpenProjects()` and `usePathname()`
- **languageColor(language?: string): string** — Shared utility extracted to `src/lib/utils.ts`

### Expectations
- Workspace UI state MUST survive tab switches within a session (in-memory cache hit)
- Workspace UI state MAY be lost on full page refresh (acceptable — only slugs persist)
- Terminal state is preserved server-side via tmux reattachment (CORE-COMPONENT-0003) — no client-side terminal state caching is needed
- The sidebar MUST NOT appear on the landing page — only on `/project/*` routes
- The `OpenProjectsProvider` MUST hydrate stored slugs by fetching `/api/projects` on cold start for metadata and stale slug pruning; the project page component also calls `openProject()` after fetching for direct URL navigation
- After every successful in-portal save, the file explorer's git-status badges (`M`, `A`, `D`, `??`) MUST reflect the new state without a manual reload, page refresh, or tab switch
- Silent refresh MUST NOT cause the explorer to remount, scroll-jump, lose folder expansion state, or flash a spinner

## Rationale

An in-memory `Map` cache avoids the complexity and performance cost of serializing large `fileTree` arrays to `localStorage` on every state change. Persisting only slugs keeps `localStorage` usage minimal (~100 bytes) and avoids stale data issues. Mounting the provider at root layout level ensures the cache survives Next.js client-side navigations. The sidebar is deliberately minimal (icon-width) to avoid consuming workspace real estate.

Option B (mount all workspaces, hide with CSS) was rejected because mounting N xterm.js terminals simultaneously is expensive. Option C (full localStorage serialization) was rejected because `fileTree` can be large and frequent writes are wasteful.

## Usage Examples

```typescript
// src/lib/open-projects-context.tsx
"use client";

interface PerProjectWorkspaceState {
  selectedFile: string | null;
  expandedFolders: string[];
  showFileViewer: boolean;
  showTerminal: boolean;
  fileTree: FileNode[];
}

interface OpenProjectsContextValue {
  openProjects: Project[];
  openProject: (project: Project) => void;
  closeProject: (slug: string) => void;
  saveWorkspaceState: (slug: string, state: PerProjectWorkspaceState) => void;
  restoreWorkspaceState: (slug: string) => PerProjectWorkspaceState | undefined;
}
```

```typescript
// src/lib/workspace-context.tsx — silent refresh contract
const [fileTreeRefreshing, setFileTreeRefreshing] = useState(false);
const refreshInFlightCountRef = useRef(0);

const refreshFileTree = useCallback(
  async (explicitSlug?: string) => {
    const targetSlug = explicitSlug ?? project?.slug;
    if (!targetSlug) return;                           // no-op when no project
    refreshInFlightCountRef.current += 1;              // track concurrent refreshes
    setFileTreeRefreshing(true);
    try {
      const res = await fetch(
        `/api/files?slug=${encodeURIComponent(targetSlug)}`,
        { cache: "no-store" },                         // bypass 5s browser cache
      );
      if (!res.ok) {
        console.error("Failed to refresh file tree: HTTP", res.status);
        return;
      }
      setFileTreeState(await res.json());
    } catch (err) {
      console.error("Failed to refresh file tree:", err);
    } finally {
      refreshInFlightCountRef.current -= 1;
      if (refreshInFlightCountRef.current === 0) {
        setFileTreeRefreshing(false);                  // only the LAST call clears the flag
      }
    }
  },
  [project?.slug],
);
```

```tsx
// src/components/workspace-layout.tsx — initial load passes slug explicitly
useEffect(() => {
  let cancelled = false;
  setFileTreeLoading(true);
  (async () => {
    try {
      await refreshFileTree(project.slug);             // explicit slug → no race with setProject
    } finally {
      if (!cancelled) setFileTreeLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [project.slug, refreshFileTree, setFileTreeLoading]);
```

```tsx
// src/components/file-viewer.tsx — call site after a successful save
toast.success("File saved");
void refreshFileTree();   // success only; not in catch / non-OK branches
```

```tsx
// src/app/project/[slug]/page.tsx — on mount
const { openProject } = useOpenProjects();
useEffect(() => {
  if (project) openProject(project);
}, [project, openProject]);
```

```tsx
// src/app/project/layout.tsx — intermediate layout
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <ProjectSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

## Integration Guidelines

- `OpenProjectsProvider` wraps children in `src/app/layout.tsx` as a Client Component wrapper below `ThemeProvider`
- The intermediate layout at `src/app/project/layout.tsx` renders `<ProjectSidebar />` + `{children}` in a flex row
- `WorkspaceProvider` in `src/lib/workspace-context.tsx` must be updated to accept an optional `slug` prop and call `restoreWorkspaceState`/`saveWorkspaceState`
- The `PerProjectWorkspaceState` type must be added to `src/lib/types.ts`
- `languageColor()` must be extracted from `src/components/project-card.tsx` to `src/lib/utils.ts` and re-exported for use by both `ProjectCard` and `ProjectSidebar`
- Any component that mutates the working tree (file save, create, delete, rename) MUST call `refreshFileTree()` from `useWorkspace()` after the mutation succeeds; failure paths MUST NOT call it
- Components rendering tree-derived UI (e.g. `ExplorerContent`) MUST consume `fileTreeLoading` for spinner gating and MUST NOT read `fileTreeRefreshing`

## Exceptions

- On cold start (full page refresh), workspace UI state starts fresh — only the slug list is restored from `localStorage`
- If `/api/projects` is unreachable on cold start, stale slug pruning is skipped and previously stored slugs are kept

## Enforcement

- [x] Automated checks: Unit tests for `OpenProjectsProvider` (open, close, deduplicate, persist, prune, save/restore)
- [x] Automated checks: Unit tests for `ProjectSidebar` (render, active state, close, navigation, accessibility)
- [x] Code review checklist: New sidebar elements must use CSS custom properties, not hardcoded colors
- [x] Test coverage requirements: Workspace state round-trip (save on unmount → restore on mount) must be tested
- [x] Test coverage requirements: `refreshFileTree` unit tests assert (a) `cache: "no-store"` fetch option, (b) `fileTree` updates on success, (c) `fileTreeRefreshing` toggles true→false, (d) no-op when neither `explicitSlug` nor active project is available, (e) `refreshFileTree(explicitSlug)` fetches even without a context project, (f) `fileTreeRefreshing` stays true across concurrent refreshes until the LAST one completes
- [x] Test coverage requirements: `FileViewer` save tests assert `refreshFileTree` is called exactly once on success and zero times on failure (non-OK status or network error)
- [x] Code review checklist: `ExplorerContent` (and any future tree consumer) MUST NOT read `fileTreeRefreshing`

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
- [CORE-COMPONENT-0004-theming](CORE-COMPONENT-0004-theming.md)
- [CORE-COMPONENT-0007-shell-layout](CORE-COMPONENT-0007-shell-layout.md)
