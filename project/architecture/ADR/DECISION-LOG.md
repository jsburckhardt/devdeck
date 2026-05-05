# Decision Log

This file is the single registry of all architectural decisions and core-components in the project. Every new or modified ADR or core-component **must** be recorded here.

## ADRs

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-0002 | Next.js + xterm.js + node-pty Tech Stack | Accepted | 2026-05-06 |

## Core-Components

| ID | Title | Status | Date |
|----|-------|--------|------|
| CORE-COMPONENT-0002 | Commit Standards | Adopted | 2026-05-05 |
| CORE-COMPONENT-0003 | WebSocket Terminal Communication | Adopted | 2026-05-06 |
| CORE-COMPONENT-0004 | Theming | Adopted | 2026-05-06 |
| CORE-COMPONENT-0005 | Error Handling | Adopted | 2026-05-06 |
| CORE-COMPONENT-0006 | Development Standards (Node/TypeScript) | Adopted | 2026-05-06 |
| CORE-COMPONENT-0007 | Shell Layout | Adopted | 2026-05-07 |

## Decisions

Short, actionable statements derived from ADRs and core-components. More than one decision can originate from a single source.

| # | Decision | Source | Date |
|---|----------|--------|------|
| 1 | Enforce Conventional Commits v1.0.0 on every commit message | CORE-COMPONENT-0002 | 2026-05-05 |
| 2 | Require Conventional Commits format on PR titles | CORE-COMPONENT-0002 | 2026-05-05 |
| 3 | Require Co-authored-by trailer on all AI-authored commits | CORE-COMPONENT-0002 | 2026-05-05 |
| 4 | Use Next.js App Router as the fullstack framework | ADR-0002 | 2026-05-06 |
| 5 | Use TypeScript strict mode across the entire codebase | ADR-0002 | 2026-05-06 |
| 6 | Use xterm.js for browser terminal emulation and node-pty for backend PTY | ADR-0002 | 2026-05-06 |
| 7 | Use WebSocket (ws) for terminal I/O communication | ADR-0002 | 2026-05-06 |
| 8 | Use Tailwind CSS v4 + shadcn/ui for styling and components | ADR-0002 | 2026-05-06 |
| 9 | Use vitest as the test runner with @testing-library/react | ADR-0002 | 2026-05-06 |
| 10 | Use justfile as the task runner for development workflows | ADR-0002 | 2026-05-06 |
| 11 | Terminal sessions must be backed by real PTY processes via node-pty | CORE-COMPONENT-0003 | 2026-05-06 |
| 12 | WebSocket endpoint at /api/terminal for terminal communication | CORE-COMPONENT-0003 | 2026-05-06 |
| 13 | PTY processes must be cleaned up when WebSocket connection closes | CORE-COMPONENT-0003 | 2026-05-06 |
| 14 | All colors must use CSS custom properties with oklch color space | CORE-COMPONENT-0004 | 2026-05-06 |
| 15 | Theme preference must persist in localStorage, default to dark | CORE-COMPONENT-0004 | 2026-05-06 |
| 16 | WebSocket disconnections trigger automatic reconnection (max 3 retries, exponential backoff) | CORE-COMPONENT-0005 | 2026-05-06 |
| 17 | React error boundaries wrap each major panel independently | CORE-COMPONENT-0005 | 2026-05-06 |
| 18 | Use ESLint + Prettier for code quality; 80% test coverage target | CORE-COMPONENT-0006 | 2026-05-06 |
| 19 | Co-locate test files next to source using *.test.ts(x) naming | CORE-COMPONENT-0006 | 2026-05-06 |
| 20 | Use react-resizable-panels for the IDE shell panel layout | CORE-COMPONENT-0007 | 2026-05-07 |
| 21 | Wrap each shell panel in its own ErrorBoundary component | CORE-COMPONENT-0007 | 2026-05-07 |
| 22 | Require shell layout to fill 100vh with no outer scroll | CORE-COMPONENT-0007 | 2026-05-07 |
