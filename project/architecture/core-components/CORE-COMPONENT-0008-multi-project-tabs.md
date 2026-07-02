# CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State

## Status

Adopted (amended) - 2026-07-01

## Purpose

Enable users to keep multiple projects "open" simultaneously via persistent sidebar tabs, preserving per-project workspace UI state (selected file, expanded folders, panel visibility, loaded file-tree state, per-directory load state, and selected workspace context) in memory while switching between projects. This removes the need to navigate back to the landing page and re-enter a project, ensures the workspace feels stateful across tab switches, prevents large workspaces from blocking initial explorer rendering through eager deep traversal, keeps active file-tree and worktree-selector state synchronized with filesystem changes in near realtime, and ensures root/worktree selection is represented by safe server-issued workspace identities rather than client-constructed filesystem paths.

## Scope

- Open projects list management (add, remove, deduplicate)
- Per-project workspace UI state cache (in-memory `Map`)
- localStorage persistence of the open project slug list only
- Stale slug pruning on cold start
- Save/restore lifecycle between `WorkspaceProvider` and `OpenProjectsProvider`
- Sidebar rendering, interaction, and accessibility contracts
- Current-project close action in the workspace panel control bar
- File tree refresh contract exposed via `WorkspaceContext` for in-portal edits
- Lazy file-tree loading contract for root and directory children
- File-tree request deduplication and stale-response protection
- Per-directory loading, error, retry, and empty-state behavior
- Worktree-aware file-tree root switching, request scoping, and per-worktree state caching
- Worktree-aware HTTP file APIs and FileViewer requests
- Worktree selector visualization and `.trees/` directory icon behavior
- Near-realtime server-push synchronization for active file-tree state, with 5000 ms degraded polling fallback for file-tree and worktree list state
- Selected-project/workspace detail state consumed by the sidebar, Explorer, FileViewer, file-tree sync, and project-page terminal
- Server-issued workspace context identity, repository/worktree status, sanitized labels, and unavailable/stale context handling

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
- Collapsed sidebar tabs MUST keep the project badge visible
- Expanded sidebar tabs MUST display the project badge and the project name as a visible truncated text label
- Sidebar project badges MUST render the first project-name letter when Copilot status is `"idle"` or unrecognized, and a visible Copilot-style bot head icon when Copilot status is `"running"` or `"waiting"`
- Sidebar tabs MUST show the full project name via the native `title` attribute (no `@radix-ui/react-tooltip` dependency)
- The active project tab MUST be visually distinguished (e.g., left border accent, brighter background)
- Each tab MUST have a close button to remove the project from the open list
- Expanded sidebar close buttons MAY be visible on hover/focus
- Collapsed sidebar close buttons MUST be always visible
- `WorkspaceLayout` MUST expose a current-project Close Project action in the workspace panel control bar for active project routes
- `OpenProjectsContextValue` MUST expose `requestProjectClose(slug, activeSlug)` and `clearProjectCloseRequest(slug)` so sidebar and workspace close actions share one normalized close request path
- `requestProjectClose` MUST trim the requested slug before pending-guard checks, `closeNavigationTarget(...)`, `closeProject(...)`, and pending-state clearing; empty normalized slugs MUST return `{ accepted: false, target: null, reason: "invalid-slug" }`
- `requestProjectClose` MUST guard duplicate close requests per normalized slug with provider-owned pending state and return `{ accepted: false, target: null, reason: "pending" }` for repeated pending requests
- Accepted active-project close requests MUST return the `closeNavigationTarget(...)` result, falling back to `/` when the active slug is stale or absent from `openProjects`; accepted inactive close requests MUST return `target: null`
- Sidebar and workspace UI callers MUST call `router.push(target)` when an accepted close request returns a target; if navigation throws, callers MUST call `clearProjectCloseRequest(normalizedSlug)` and log only the normalized slug and target
- Workspace close actions MUST use safe label/title text derived from `(project.name ?? "").trim() || normalizedSlug`, never `project.path`
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
- `refreshFileTree` MUST issue a root request to `/api/files?slug=<targetSlug>` with `{ cache: "no-store" }`, appending `workspaceContext=<activeWorkspaceContextId>` when the selected context is not `"root"`
- `loadDirectoryChildren` MUST issue `/api/files?slug=<targetSlug>&path=<relative-dir>` with `{ cache: "no-store" }`, appending `workspaceContext=<activeWorkspaceContextId>` when the selected context is not `"root"`
- Root and child file-tree requests MUST be deduplicated by `slug + activeWorkspaceContextId + path`; duplicate in-flight calls for the same scoped key MUST share the same work and MUST NOT issue duplicate fetches
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
- `WorkspaceContext` MUST expose `activeWorkspaceContextId: WorkspaceContextId` and `setActiveWorkspaceContext(id: WorkspaceContextId)` where `WorkspaceContextId` is `"root"` for the project root or a server-issued `wt_<hash>` worktree identity
- `WorkspaceContext` MUST expose `worktreesSectionCollapsed: boolean` and `toggleWorktreesSection()`
- `PerProjectWorkspaceState` MUST include `activeWorkspaceContextId: WorkspaceContextId` and `worktreesSectionCollapsed: boolean` for per-project in-memory cache persistence; selected workspace context MUST NOT be persisted to `localStorage`
- `WorkspaceProvider` MUST preserve project-root and worktree file-tree state separately within each project; switching selected workspace context MUST save the outgoing scoped state and restore the incoming scoped state when available
- Worktree-scoped workspace state MUST include `fileTree`, `expandedFolders`, `selectedFile`, loaded directory paths, directory errors, and directory loading state safe defaults
- Worktree-scoped workspace state MUST be keyed by project slug plus `WorkspaceContextId`, where `"root"` represents the project root
- `WorkspaceProvider` MUST keep a current selected-workspace-context ref alongside the current slug ref so stale file-tree responses compare both dimensions before mutating visible state
- Server-issued worktree IDs MUST be recomputed from the current Git worktree list as `wt_${sha256(realProjectRoot + "\0" + realWorktreePath).slice(0, 24)}`; clients MUST treat IDs as opaque and MUST NOT construct filesystem paths
- Git-reported linked worktrees MUST be eligible regardless of whether their checkout path is physically under `<projectRoot>/.trees/`
- Duplicate or colliding server-issued worktree IDs MUST be marked unavailable in the worktree response and MUST be rejected by resolvers until the conflict is removed
- `GET /api/files`, `GET /api/files/content`, `PUT /api/files/content`, `GET /api/files/diff`, and `GET /api/files/events` MUST accept an optional `workspaceContext` parameter; omitting it or passing `"root"` MUST preserve project-root behavior
- HTTP file APIs MUST resolve workspace roots with a shared helper that first resolves the project root with `resolveProjectPath(slug)`, then validates `workspaceContext` against the current Git-reported worktree list server-side
- The shared workspace-context resolver MUST reject empty, absolute, traversal-containing, unknown, stale, disabled, duplicate, or unavailable workspace context parameters
- The shared workspace-context resolver MUST call `fs.realpath()` on the selected project root or Git-reported worktree path before serving filesystem APIs; it MUST NOT trust client-provided paths or labels
- Missing, prunable, locked, stale, duplicate, or unavailable worktree contexts MUST produce structured workspace-context errors rather than an empty directory listing
- When `/api/files` serves a worktree-rooted request, every returned `FileNode.path` MUST be relative to the resolved worktree root
- `FileViewer` MUST pass the selected `workspaceContext` to content GET, content PUT, and diff GET requests when the selected context is not `"root"`
- `FileViewer` MUST rely on `refreshFileTree()` to refresh the currently selected root or worktree context after successful saves
- `PerProjectWorkspaceState` MUST include `copilotStatus?: CopilotCliState` for per-project Copilot CLI status caching
- `OpenProjectsContextValue` MUST expose `updateCopilotStatus(slug: string, status: CopilotCliState): void` to update the cached Copilot status for a project
- `OpenProjectsContextValue` MUST expose `getCopilotStatus(slug: string): CopilotCliState` to read the cached Copilot status for a project (returns `"idle"` if not set)
- `closeProject(slug)` MUST clear the cached `copilotStatus` for that slug by explicitly deleting the entry from the separate `copilotStatuses` Map
- Direct URL navigation and cold-start sidebar hydration MUST display `"idle"` until a fresh `"status"` frame is received
- Sidebar tabs MUST render active Copilot CLI status by replacing the project badge's first-letter content with a Copilot-style bot head icon when `copilotStatus` is `"running"` or `"waiting"`
- The active Copilot bot badge MUST keep the existing `h-6 w-6` badge wrapper, use the bot icon's own visible colors instead of the language-color fill, and the surrounding tab MUST keep the native project-name `title`
- The active Copilot bot badge MUST suppress the legacy adjacent/overlay dot indicator; only one Copilot badge indicator may render per active project tab
- The active Copilot bot badge MUST expose `sr-only` text with `role="status"` describing `"Copilot CLI running"` or `"Copilot CLI waiting for input"` and MUST NOT rely on color alone
- The running Copilot bot badge MUST use `animate-pulse`; the waiting Copilot bot badge MUST use an amber ring and MUST NOT pulse
- The status indicator MUST be hidden when status is `"idle"` or unrecognized by rendering the existing first-letter badge with no Copilot `role="status"` element
- The status indicator MUST NOT be cleared merely because one browser terminal WebSocket disconnects; it remains driven by the latest server status frame and is hidden only after an explicit `"idle"` status, an unrecognized status, or project closure
- `ProjectTerminalPanel` MUST update `OpenProjectsContext` Copilot status only while its terminal WebSocket is connected so a failed or disconnected browser session does not overwrite a valid active project badge with `"idle"`; default host `TerminalPanel` MUST NOT update project Copilot state
- Sidebar Copilot bot badges MUST remain visible on project badges in expanded and collapsed modes
- The selected-project workspace detail MUST be rendered in `ProjectSidebar` as a separate selected-detail region for the active project, not nested inside any project navigation row, and MUST NOT render inside `ExplorerContent`
- Worktree data MUST be fetched via `GET /api/worktrees?slug=<slug>` returning a `WorkspaceContextResponse`; repository and worktree failures MUST return sanitized status payloads rather than pretending no worktrees exist
- A `useWorktrees(slug: string | undefined)` hook MUST be provided exposing `{ response: WorkspaceContextResponse | null, loading: boolean, error: string | null, refresh: () => void }`
- `WorktreeTree` or its selected-detail replacement MUST render filesystem-style selector nodes with icons, indentation, keyboard-accessible available choices, `aria-current` on the active entry, and active-state affordances that do not rely on color alone
- `WorktreeTree` MUST remain a selector only; it MUST NOT render nested inline file trees under each worktree
- The project-root selector MUST set `activeWorkspaceContextId` to `"root"`; worktree selectors MUST set it only to a server-issued worktree `id` from the latest response
- If a restored or active workspace context is no longer returned by `GET /api/worktrees`, the UI MUST keep the stale context as a blocked state, show an actionable notice, and MUST NOT silently reset to project root or another checkout
- Repository, root, and worktree labels MUST be sanitized before UI rendering; labels MUST NOT include absolute filesystem paths, credentials, remote URL userinfo, query tokens, or fragments
- Duplicate visible worktree labels MUST be disambiguated with sanitized branch, detached-HEAD, short SHA, or ordinal text; path disclosure MUST NOT be used for disambiguation
- Disabled worktree choices such as locked, prunable, missing, duplicate, conflicting, Git-unavailable, or repository-unavailable states MUST not activate file, sync, or terminal requests
- `FileTree` directory nodes named `.trees` MUST render a `Tree` icon from `@phosphor-icons/react` in both expanded and collapsed states
- Near-realtime file explorer synchronization MUST use `GET /api/files/events?slug=<slug>[&workspaceContext=<id>]` SSE server-push invalidation as the primary transport, per ADR-0007
- File-tree SSE events MUST be treated as invalidation hints only; clients MUST refresh canonical state through existing `/api/files` root and directory responses
- The file-tree sync stream MUST emit only the named events `file-tree:ready`, `file-tree:changed`, and `file-tree:degraded`
- `file-tree:ready` MUST mark the scoped stream usable without mutating file-tree contents or clearing existing loaded-directory state
- `file-tree:changed` MUST include a scoped invalidation payload with relative POSIX path hints, loaded-directory hints, git-status/root flags, truncation metadata, and no absolute paths
- `file-tree:degraded` MUST include a retry/degraded reason and the 5000 ms fallback polling interval; recoverable degraded events MUST start fallback polling
- `WorkspaceContext` MUST expose file-tree sync status, sync error text/code, and a manual retry action for Explorer UI
- `WorkspaceContext` MUST expose a file-tree invalidation API that validates event scope before refreshing root and loaded-directory state
- Changed events that affect root entries, git status, unknown scope, or truncated batches MUST call `refreshFileTree(...)` for the active project/workspace-context scope
- Changed events that affect loaded directories MUST reload each affected loaded direct-child directory with `loadDirectoryChildren(...)` while preserving expanded-folder and selected-file state
- Loaded-directory invalidation MUST support file create, delete, rename, and directory empty/non-empty transitions by updating `children`, `childrenLoaded`, and `hasChildren` from canonical `/api/files` responses
- Collapsed directories MUST receive refreshed `hasChildren` metadata through their nearest refreshed parent/root listing without forcing expansion
- If a canonical invalidation refresh proves the selected file no longer exists in the active scope, `selectedFile` MUST be cleared without crashing `FileViewer`
- Sync invalidation MUST ignore stale project slug, stale workspace context, stale generation, obsolete directory, and inactive workspace-context events before mutating visible state
- The current 5000 ms root file-tree polling implementation MUST be retained only as degraded fallback, not primary synchronization
- Fallback poll ticks MUST call the existing `refreshFileTree(...)` path directly and MUST NOT call initial-load wrappers or mutate `fileTreeLoading`
- Fallback polling MUST reuse `refreshFileTree` no-store fetches, in-flight deduplication, root merge behavior, `fileTreeRefreshing`, stale slug/workspace-context guards, and silent refresh semantics
- Fallback polling MUST pause while `document.visibilityState === "hidden"` and MUST perform one immediate catch-up refresh when the document becomes visible
- Worktree list state MAY continue using the existing 5000 ms no-store polling lifecycle as degraded fallback until worktree-specific server-push invalidation is implemented
- Worktree list fallback poll ticks MUST avoid overlapping same-slug requests and MUST ignore or abort stale slug responses
- EventSource, fallback polling, and visibility code MUST guard browser-only APIs with `typeof document !== "undefined"` and MUST clean up streams, timers, and listeners on unmount, project changes, workspace-context changes, slug changes, and React Strict Mode remounts
- File-tree sync failures MUST preserve existing visible file-tree/worktree state and follow non-disruptive refresh error behavior

