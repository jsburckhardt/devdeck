# Research Brief: Issue #36 - Close Active Project Navigates to Adjacent Tab

## GitHub Issue

- **Issue:** #36
- **Title:** feat(sidebar): navigate to adjacent project when closing active tab
- **URL:** https://github.com/jsburckhardt/devdeck/issues/36

## Scope Classification

- **scope_type:** `issue`
- **Rationale:** This is a targeted behavior fix in the existing multi-project sidebar
  and open-projects state management. The current architecture, persistence model, and
  UI contracts are already governed by ADR-0002 and CORE-COMPONENT-0008.

## ADRs and Core-Components

- **New ADR required:** No.
- **New core-component required:** No.
- **Potential documentation update:** The planner may amend CORE-COMPONENT-0008 to
  capture deterministic active-tab close navigation semantics, then update
  `project/architecture/ADR/DECISION-LOG.md` because every core-component change must be
  recorded there.

## Problem

Closing an active project tab removes it from `openProjects`, but when other projects
remain the router can stay on `/project/{closedSlug}`. The desired behavior is:

1. Use the existing `openProjects` order as tab order.
2. Closing an inactive project removes it without changing the route.
3. Closing the active project navigates to the project now occupying the same index after
   removal when one exists.
4. Closing the active last project navigates to the previous remaining project.
5. Closing the only active project navigates to `/`.

## Architecture and Documentation Findings

| Artifact | Finding |
| --- | --- |
| `AGENTS.md` | Work must flow through Research, Plan, Implement, Verify. Scope types are limited to `issue`, `architecture_decision`, and `core_component`. |
| `docs/README.md` | DevDeck uses Next.js App Router, React, Tailwind, xterm.js, and node-pty. |
| `project/architecture/ADR/ADR-0002-tech-stack.md` | Confirms TypeScript strict mode, Next.js App Router, and vitest/@testing-library as the expected implementation and test stack. |
| `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` | Governs open-project list state, localStorage slug persistence, workspace cache, and sidebar interaction/accessibility. It currently requires navigation to `/` when closing the last open project, but does not define active-tab adjacent navigation when siblings remain. |
| `project/architecture/ADR/DECISION-LOG.md` | Records CORE-COMPONENT-0008 decisions for provider placement, localStorage slug persistence, workspace cache, and stale slug pruning. |

## Relevant Source Areas

- `src/lib/open-projects-context.tsx`
  - Owns `openProjects`, `openProject`, `closeProject`, workspace cache deletion, and
    localStorage persistence.
  - Current `closeProject` behavior is expected to remove the closed slug and delete
    only that slug's workspace cache entry.
- `src/components/project-sidebar.tsx`
  - Renders open project tabs, active state from `usePathname()`, tab navigation with
    `router.push()`, and close buttons.
  - Close handlers must preserve `stopPropagation()` so closing a tab does not also
    trigger tab activation.
- `src/lib/open-projects-context.test.tsx`
  - Existing provider tests should be extended or updated so provider state/cache
    behavior remains independent of routing details as planned.
- `src/components/project-sidebar.test.tsx`
  - Existing sidebar tests should be extended to cover active first, middle, last, only,
    inactive, and keyboard-accessible close behavior.

## Constraints

- Do not change the `devdeck-open-projects` localStorage format; it remains a slug array.
- Do not add APIs, persistence stores, or filesystem-path exposure.
- Continue deleting cached workspace state only for the closed slug.
- Construct project routes with encoded slugs.
- Keep navigation client-side with `router.push()`.
- Keep close buttons reachable and labelled for accessibility.
- Keep the change limited to close-navigation behavior and its tests unless the planner
  chooses a CORE-COMPONENT-0008 documentation amendment.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Double navigation between provider and sidebar | Keep a single navigation decision path. If route changes move to the sidebar/provider caller, remove conflicting provider navigation. |
| Stale target after state update | Compute the target from the pre-close ordered `openProjects` list before removing the project. |
| Inactive close unexpectedly navigates | Return `null` or skip router calls when `closedSlug !== activeSlug`. |
| Special URL-safe slug characters produce invalid paths | Use `encodeURIComponent()` when building `/project/{slug}` targets. |
| Workspace cache regression | Keep cache deletion scoped to the closed slug and avoid clearing adjacent projects. |

## Acceptance Criteria Mapping

| Requirement | Suggested coverage |
| --- | --- |
| Active middle tab closes to right neighbor | Pure helper/provider or sidebar test with `[alpha, beta, gamma]`, active `beta`, close `beta`, expect `/project/gamma`. |
| Active last tab closes to previous tab | Test active `gamma`, close `gamma`, expect `/project/beta`. |
| Active first tab closes to right neighbor | Test active `alpha`, close `alpha`, expect `/project/beta`. |
| Only active tab closes to Home | Test single open project, active close, expect `/`. |
| Inactive tab close does not navigate | Test active `alpha`, close `gamma`, expect no router push. |
| localStorage remains ordered slug array | Existing provider persistence tests plus close update assertion. |
| Workspace cache deletes only closed project | Existing workspace cache tests should continue to pass; add targeted assertion if needed. |

## Plan-Stage Handoff

1. Decide whether to update CORE-COMPONENT-0008 with the new deterministic active close
   navigation rule. If updated, add a matching DECISION-LOG row.
2. Add or expose a small pure helper, likely near `OpenProjectsProvider`, for computing
   close-navigation targets from `(openProjects, closedSlug, activeSlug)`.
3. Wire close actions through one navigation path that uses the helper and performs
   route transitions after computing the target.
4. Preserve existing sidebar `stopPropagation()`, aria labels, keyboard reachability,
   slug-only routing, localStorage persistence, and workspace cache semantics.
5. Add tests for helper behavior, provider or sidebar route behavior, inactive closes,
   Home fallback, ordered persistence, and close button accessibility.

## Verification Expectations

Run the repository verification commands after implementation:

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`
