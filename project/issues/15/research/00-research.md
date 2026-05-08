# Research Brief — Issue #15

## Problem Statement

When a project is opened in DevDeck, the terminal always starts in a globally-fixed
working directory (`$DEVDECK_WORKSPACE_ROOT` or `$HOME`). There is no per-project
terminal context. The user wants four improvements:

1. Terminal CWD set to the project's resolved filesystem path (server-side, via slug)
2. If `.devcontainer/.tmux-shared` exists in that project directory, attach to the
   tmux shared session instead of spawning a fresh shell
3. Project slug passed as a WebSocket query parameter (`?slug=<slug>`)
4. Security: paths never exposed to the client, slugs validated, tmux session names
   sanitized

## Scope Classification

- **scope_type:** `issue`
- **Issue Number:** 15

> Rationale: This is a feature implementation. No new ADR is required — existing
> ADR-0003 already governs `resolveProjectPath` and server-side path resolution;
> ADR-0004 already establishes the precedent for query parameters on the WS upgrade
> URL. CORE-COMPONENT-0003 (WebSocket Terminal Communication) must be updated to
> document the new `slug` parameter and the tmux detection/attachment pattern.

## Codebase Findings

### 1. Terminal Server — `src/server/terminal-server.mts`

CWD is resolved **once at server startup** (line 62) and applied to every PTY spawn.
There is no per-connection CWD resolution from a client-supplied slug. The `extractToken`
function already parses `req.url` as a URL and pulls query parameters — the slug can
be extracted the same way after token validation.

### 2. Frontend Hook — `src/hooks/use-terminal.ts`

`buildWsUrl()` (lines 52-56) builds a bare `/api/terminal` URL with no query params.
`UseTerminalOptions` only has `wsUrl?: string`. A `slug?: string` field must be added.

### 3. Terminal Panel — `src/components/terminal-panel.tsx`

Called with no options and no props. Must accept `slug?: string` and forward it.

### 4. Workspace Layout — `src/components/workspace-layout.tsx`

Already has `project.slug` available. Must forward it to `<TerminalPanel />`.

### 5. Project Registry — `src/lib/registry.ts`

`resolveProjectPath(slug)` already exists (lines 39-45), sanitizes slugs, and resolves
paths server-side. This is exactly what the terminal server needs.

### 6. Next.js Rewrite — `next.config.ts`

Rewrites forward query parameters by default. No change needed.

### 7. tmux Integration

No tmux integration exists anywhere in the codebase. Entirely new capability.

## Affected Files

### Must Modify

| File | Change Required |
|------|----------------|
| `src/server/terminal-server.mts` | Extract slug from WS URL; call `resolveProjectPath(slug)` per-connection; detect `.devcontainer/.tmux-shared`; spawn tmux or shell accordingly |
| `src/hooks/use-terminal.ts` | Add `slug?: string` to options; update `buildWsUrl()` to append `?slug=` |
| `src/components/terminal-panel.tsx` | Add `slug?: string` prop; pass to `useTerminal()` |
| `src/components/workspace-layout.tsx` | Pass `slug={project.slug}` to `<TerminalPanel />` |
| `src/server/terminal-server.test.ts` | Add tests for slug-based CWD, tmux detection, fallbacks |
| `src/hooks/use-terminal.test.ts` | Add tests for slug in WS URL |
| `project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md` | Document slug parameter, tmux pattern, security rules |
| `project/architecture/ADR/DECISION-LOG.md` | Add new decision records |

### No Change Needed

- `next.config.ts` — rewrites already forward query params
- `src/app/project/[slug]/page.tsx` — slug already flows to WorkspaceLayout
- `src/lib/registry.ts` — `resolveProjectPath` already correct
- `src/lib/auth.ts` — token auth unchanged

## ADR / Core-Component Impact

**Updates Required:** CORE-COMPONENT-0003 needs slug parameter, CWD resolution rules, tmux detection pattern, and security rules.

**No new ADR or core-component required.** All decisions fit within existing artifacts.

## Data Flow

```
ProjectPage(slug) → WorkspaceLayout(project) → TerminalPanel(slug) → useTerminal({slug})
  → buildWsUrl(slug) → "/api/terminal?slug=my-project"
    → WS upgrade via proxy → terminal-server
      1. validateToken()
      2. extractSlug(req.url)
      3. resolveProjectPath(slug)
      4. fs.access(cwd/.devcontainer/.tmux-shared)
      5a. tmux exists → spawn("tmux", [...])
      5b. no tmux → spawn(shell, shellArgs, { cwd })
```

## Test IDs

- `terminal-server.test.ts` current highest: T15
- `use-terminal.test.ts` current highest: T19

## Handoff to Plan Stage

1. Update CORE-COMPONENT-0003 with slug parameter, tmux detection, security rules
2. Decide tmux-session-not-found policy (error vs. fallback)
3. Verify import path for `resolveProjectPath` in `.mts` context
4. No new ADR required
