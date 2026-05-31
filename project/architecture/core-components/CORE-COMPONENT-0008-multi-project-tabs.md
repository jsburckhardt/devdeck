# CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State

## Status

Adopted (updated) - 2026-05-30

## Purpose

Enable users to keep multiple projects "open" simultaneously via persistent sidebar tabs, preserving per-project workspace UI state (selected file, expanded folders, panel visibility, loaded file-tree state, and per-directory load state) in memory while switching between projects. This removes the need to navigate back to the landing page and re-enter a project, ensures the workspace feels stateful across tab switches, and prevents large workspaces from blocking initial explorer rendering through eager deep traversal.

## Scope

- Open projects list management (add, remove, deduplicate)
- Per-project workspace UI state cache (in-memory `Map`)
- localStorage persistence of the open project slug list only
- Stale slug pruning on cold start
- Save/restore lifecycle between `WorkspaceProvider` and `OpenProjectsProvider`
- Sidebar rendering, interaction, and accessibility contracts
- File tree refresh contract exposed via `WorkspaceContext` for in-portal edits
- Lazy file-tree loading contract for root and directory children
- File-tree request deduplication and stale-response protection
- Per-directory loading, error, retry, and empty-state behavior
- Worktree-aware file-tree root switching, request scoping, and per-worktree state caching
- Worktree-aware HTTP file APIs and FileViewer requests
- Worktree selector visualization and `.trees/` directory icon behavior

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
- The sidebar MUST be a fixed-width vertical strip (~176px) on the left edge of the project layout
- Sidebar collapse state MUST be global and MUST NOT be included in `PerProjectWorkspaceState`
- Collapsed sidebar mode MUST hide Home text and project-name labels while preserving native `title` attributes
- Collapsed sidebar tabs MUST keep language-color badges visible
- Expanded sidebar tabs MUST display the project's language-color badge (first letter) and the project name as a visible truncated text label
- Sidebar tabs MUST show the full project name via the native `title` attribute (no `@radix-ui/react-tooltip` dependency)
- The active project tab MUST be visually distinguished (e.g., left border accent, brighter background)
- Each tab MUST have a close button to remove the project from the open list
- Expanded sidebar close buttons MAY be visible on hover/focus
- Collapsed sidebar close buttons MUST be always visible
- The sidebar MUST include a "Home" button at the top to navigate to the landing page
- Clicking a sidebar tab MUST trigger client-side navigation via `router.push(`/project/${slug}`)` — no full page reload
- Sidebar MUST use CSS custom properties from CORE-COMPONENT-0004 for structural colors (borders, backgrounds, text). Language color badges use Tailwind palette classes via the shared `languageColor()` utility for consistency with `ProjectCard`
- All sidebar interactive elements MUST have `aria-label` attributes
- The active tab MUST have `aria-current="page"`
- Sidebar tabs MUST be keyboard-navigable (Tab key focuses tabs, Enter/Space activates)
- Close buttons MUST remain in the DOM (not `display:none`) and be revealed via opacity for keyboard accessibility
- `GET /api/files?slug=<targetSlug>` MUST return only direct root children for the resolved project root
- `GET /api/files?slug=<targetSlug>&path=<relative-dir>` MUST return only direct children for the requested project-relative directory
- The file-tree API MUST resolve project roots server-side through `resolveProjectPath(slug)` and MUST NOT expose absolute filesystem paths to clients
- The file-tree API MUST reject path traversal or absolute `path` escape attempts with a structured JSON error
- The file-tree API MUST reject `path` targets that are not readable directories with a structured JSON error
- The file-tree API MUST apply a server-side default exclusion list to filter entries named `.git` whose internal contents are never meaningful to browse. Filtered entries MUST be excluded from API responses regardless of whether they are files or directories. Dotfiles, lockfiles, `node_modules`, `.next`, and other user-relevant entries MUST remain visible.
- File-tree performance MUST come from lazy direct-child loading, request deduplication, and stale-response guards. A server-side exclusion list for noise directories is permitted for UX; it MUST NOT be the sole performance mechanism.
- Direct-child file-tree responses MUST preserve existing classification behavior for `kind`, `unreadable`, `truncated`, `truncatedReason`, `status`, and `size`
- Directory `FileNode`s returned by the API MUST include lazy metadata: `hasChildren` and `childrenLoaded`
- Readable directories with children MUST be returned with `hasChildren: true` and `childrenLoaded: false` until their children are loaded
- Empty readable directories MUST be returned with `hasChildren: false`, `childrenLoaded: true`, and `children: []`
- Unreadable directories MUST remain visible, MUST be marked `unreadable: true`, and MUST NOT enter a perpetual loading state
- The API MAY perform shallow child-existence checks for direct directory entries, but MUST NOT recursively traverse descendants for root or child listing requests
- `WorkspaceContext` MUST expose `refreshFileTree: (explicitSlug?: string) => Promise<void>` and `fileTreeRefreshing: boolean`
- `WorkspaceContext` MUST expose `showExplorer: boolean` and `toggleExplorer(): void`
- `PerProjectWorkspaceState` MUST include optional `showExplorer?: boolean` for backwards-compatible per-project panel visibility persistence
- Missing cached `showExplorer` values MUST restore as `true`
- Cached workspace visibility MUST be normalized before first render so invalid all-hidden states restore as Terminal visible; valid one-panel, two-panel, and three-panel visibility combinations MUST be preserved
- `WorkspaceProvider` save-on-unmount and in-memory per-project workspace cache MUST include `showExplorer`
- `WorkspaceContext` MUST expose `loadDirectoryChildren: (path: string, explicitSlug?: string) => Promise<void>` for lazy child loading
- `WorkspaceContext` MUST expose serializable per-directory loading and error state keyed by project-relative directory path
- `refreshFileTree` MUST be a no-op when neither `explicitSlug` nor the active context `project.slug` is available
- `refreshFileTree` MUST issue a root request to `/api/files?slug=<targetSlug>` with `{ cache: "no-store" }`, appending `worktree=<activeWorktree>` when a worktree is active
- `loadDirectoryChildren` MUST issue `/api/files?slug=<targetSlug>&path=<relative-dir>` with `{ cache: "no-store" }`, appending `worktree=<activeWorktree>` when a worktree is active
- Root and child file-tree requests MUST be deduplicated by `slug + activeWorktree + path`; duplicate in-flight calls for the same scoped key MUST share the same work and MUST NOT issue duplicate fetches
- File-tree responses MUST be ignored if they target a stale project slug, stale active worktree, stale request generation, or obsolete directory request
- `refreshFileTree` MUST update the root `fileTree` on success without clearing unrelated loaded child state unless that subtree no longer exists
- `loadDirectoryChildren` MUST merge loaded children immutably into the matching directory node without replacing unrelated directories
- File-tree request failures MUST preserve the existing tree and set an error only for the affected root or directory path
- `fileTreeRefreshing` MUST represent root refresh activity and MUST NOT gate the explorer's initial spinner
- Root initial load MUST continue to use `fileTreeLoading` so `ExplorerContent` can render its initial spinner
- Per-directory loading MUST be represented separately from `fileTreeLoading` so expanding one directory does not blank or spin the entire explorer
- `WorkspaceLayout` MUST trigger the initial root load through `refreshFileTree(project.slug)` and MUST wrap that call to set `fileTreeLoading=true` before invocation and `false` after completion
- Initial root loading MUST be protected by request deduplication so React Strict Mode, worktree switching, or project propagation does not produce duplicate root fetches for the same scoped key
- `FileViewer` MUST call `refreshFileTree()` after a successful save only and MUST NOT call it on failure paths
- `ExplorerContent` MUST gate its initial loading spinner on `fileTreeLoading` only; it MUST NOT read `fileTreeRefreshing`
- `FileTree` MUST call `loadDirectoryChildren(node.path)` when expanding a readable directory whose children are not loaded
- `FileTree` MUST toggle already-loaded directories without refetching unless the user explicitly retries a failed load
- `FileTree` MUST render per-directory loading, error, retry, and empty states without clearing the existing root tree
- `FileTree` MUST preserve unreadable-node affordances and MUST NOT try to expand unreadable directories
- Directory loading indicators, errors, retry controls, and empty states MUST have accessible text or labels and MUST NOT rely on color alone
- `WorkspaceContext` MUST expose `activeWorktree: string | null` and `setActiveWorktree(path: string | null)` for worktree terminal scoping
- `WorkspaceContext` MUST expose `worktreesSectionCollapsed: boolean` and `toggleWorktreesSection()`
- `PerProjectWorkspaceState` MUST include `activeWorktree: string | null` and `worktreesSectionCollapsed: boolean` for per-project cache persistence
- `WorkspaceProvider` MUST preserve project-root and worktree file-tree state separately within each project; switching active worktree MUST save the outgoing scoped state and restore the incoming scoped state when available
- Worktree-scoped workspace state MUST include `fileTree`, `expandedFolders`, `selectedFile`, loaded directory paths, directory errors, and directory loading state safe defaults
- Worktree-scoped workspace state MUST be keyed by project slug plus active worktree, where `null` active worktree represents the project root
- `WorkspaceProvider` MUST keep a current active-worktree ref alongside the current slug ref so stale file-tree responses compare both dimensions before mutating visible state
- `GET /api/files`, `GET /api/files/content`, `PUT /api/files/content`, and `GET /api/files/diff` MUST accept an optional `worktree` parameter; omitting it MUST preserve project-root behavior
- HTTP file APIs MUST resolve worktree roots with a shared helper that first resolves the project root with `resolveProjectPath(slug)`, then resolves `<projectRoot>/.trees/<worktree>` server-side
- The shared HTTP worktree resolver MUST reject empty, absolute, or traversal-containing worktree parameters
- The shared HTTP worktree resolver MUST call `fs.realpath()` on both the project root and candidate worktree root, then reject the request if the real worktree path is outside the real project root
- Missing worktree directories MUST produce a structured `WORKTREE_NOT_FOUND` response rather than an empty directory listing
- When `/api/files` serves a worktree-rooted request, every returned `FileNode.path` MUST be relative to the active worktree root
- `FileViewer` MUST pass `activeWorktree` to content GET, content PUT, and diff GET requests when a worktree is active
- `FileViewer` MUST rely on `refreshFileTree()` to refresh the currently active root or worktree context after successful saves
- `PerProjectWorkspaceState` MUST include `copilotStatus?: CopilotCliState` for per-project Copilot CLI status caching
- `OpenProjectsContextValue` MUST expose `updateCopilotStatus(slug: string, status: CopilotCliState): void` to update the cached Copilot status for a project
- `OpenProjectsContextValue` MUST expose `getCopilotStatus(slug: string): CopilotCliState` to read the cached Copilot status for a project (returns `"idle"` if not set)
- `closeProject(slug)` MUST clear the cached `copilotStatus` for that slug by explicitly deleting the entry from the separate `copilotStatuses` Map
- Direct URL navigation and cold-start sidebar hydration MUST display `"idle"` until a fresh `"status"` frame is received
- Sidebar tabs MUST render a Copilot CLI status indicator adjacent to the project language badge
- The status indicator MUST use theme-aware CSS custom properties (CORE-COMPONENT-0004) and MUST NOT rely on color alone for semantics — `aria-label` and `title` attributes MUST convey the state
- The status indicator MUST be hidden (not rendered) when `copilotStatus` is `"idle"`
- The status indicator MUST be hidden when the terminal WebSocket is not connected (status is only meaningful with a live connection)
- Sidebar Copilot status indicators MUST remain visible on project badges in expanded and collapsed modes
- `WorktreeTree` MUST be rendered in `ProjectSidebar` for the active project, always mounted per Decision #84, hidden via CSS when the worktree list is empty or when the sidebar is collapsed, and MUST NOT render inside `ExplorerContent`
- Worktree data MUST be fetched via `GET /api/worktrees?slug=<slug>` returning `Worktree[]`; an empty array MUST be returned (not a server error) when `.trees/` is absent or git is unavailable
- A `useWorktrees(slug: string)` hook MUST be provided exposing `{ worktrees: Worktree[], loading: boolean, error: string | null, refresh: () => void }`
- `WorktreeTree` MUST render filesystem-style selector nodes with icons, indentation, keyboard-accessible buttons, `aria-current` on the active entry, and active-state affordances that do not rely on color alone
- `WorktreeTree` MUST remain a selector only; it MUST NOT render nested inline file trees under each worktree
- The project-root selector in `WorktreeTree` MUST clear `activeWorktree`; worktree selectors MUST set `activeWorktree` to the corresponding `.trees/<name>` relative path
- If a restored or active worktree is no longer returned by `GET /api/worktrees`, `WorktreeTree` MUST reset `activeWorktree` to project root and show a non-fatal notice
- `FileTree` directory nodes named `.trees` MUST render a `Tree` icon from `@phosphor-icons/react` in both expanded and collapsed states

