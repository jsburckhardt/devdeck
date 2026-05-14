# Action Plan: Close Active Project Navigates to Adjacent Tab

## Feature

- **GitHub Issue:** #36
- **Research Brief:** `project/issues/36/research/00-research.md`
- **Scope Type:** `issue`

## ADRs Created

None.

## Core-Components Created

None.

## Core-Component Amendment Decision

CORE-COMPONENT-0008 does not need amendment for this issue. The requested behavior is a
targeted implementation refinement within the existing Multi-Project Tabs and Workspace
State component boundary: sidebar close behavior, client-side navigation, localStorage
slug persistence, and workspace cache deletion are already governed by
CORE-COMPONENT-0008. No new reusable interface, persistence contract, API endpoint, or
architectural rule is introduced.

## Relevant Architecture

- ADR-0002: Next.js + xterm.js + node-pty Tech Stack
- CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State

## Approach

1. Add deterministic close-navigation target calculation based on the pre-close
   `openProjects` order.
2. Keep the provider responsible for open-project state, localStorage persistence, and
   workspace cache deletion.
3. Keep route transition decisions in the sidebar close flow, where the active route is
   known from `usePathname()`.
4. Preserve `stopPropagation()`, aria labels, keyboard reachability, slug-only routes,
   and client-side `router.push()`.
5. Extend provider/sidebar tests to cover the new behavior and guard existing contracts.

## Non-Goals

- No new API endpoints.
- No new persistence model.
- No change to the `devdeck-open-projects` localStorage format.
- No new ADR or core-component.
- No unrelated layout, terminal, registry, or build configuration changes.

## Verification

Run these repository checks after implementation:

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`