### Interfaces

- **OpenProjectsProvider:** React context providing `openProjects`, `openProject()`, `closeProject()`, `requestProjectClose()`, `clearProjectCloseRequest()`, `saveWorkspaceState()`, `restoreWorkspaceState()`, `updateCopilotStatus()`, `getCopilotStatus()`
- **useOpenProjects():** Hook to consume the context; throws if used outside provider
- **WorkspaceContextId:** `"root" | \`wt_${string}\`` where non-root values are opaque server-issued IDs derived from the current Git worktree list
- **WorkspaceContextChoice:** `{ id: WorkspaceContextId; kind: "root" | "worktree"; label: string; activeLabel: string; branchLabel?: string; headLabel?: string; status: "available" | "locked" | "prunable" | "missing" | "duplicate" | "conflicting" | "stale" | "unavailable"; disabled: boolean; disabledReason?: string; errorCode?: string }`
- **WorkspaceContextResponse:** `{ repository: { status: "available" | "not-git" | "git-unavailable" | "unavailable"; label: string; remoteLabel?: string; message?: string }; root: WorkspaceContextChoice; worktrees: WorkspaceContextChoice[]; generatedAt: string }`
- **PerProjectWorkspaceState:** `{ selectedFile: string | null; expandedFolders: string[]; showExplorer?: boolean; showFileViewer: boolean; showTerminal: boolean; fileTree: FileNode[]; directoryLoadErrors?: Record<string, string>; loadedDirectories?: string[]; activeWorkspaceContextId: WorkspaceContextId; worktreesSectionCollapsed: boolean }`
- **FileNode lazy metadata:** `hasChildren?: boolean; childrenLoaded?: boolean; children?: FileNode[]; unreadable?: boolean; truncated?: boolean; truncatedReason?: "max-depth" | "entry-limit"`
- **File tree root endpoint:** `GET /api/files?slug=<slug>[&workspaceContext=<id>]` returns `FileNode[]` containing direct root children of the project root or selected worktree root only
- **File tree directory endpoint:** `GET /api/files?slug=<slug>&path=<relative-dir>[&workspaceContext=<id>]` returns `FileNode[]` containing direct children of the requested directory under the selected root
- **File content endpoint:** `GET /api/files/content?slug=<slug>&path=<relative-file>[&workspaceContext=<id>]` reads from the selected root; `PUT /api/files/content` accepts the same optional `workspaceContext` in its JSON body
- **File diff endpoint:** `GET /api/files/diff?slug=<slug>&path=<relative-file>[&workspaceContext=<id>]` runs git diff/status from the selected root
- **Shared workspace-context resolver:** `resolveWorkspaceContextRoot(slug: string, workspaceContext?: WorkspaceContextId): Promise<{ root: string; scope: FileTreeSyncScope; choice: WorkspaceContextChoice }>` resolves the effective API root and validates server-issued IDs against the current Git worktree list
- **WorkspaceContextValue (extended):** in addition to existing members (`setProject`, `selectFile`, `toggleFolder`, `toggleFileViewer`, `toggleTerminal`, `setFileTree`, `setFileTreeLoading`), MUST include:
  - `showExplorer: boolean` — whether the Explorer panel is expanded
  - `toggleExplorer: () => void` — toggles Explorer visibility while preserving mounted Explorer state
  - `refreshFileTree: (explicitSlug?: string) => Promise<void>` — root lazy-list refresh using `cache: "no-store"`; uses `explicitSlug` when provided, else active `project.slug`, and scopes the request to `activeWorkspaceContextId` when not `"root"`
  - `loadDirectoryChildren: (path: string, explicitSlug?: string) => Promise<void>` — lazy child-list request and merge for a readable directory, scoped to `activeWorkspaceContextId` when not `"root"`
  - `fileTreeRefreshing: boolean` — true while any root refresh is in flight
  - `fileTreeError: string | null` — set when a root refresh fails (non-OK or network error), cleared on new refresh start, success, or project switch; used by `ExplorerContent` to render error+retry UI when tree is empty
  - `fileTreeSyncStatus: FileTreeSyncStatus` — exposes EventSource/degraded synchronization state for the active project/workspace-context scope
  - `fileTreeSyncError: string | null` — exposes the latest sync connection/degraded error message or code for accessible Explorer status UI
  - `retryFileTreeSync: () => void` — manually restarts a retryable file-tree sync stream and exits degraded fallback when the stream becomes ready
  - `invalidateFileTreeScope: (event: FileTreeChangedEvent) => Promise<void>` — validates event scope, refreshes the canonical root when needed, and reloads affected loaded directories
  - `directoryLoading: ReadonlySet<string>` or equivalent serializable/context-safe representation — directory paths with in-flight child loads
  - `directoryErrors: ReadonlyMap<string, string>` or equivalent serializable/context-safe representation — directory paths with last child-load error messages
  - `retryDirectoryChildren: (path: string) => Promise<void>` MAY be exposed as an alias or implemented by clearing the path error and calling `loadDirectoryChildren(path)`
  - `activeWorkspaceContextId: WorkspaceContextId` — `"root"` or the server-issued ID of the currently selected worktree
  - `activeWorkspaceContextStatus: "available" | "stale" | "unavailable"` — blocks file, sync, and terminal work when the selected ID is not usable
  - `setActiveWorkspaceContext: (id: WorkspaceContextId) => void` — set the selected workspace context from a server-issued choice
  - `worktreesSectionCollapsed: boolean` — whether the worktrees section in the project sidebar is collapsed
  - `toggleWorktreesSection: () => void` — toggle worktrees section collapsed state