### Interfaces

- **OpenProjectsProvider:** React context providing `openProjects`, `openProject()`, `closeProject()`, `saveWorkspaceState()`, `restoreWorkspaceState()`, `updateCopilotStatus()`, `getCopilotStatus()`
- **useOpenProjects():** Hook to consume the context; throws if used outside provider
- **PerProjectWorkspaceState:** `{ selectedFile: string | null; expandedFolders: string[]; showExplorer?: boolean; showFileViewer: boolean; showTerminal: boolean; fileTree: FileNode[]; directoryLoadErrors?: Record<string, string>; loadedDirectories?: string[]; activeWorktree: string | null; worktreesSectionCollapsed: boolean }`
- **FileNode lazy metadata:** `hasChildren?: boolean; childrenLoaded?: boolean; children?: FileNode[]; unreadable?: boolean; truncated?: boolean; truncatedReason?: "max-depth" | "entry-limit"`
- **File tree root endpoint:** `GET /api/files?slug=<slug>[&worktree=<relative-worktree>]` returns `FileNode[]` containing direct root children of the project root or active worktree root only
- **File tree directory endpoint:** `GET /api/files?slug=<slug>&path=<relative-dir>[&worktree=<relative-worktree>]` returns `FileNode[]` containing direct children of the requested directory under the project root or active worktree root
- **File content endpoint:** `GET /api/files/content?slug=<slug>&path=<relative-file>[&worktree=<relative-worktree>]` reads from the project root or active worktree root; `PUT /api/files/content` accepts the same optional `worktree` in its JSON body
- **File diff endpoint:** `GET /api/files/diff?slug=<slug>&path=<relative-file>[&worktree=<relative-worktree>]` runs git diff/status from the project root or active worktree root
- **Shared HTTP worktree resolver:** `resolveWorktreeRoot(slug: string, worktree?: string): Promise<string>` resolves the effective file API root and applies symlink-escape protection when `worktree` is present
- **WorkspaceContextValue (extended):** in addition to existing members (`setProject`, `selectFile`, `toggleFolder`, `toggleFileViewer`, `toggleTerminal`, `setFileTree`, `setFileTreeLoading`), MUST include:
  - `showExplorer: boolean` — whether the Explorer panel is expanded
  - `toggleExplorer: () => void` — toggles Explorer visibility while preserving mounted Explorer state
  - `refreshFileTree: (explicitSlug?: string) => Promise<void>` — root lazy-list refresh using `cache: "no-store"`; uses `explicitSlug` when provided, else active `project.slug`, and scopes the request to `activeWorktree` when set
  - `loadDirectoryChildren: (path: string, explicitSlug?: string) => Promise<void>` — lazy child-list request and merge for a readable directory, scoped to `activeWorktree` when set
  - `fileTreeRefreshing: boolean` — true while any root refresh is in flight
  - `fileTreeError: string | null` — set when a root refresh fails (non-OK or network error), cleared on new refresh start, success, or project switch; used by `ExplorerContent` to render error+retry UI when tree is empty
  - `directoryLoading: ReadonlySet<string>` or equivalent serializable/context-safe representation — directory paths with in-flight child loads
  - `directoryErrors: ReadonlyMap<string, string>` or equivalent serializable/context-safe representation — directory paths with last child-load error messages
  - `retryDirectoryChildren: (path: string) => Promise<void>` MAY be exposed as an alias or implemented by clearing the path error and calling `loadDirectoryChildren(path)`
  - `activeWorktree: string | null` — relative path of the currently active worktree (e.g. `.trees/feature-branch`), or null
  - `setActiveWorktree: (path: string | null) => void` — set the active worktree for terminal scoping
  - `worktreesSectionCollapsed: boolean` — whether the worktrees section in the project sidebar is collapsed
  - `toggleWorktreesSection: () => void` — toggle worktrees section collapsed state
