# Implementation Notes: Issue #70 - prevent fullscreen clipping of bottom controls

## Summary

- Constrained the root document height chain by making `html` and `body` full-height and overflow-hidden.
- Updated the project layout to inherit `h-full` instead of using standalone `h-screen`, while preserving `min-h-0` flex containment and internal overflow boundaries.
- Refactored `ProjectSidebar` into a non-shrinking header, scrollable project/worktree middle region, and non-shrinking footer for the `SidebarSimple` collapse toggle.
- Preserved sidebar widths (`w-44`/`w-12`), `devdeck-sidebar-collapsed` persistence, toggle `aria-label`/`aria-expanded`/`title`, close-button behavior, Copilot status indicators, and mounted/CSS-hidden `WorktreeTree` behavior.
- Added component regression tests for the fixed footer, scrollable middle region, toggle accessibility/placement, and many-open-project behavior.
- Added Playwright viewport geometry coverage in the existing workspace layout spec to assert no outer document overflow and that the sidebar footer toggle remains within a 1280x720 viewport.

## Files Changed

- `src/app/layout.tsx`
- `src/app/project/layout.tsx`
- `src/components/project-sidebar.tsx`
- `src/components/project-sidebar.test.tsx`
- `e2e/workspace-layout.spec.ts`

## Validation

- `npm ci` — completed; dependencies were missing from the worktree before full verification.
- `npm run test -- src/components/project-sidebar.test.tsx` — passed (34 tests).
- `npm run lint` — passed with an existing warning in `src/server/terminal-server.test.ts` for unused `_p`.
- `npm run format:check` — passed.
- `npm run build` — passed with existing Next/Turbopack warnings.
- `npm run test` — passed.
- `npx playwright test e2e/workspace-layout.spec.ts` — passed (3 tests, including Issue #70 viewport regression).

## Deviations or Gaps

- No ADR or core-component changes were required.
- No persistent workspace panels were unmounted as part of the clipping fix.
- No changes were made to `workspace-layout.tsx`, `terminal-panel.tsx`, or `globals.css`.