- **Worktree endpoint:** `GET /api/worktrees?slug=<slug>` → `WorkspaceContextResponse` — parses `git worktree list --porcelain`, includes Git-reported external worktrees, emits sanitized repository/worktree status, and never emits absolute filesystem paths
- **File-tree sync endpoint:** `GET /api/files/events?slug=<slug>[&workspaceContext=<id>]` opens a same-origin authenticated SSE stream that emits scoped file-tree invalidation events and never emits absolute filesystem paths
- **FileTreeSyncScope:** `{ slug: string; workspaceContext: WorkspaceContextId }` where `"root"` represents the project root and non-root values use the same server-issued ID accepted by `/api/files`
- **File-tree sync ready event:** SSE event name `file-tree:ready`; data `{ type: "file-tree:ready"; scope: FileTreeSyncScope; pollIntervalMs: 5000 }`
- **File-tree sync changed event:** SSE event name `file-tree:changed`; data `{ type: "file-tree:changed"; scope: FileTreeSyncScope; paths: string[]; directories: string[]; rootChanged: boolean; gitStatusChanged: boolean; truncated: boolean; version: number }`
- **File-tree sync degraded event:** SSE event name `file-tree:degraded`; data `{ type: "file-tree:degraded"; scope: FileTreeSyncScope; code: string; message: string; retryAfterMs?: number; pollIntervalMs: 5000; fatal?: boolean }`
- **FileTreeSyncStatus:** `"connecting" | "ready" | "syncing" | "degraded" | "error" | "unauthorized"`; `unauthorized` and fatal invalid-parameter states are non-retryable without a context/auth change
- **useFileTreeSync(slug, workspaceContext):** Client-only hook that owns EventSource lifecycle, scoped event parsing, retry/backoff, degraded fallback polling handoff, heartbeat timeout detection, stale-scope cleanup, and manual retry
- **Near-realtime degraded sync interval:** `5000` ms default for fallback active root file-tree and active project worktree list polling; configurability is deferred until a future config-system amendment
- **Near-realtime fallback polling lifecycle:** Client-only workspace lifecycle that calls `refreshFileTree(project.slug)` on degraded interval ticks and visibility catch-up without touching `fileTreeLoading`
- **useWorktrees(slug: string | undefined):** Hook exposing `{ response: WorkspaceContextResponse | null, loading: boolean, error: string | null, refresh: () => void }`; it retains no-store active-project worktree list refresh, degraded fallback polling, visibility pause/resume, stale-response guards, and cleanup
- **SelectedWorkspaceDetail / WorktreeTree:** Selector component rendered in the project sidebar selected-detail region; lists project root and worktrees as filesystem-style selector nodes without nested inline file trees and blocks unavailable/stale choices
- **ProjectSidebar:** Component rendering the collapsible vertical tab strip, conditional Copilot bot badge replacement, and a separate selected-project workspace detail region; consumes `useOpenProjects()` and `usePathname()`
- **WorkspaceLayout Close Project action:** Visible current-project control that consumes `useOpenProjects().requestProjectClose()`, `clearProjectCloseRequest()`, and `useRouter()` to mirror sidebar close navigation from wide workspace controls
- **languageColor(language?: string): string** — Shared utility extracted to `src/lib/utils.ts`

