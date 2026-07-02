# Issue #103 Implementation Notes

## Follow-up blockers fixed

- Updated `src/hooks/use-terminal.ts` so the project-page terminal uses the scoped `/api/terminal/project` endpoint for both the selected project root and selected worktree contexts. The request now sends `slug=<slug>` plus `workspaceContext=root` for project root and `workspaceContext=<id>` for worktrees, while the default host-rooted `/api/terminal` behavior remains unchanged when no project-page terminal is active.
- Updated `src/components/project-sidebar.tsx` so the selected-project detail region always renders. When no project is active, it now shows an accessible no-selection state without worktree or terminal actions, while preserving the existing home/project navigation, close actions, active state, badges, titles, and collapse behavior.

## Validation

- `./harness test -- src/hooks/use-terminal.test.ts src/components/terminal-panel.test.tsx src/components/workspace-layout.test.tsx src/components/project-sidebar.test.tsx src/server/terminal-server.test.ts`
- `./harness e2e -- e2e/terminal.spec.ts --project=chromium`
- `./harness verify`

### Results

- Targeted unit/component tests: PASS
- Focused Playwright terminal E2E: PASS
- Full harness verification: PASS
- No lingering `next dev`, `terminal-server.mts`, or `npm run terminal` processes were observed after the verification run.