- **Worktree:** `{ name: string; branch: string }`
- **Worktree endpoint:** `GET /api/worktrees?slug=<slug>` → `Worktree[]` — parses `git worktree list --porcelain`, filters to `.trees/`-relative entries; returns `[]` on any error
- **useWorktrees(slug: string):** Hook exposing `{ worktrees: Worktree[], loading: boolean, error: string | null, refresh: () => void }`
- **WorktreeTree:** Collapsible selector component rendered in the project sidebar; lists project root and worktrees as filesystem-style selector nodes without nested inline file trees
- **ProjectSidebar:** Component rendering the collapsible vertical tab strip plus the active project's CSS-hideable worktree selector; consumes `useOpenProjects()` and `usePathname()`
- **languageColor(language?: string): string** — Shared utility extracted to `src/lib/utils.ts`

### Expectations

- Workspace UI state MUST survive tab switches within a session (in-memory cache hit)
- Workspace UI state MAY be lost on full page refresh (acceptable — only slugs persist)
- Terminal state is preserved server-side via tmux reattachment (CORE-COMPONENT-0003) — no client-side terminal state caching is needed
- The sidebar MUST NOT appear on the landing page — only on `/project/*` routes
- The `OpenProjectsProvider` MUST hydrate stored slugs by fetching `/api/projects` on cold start for metadata and stale slug pruning; the project page component also calls `openProject()` after fetching for direct URL navigation
- Opening a large workspace MUST render direct root entries without waiting for an eager depth-6 traversal
- Expanding a directory MUST load only that directory's direct children
- Duplicate root or same-directory requests MUST not create duplicate network calls while one equivalent request is already in flight
- Switching projects while file-tree requests are in flight MUST NOT allow stale responses to overwrite the active project's tree
- After every successful in-portal save, the file explorer's visible git-status badges (`M`, `A`, `D`, `??`) MUST refresh without a manual reload, page refresh, or tab switch
- Silent refresh MUST NOT cause the explorer to remount, scroll-jump, lose folder expansion state, or flash a global spinner
- Lazy loading MUST preserve visibility of all user-relevant entries. Internal tooling directories excluded by the server-side exclusion list (e.g. `.git`) are exempt from the visibility requirement.