### Expectations

- Workspace UI state MUST survive tab switches within a session (in-memory cache hit)
- Workspace UI state MAY be lost on full page refresh (acceptable — only slugs persist)
- Project-page terminal state is owned by the explicit scoped terminal contract in CORE-COMPONENT-0003 and restarts when the selected workspace context changes; no client-side terminal buffer caching is required
- The sidebar MUST NOT appear on the landing page — only on `/project/*` routes
- The `OpenProjectsProvider` MUST hydrate stored slugs by fetching `/api/projects` on cold start for metadata and stale slug pruning; the project page component also calls `openProject()` after fetching for direct URL navigation
- Opening a large workspace MUST render direct root entries without waiting for an eager depth-6 traversal
- Expanding a directory MUST load only that directory's direct children
- Duplicate root or same-directory requests MUST not create duplicate network calls while one equivalent request is already in flight
- Switching projects while file-tree requests are in flight MUST NOT allow stale responses to overwrite the active project's tree
- After every successful in-portal save, the file explorer's visible git-status badges (`M`, `A`, `D`, `??`) MUST refresh without a manual reload, page refresh, or tab switch
- External filesystem changes made by terminals, editors, or background processes SHOULD appear after server-push invalidation plus canonical `/api/files` refresh while the stream is ready
- In degraded mode, external filesystem changes SHOULD appear in the active root file tree within one 5000 ms fallback polling interval while the document is visible
- Worktree additions, removals, and status changes SHOULD appear in the active project's selected-detail selector through explicit refresh or degraded fallback polling within one 5000 ms interval while the document is visible
- When fallback polling is active and the document returns from hidden to visible, the root file tree and active project worktree list SHOULD catch up immediately instead of waiting for the next interval tick
- Silent refresh MUST NOT cause the explorer to remount, scroll-jump, lose folder expansion state, or flash a global spinner
- Lazy loading MUST preserve visibility of all user-relevant entries. Internal tooling directories excluded by the server-side exclusion list (e.g. `.git`) are exempt from the visibility requirement.