## Rationale

An in-memory `Map` cache avoids the complexity and performance cost of serializing large `fileTree` arrays to `localStorage` on every state change. Persisting only slugs keeps `localStorage` usage minimal and avoids stale data issues. Mounting the provider at root layout level ensures the cache survives Next.js client-side navigations. The sidebar is deliberately minimal (icon-width) to avoid consuming workspace real estate.

The file tree previously performed an eager recursive traversal to depth 6 for every root load. After all-files visibility was introduced, large directories such as `node_modules`, `.git`, and `.next` made this root request too expensive. Lazy direct-child listing keeps complete visibility of user-relevant entries while making initial render proportional to root breadth instead of total descendant count. The original hide-list prohibition (Decision #72) was motivated by performance concerns — hiding entries was rejected to avoid silently concealing real project state. Now that lazy loading handles performance, a server-side exclusion list filtering noise directories (e.g. `.git`) is permitted as a UX improvement. The `.git` directory contains internal VCS database objects that are never meaningful to browse; filtering it improves signal-to-noise without hiding real project state.

Request deduplication and stale-response protection are required because React initialization, project switching, and user expansion actions can overlap. Per-directory state is required so one failed or slow child load does not blank the whole explorer.

Worktree file-tree integration extends the same lazy loading and stale-response model to multiple roots within one project. The project root and each linked worktree can contain identical relative paths such as `src/`, so request keys and cached UI state must include the active worktree dimension to prevent collisions and stale UI.

## Usage Examples

```typescript
// src/lib/types.ts — lazy file tree metadata
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  kind: FileKind;
  children?: FileNode[];
  hasChildren?: boolean;
  childrenLoaded?: boolean;
  status?: "added" | "modified" | "deleted";
  size?: number;
  unreadable?: boolean;
  truncated?: boolean;
  truncatedReason?: "max-depth" | "entry-limit";
}
```

```typescript
// src/app/api/files/route.ts — request contract
GET /api/files?slug=demo
// returns direct root children only

GET /api/files?slug=demo&path=src/components
// returns direct children of src/components only
```

```typescript
// src/lib/workspace-context.tsx — lazy request contract
const requestKey = `${targetSlug}:${relativePath ?? ""}`;

if (inFlightFileTreeRequests.current.has(requestKey)) {
  return inFlightFileTreeRequests.current.get(requestKey);
}

const promise = fetch(url, { cache: "no-store" })
  .then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const children = (await res.json()) as FileNode[];
    if (currentSlugRef.current !== targetSlug) return; // stale response
    mergeChildren(relativePath, children);
  })
  .finally(() => {
    inFlightFileTreeRequests.current.delete(requestKey);
  });

inFlightFileTreeRequests.current.set(requestKey, promise);
return promise;
```

```tsx
// src/components/file-tree.tsx — expansion behavior
async function handleDirectoryClick(node: FileNode) {
  if (node.unreadable) return;

  toggleFolder(node.path);

  if (node.type === "directory" && !node.childrenLoaded && node.hasChildren) {
    await loadDirectoryChildren(node.path);
  }
}
```

## Integration Guidelines

- `OpenProjectsProvider` wraps children in `src/app/layout.tsx` as a Client Component wrapper below `ThemeProvider`
- The intermediate layout at `src/app/project/layout.tsx` wraps project routes in `WorkspaceProvider` and renders `<ProjectSidebar />` + `{children}` in a flex row so the project panel and workspace panels share active worktree state
- `WorkspaceProvider` in `src/lib/workspace-context.tsx` accepts an optional `slug` prop and calls `restoreWorkspaceState`/`saveWorkspaceState`
- `PerProjectWorkspaceState` lives in `src/lib/types.ts`
- `languageColor()` is shared from `src/lib/utils.ts` for use by both `ProjectCard` and `ProjectSidebar`
- The file-tree API route must validate `path` with `path.resolve(root, requestedPath)` and `path.relative(root, fullPath)` before filesystem reads
- File API routes must resolve the effective root with the shared HTTP worktree resolver before validating requested file or directory paths when `worktree` is present
- File-tree route helpers should separate direct-child listing from classification so tests can prove root requests do not recurse into descendants
- Context merge helpers should be pure or testable: root replacement/merge, child insertion by directory path, path error clearing, and stale-response rejection
- Any component that mutates the working tree (file save, create, delete, rename) MUST call `refreshFileTree()` from `useWorkspace()` after the mutation succeeds; failure paths MUST NOT call it
- Components rendering tree-derived UI (e.g., `ExplorerContent`) MUST consume `fileTreeLoading` for initial spinner gating and MUST NOT read `fileTreeRefreshing`
- File tree UI must use per-directory state for child loading/error/retry/empty rendering and must preserve existing unreadable affordances

## Exceptions

- On cold start (full page refresh), workspace UI state starts fresh — only the slug list is restored from `localStorage`
- If `/api/projects` is unreachable on cold start, stale slug pruning is skipped and previously stored slugs are kept
- In test environments, request deduplication may be exercised with mocked fetch promises rather than real network requests
- If a directory child-existence probe fails due to permissions, the directory may be marked unreadable and visible rather than failing the entire tree

## Enforcement

- [x] Automated checks: Unit tests for `OpenProjectsProvider` (open, close, deduplicate, persist, prune, save/restore)
- [x] Automated checks: Unit tests for `ProjectSidebar` (render, active state, close, navigation, accessibility)
- [x] Code review checklist: New sidebar elements must use CSS custom properties, not hardcoded colors
- [x] Test coverage requirements: Workspace state round-trip (save on unmount → restore on mount) must be tested
- [x] Test coverage requirements: `refreshFileTree` unit tests assert `cache: "no-store"`, success update, no-op without slug, explicit slug behavior, and no global loading mutation
- [x] Test coverage requirements: `FileViewer` save tests assert `refreshFileTree` is called exactly once on success and zero times on failure
- [x] Code review checklist: `ExplorerContent` and future tree consumers MUST NOT read `fileTreeRefreshing`
- [x] Automated checks: Context tests must assert root file-tree error state is set on failure, cleared on retry/success, and guarded against stale project responses
- [x] Automated checks: Layout tests must assert ExplorerContent renders error+retry UI when root load fails and tree is empty
- [x] Automated checks: Context tests must assert `showExplorer` defaults, restore behavior, toggle behavior, and save-on-unmount persistence
- [ ] Automated checks: API route tests must assert root requests return direct children only and path requests return direct children only
- [ ] Automated checks: API route tests must assert path traversal and non-directory targets return structured errors
- [ ] Automated checks: Context tests must assert root and same-directory request deduplication by `slug + path`
- [ ] Automated checks: Context tests must assert stale project responses do not overwrite the active project's tree
- [ ] Automated checks: File tree component tests must assert unloaded, loading, loaded, empty, error, retry, and unreadable directory states
- [ ] Test coverage requirements: Server-side exclusion list must filter `.git` by default; exclusion must apply at all directory levels
- [ ] Automated checks: Shared HTTP worktree resolver tests must assert traversal rejection, absolute path rejection, missing worktree handling, valid worktree resolution, and symlink escape rejection
- [ ] Automated checks: File API route tests must assert optional `worktree` support for listing, content read/write, and diff requests while preserving project-root behavior when absent
- [ ] Automated checks: Context tests must assert request keys include active worktree, stale worktree responses are ignored, and root/worktree state is saved and restored on active worktree changes
- [ ] Automated checks: FileViewer tests must assert content GET, save PUT, and diff GET include active worktree context when set
- [ ] Automated checks: WorktreeTree tests must assert filesystem-style selector nodes, project-root clearing, nested worktree names, keyboard accessibility, and `aria-current`
- [ ] Automated checks: WorktreeTree tests must assert missing restored worktrees reset to project root with a non-fatal notice
- [ ] Automated checks: ProjectSidebar tests must assert the active project's worktree selector renders in the project panel and WorkspaceLayout tests must assert it is absent from `ExplorerContent`
- [ ] Automated checks: FileTree tests must assert `.trees` directory nodes render the `Tree` icon in expanded and collapsed states
- [ ] Automated checks: ProjectSidebar tests must assert collapsed icon-only tabs, native titles, always-visible collapsed close buttons, visible Copilot badges, and CSS-hidden mounted WorktreeTree
- [ ] Test coverage requirements: Verification must include `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test`

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
- [ADR-0003-project-registry-persistence](../ADR/ADR-0003-project-registry-persistence.md)
- [ADR-0005-copilot-cli-status-detection-strategy](../ADR/ADR-0005-copilot-cli-status-detection-strategy.md)
- [CORE-COMPONENT-0004-theming](CORE-COMPONENT-0004-theming.md)
- [CORE-COMPONENT-0005-error-handling](CORE-COMPONENT-0005-error-handling.md)
- [CORE-COMPONENT-0006-development-standards](CORE-COMPONENT-0006-development-standards.md)
- [CORE-COMPONENT-0007-shell-layout](CORE-COMPONENT-0007-shell-layout.md)