## Rationale

An in-memory `Map` cache avoids the complexity and performance cost of serializing large `fileTree` arrays to `localStorage` on every state change. Persisting only slugs keeps `localStorage` usage minimal and avoids stale data issues. Mounting the provider at root layout level ensures the cache survives Next.js client-side navigations. The sidebar is deliberately minimal (icon-width) to avoid consuming workspace real estate.

The file tree previously performed an eager recursive traversal to depth 6 for every root load. After all-files visibility was introduced, large directories such as `node_modules`, `.git`, and `.next` made this root request too expensive. Lazy direct-child listing keeps complete visibility of user-relevant entries while making initial render proportional to root breadth instead of total descendant count. The original hide-list prohibition (Decision #72) was motivated by performance concerns — hiding entries was rejected to avoid silently concealing real project state. Now that lazy loading handles performance, a server-side exclusion list filtering noise directories (e.g. `.git`) is permitted as a UX improvement. The `.git` directory contains internal VCS database objects that are never meaningful to browse; filtering it improves signal-to-noise without hiding real project state.

Request deduplication and stale-response protection are required because React initialization, project switching, and user expansion actions can overlap. Per-directory state is required so one failed or slow child load does not blank the whole explorer.

Worktree file-tree integration extends the same lazy loading and stale-response model to multiple roots within one project. The project root and each linked worktree can contain identical relative paths such as `src/`, so request keys and cached UI state must include the selected workspace context dimension to prevent collisions and stale UI. Server-issued IDs avoid leaking or trusting checkout paths while still allowing Git-reported worktrees outside the project `.trees/` convention.

Near-realtime synchronization uses server-push SSE invalidation as the primary contract because Issue #81 requires external filesystem changes to reach the explorer without waiting for fixed client polling. SSE keeps the transport one-way and compatible with HTTP auth middleware, while canonical `/api/files` refreshes preserve existing path validation, worktree scoping, git status, and lazy direct-child listing behavior. The existing 5000 ms polling implementation remains valuable as degraded fallback when EventSource or the watcher stream is unavailable, but it is no longer the primary near-realtime mechanism. Configurable fallback intervals are deferred until a future config amendment demonstrates demand.

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

```tsx
// Client-only server-push invalidation sketch
useFileTreeSync({
  slug: project.slug,
  workspaceContext: activeWorkspaceContextId,
  onChanged: async (event) => {
    await invalidateFileTreeScope(event);
  },
  onDegraded: () => {
    // Existing 5000 ms polling starts only in degraded mode.
    startFallbackPolling();
  },
});
```

## Integration Guidelines

- `OpenProjectsProvider` wraps children in `src/app/layout.tsx` as a Client Component wrapper below `ThemeProvider`
- The intermediate layout at `src/app/project/layout.tsx` wraps project routes in `WorkspaceProvider` and renders `<ProjectSidebar />` + `{children}` in a flex row so the project panel and workspace panels share selected workspace context state
- `WorkspaceProvider` in `src/lib/workspace-context.tsx` accepts an optional `slug` prop and calls `restoreWorkspaceState`/`saveWorkspaceState`
- `PerProjectWorkspaceState` lives in `src/lib/types.ts`
- `languageColor()` is shared from `src/lib/utils.ts` for use by both `ProjectCard` and `ProjectSidebar`
- `WorkspaceLayout` treats its `project.slug` prop as the active slug when calling `requestProjectClose(project.slug, project.slug)`
- The file-tree API route must validate `path` with `path.resolve(root, requestedPath)` and `path.relative(root, fullPath)` before filesystem reads
- File API routes must resolve the effective root with the shared workspace-context resolver before validating requested file or directory paths when `workspaceContext` is present
- File-tree route helpers should separate direct-child listing from classification so tests can prove root requests do not recurse into descendants
- Context merge helpers should be pure or testable: root replacement/merge, child insertion by directory path, path error clearing, and stale-response rejection
- Any component that mutates the working tree (file save, create, delete, rename) MUST call `refreshFileTree()` from `useWorkspace()` after the mutation succeeds; failure paths MUST NOT call it
- Components rendering tree-derived UI (e.g., `ExplorerContent`) MUST consume `fileTreeLoading` for initial spinner gating and MUST NOT read `fileTreeRefreshing`
- File tree UI must use per-directory state for child loading/error/retry/empty rendering and must preserve existing unreadable affordances
- `useFileTreeSync` belongs at the client workspace boundary (`WorkspaceLayout` or a dedicated child hook used by it) where the active project and selected workspace context are known
- SSE changed-event handling must call `invalidateFileTreeScope(...)`; only canonical `/api/files` refreshes may mutate file-tree nodes
- Fallback poll ticks must call `refreshFileTree(...)` directly; only initial load and explicit retry flows may use wrappers that set `fileTreeLoading`
- Worktree list fallback polling belongs in `useWorktrees` or its caller and must share the 5000 ms interval, document visibility pause/resume, no-store fetch behavior, stale workspace-context guards, and cleanup contract
- Sync tests must cover EventSource lifecycle, fake-timer fallback polling, mocked `document.visibilityState`, stale-scope cleanup, and listener cleanup without real-time sleeps

## Exceptions

- On cold start (full page refresh), workspace UI state starts fresh — only the slug list is restored from `localStorage`
- If `/api/projects` is unreachable on cold start, stale slug pruning is skipped and previously stored slugs are kept
- In test environments, request deduplication may be exercised with mocked fetch promises rather than real network requests
- In SSR or non-browser test environments where `document` or `EventSource` is unavailable, server-push sync and fallback polling are disabled and initial/manual refresh behavior remains authoritative
- The 5000 ms fallback polling interval is fixed for v1; per-user or config-file interval customization requires a future ADR-0006-aligned amendment
- If a directory child-existence probe fails due to permissions, the directory may be marked unreadable and visible rather than failing the entire tree

## Enforcement

- [x] Automated checks: Unit tests for `OpenProjectsProvider` (open, close, deduplicate, persist, prune, save/restore, requestProjectClose, clearProjectCloseRequest)
- [x] Automated checks: Unit tests for `ProjectSidebar` (render, active state, close, navigation, accessibility)
- [x] Code review checklist: New sidebar elements must use CSS custom properties, not hardcoded colors
- [x] Test coverage requirements: Workspace state round-trip (save on unmount → restore on mount) must be tested
- [x] Test coverage requirements: `refreshFileTree` unit tests assert `cache: "no-store"`, success update, no-op without slug, explicit slug behavior, and no global loading mutation
- [x] Test coverage requirements: `FileViewer` save tests assert `refreshFileTree` is called exactly once on success and zero times on failure
- [x] Code review checklist: `ExplorerContent` and future tree consumers MUST NOT read `fileTreeRefreshing`
- [x] Automated checks: Context tests must assert root file-tree error state is set on failure, cleared on retry/success, and guarded against stale project responses
- [x] Automated checks: Layout tests must assert ExplorerContent renders error+retry UI when root load fails and tree is empty
- [x] Automated checks: Context tests must assert `showExplorer` defaults, restore behavior, toggle behavior, and save-on-unmount persistence
- [x] Automated checks: WorkspaceLayout tests must assert current-project close rendering and close navigation for multiple-open-project and single-open-project cases
- [ ] Automated checks: API route tests must assert root requests return direct children only and path requests return direct children only
- [ ] Automated checks: API route tests must assert path traversal and non-directory targets return structured errors
- [ ] Automated checks: Context tests must assert root and same-directory request deduplication by `slug + path`
- [ ] Automated checks: Context tests must assert stale project responses do not overwrite the active project's tree
- [ ] Automated checks: File tree component tests must assert unloaded, loading, loaded, empty, error, retry, and unreadable directory states
- [ ] Test coverage requirements: Server-side exclusion list must filter `.git` by default; exclusion must apply at all directory levels
- [ ] Automated checks: Shared workspace-context resolver tests must assert opaque ID validation, stale/disabled rejection, external Git worktree resolution, duplicate/collision rejection, and no client path trust
- [ ] Automated checks: File API route tests must assert optional `workspaceContext` support for listing, content read/write, and diff requests while preserving project-root behavior when absent
- [ ] Automated checks: Context tests must assert request keys include selected workspace context, stale workspace responses are ignored, blocked contexts suppress file/sync actions, and root/worktree state is saved and restored on context changes
- [ ] Automated checks: FileViewer tests must assert content GET, save PUT, and diff GET include selected `workspaceContext` when set and remain blocked for stale/unavailable contexts
- [ ] Automated checks: SelectedWorkspaceDetail/WorktreeTree tests must assert filesystem-style selector nodes, project-root selection, server-issued IDs, duplicate-label disambiguation, keyboard accessibility, and `aria-current`
- [ ] Automated checks: SelectedWorkspaceDetail/WorktreeTree tests must assert missing restored worktrees remain blocked and never auto-reset to project root
- [ ] Automated checks: ProjectSidebar tests must assert selected workspace detail renders outside project navigation rows and WorkspaceLayout tests must assert it is absent from `ExplorerContent`
- [ ] Automated checks: FileTree tests must assert `.trees` directory nodes render the `Tree` icon in expanded and collapsed states
- [ ] Automated checks: ProjectSidebar tests must assert collapsed icon-only tabs, native titles, always-visible collapsed close buttons, visible Copilot badges, and CSS-hidden mounted WorktreeTree
- [ ] Automated checks: ProjectSidebar tests must assert Copilot-style bot badges for running/waiting, idle/unknown initial fallback, no overlay dot, `sr-only role="status"`, native titles, and independent per-project statuses
- [ ] Automated checks: File-tree sync endpoint tests must assert ready/changed/degraded events, auth/origin rejection, invalid scope rejection, path redaction, batching, resource caps, and watcher cleanup
- [ ] Automated checks: File-tree sync hook tests must assert EventSource lifecycle, scoped URL construction, ready/changed/degraded handling, heartbeat timeout, retry/backoff, Strict Mode cleanup, and degraded fallback handoff
- [ ] Automated checks: Workspace invalidation tests must assert root refresh, loaded-directory refresh, collapsed `hasChildren` updates, empty transitions, stale project/workspace-context event rejection, and selected-file deletion behavior
- [ ] Automated checks: Fallback polling tests must assert 5000 ms root refresh ticks only while degraded, no `fileTreeLoading` mutation, hidden pause, visible catch-up, unmount cleanup, and project/workspace-context lifecycle cleanup
- [ ] Automated checks: Worktree fallback polling tests must assert no-store interval refresh, hidden pause, visible catch-up, no overlapping same-slug requests, stale slug protection, and abort/listener cleanup
- [ ] Automated checks: Near-realtime regression tests must assert SSE and fallback polling reuse `refreshFileTree` deduplication and stale slug/workspace-context guards without remounting or globally spinning ExplorerContent
- [ ] Test coverage requirements: Verification must include `./harness verify`, which covers lint, format check, build, tests, and smoke verification

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
- [ADR-0003-project-registry-persistence](../ADR/ADR-0003-project-registry-persistence.md)
- [ADR-0005-copilot-cli-status-detection-strategy](../ADR/ADR-0005-copilot-cli-status-detection-strategy.md)
- [ADR-0007-filesystem-sync-transport-strategy](../ADR/ADR-0007-filesystem-sync-transport-strategy.md)
- [CORE-COMPONENT-0004-theming](CORE-COMPONENT-0004-theming.md)
- [CORE-COMPONENT-0005-error-handling](CORE-COMPONENT-0005-error-handling.md)
- [CORE-COMPONENT-0006-development-standards](CORE-COMPONENT-0006-development-standards.md)
- [CORE-COMPONENT-0007-shell-layout](CORE-COMPONENT-0007-shell-layout.md)
