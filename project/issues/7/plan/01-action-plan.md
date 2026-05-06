# Action Plan: Performance Improvements

## Feature
- **ID:** 7
- **Research Brief:** project/issues/7/research/00-research.md

## ADRs Created
None — all changes are code-level optimizations within the existing architectural decisions (ADR-0002).

## Core-Components Created
None — no new cross-cutting concerns introduced. Existing core-components remain unchanged:
- CORE-COMPONENT-0003 (WebSocket Terminal): unchanged (REC-10 output batching excluded)
- CORE-COMPONENT-0007 (Shell Layout): unchanged (REC-2 terminal remount deferred)

## Scope Decisions

### Included (8 recommendations)
| REC | Description | Priority | Rationale |
|-----|-------------|----------|-----------|
| REC-3 | Add `@next/bundle-analyzer` and measure baseline | P1 | Blocker — enables measurement of all other improvements |
| REC-1 | Lazy-load FileViewer via `next/dynamic` | P1 | ~100KB gzip savings from initial bundle |
| REC-4 | Memoize syntax highlighting in CodeView | P2 | Eliminates redundant CPU work on re-renders |
| REC-5 | Wrap FileTreeItem in `React.memo` | P2 | Reduces O(n) re-renders to O(changed) |
| REC-6 | Debounce `fitAddon.fit()` in ResizeObserver | P2 | Reduces WebSocket message flood during panel drag |
| REC-7 | Parallelize `fs.stat()` calls in file tree API | P2 | 40-70% faster file tree API response |
| REC-8 | Add Cache-Control headers to API routes | P3 | Eliminates redundant filesystem reads |
| REC-11 | Consolidate duplicate icon mapping | P3 | Trivial cleanup alongside file-tree changes (REC-5) |

### Deferred
| REC | Description | Reason |
|-----|-------------|--------|
| REC-2 | Prevent terminal remount on panel toggle | HIGH RISK — `react-resizable-panels` does not support dynamic panel add/remove without remount. The `layoutKey` strategy exists specifically for this. CSS visibility approach may break layout calculations. Needs dedicated spike/issue. |
| REC-9 | Add `/api/projects/[slug]` route | Low impact at current scale; over-fetching is negligible with few projects |
| REC-10 | Terminal output batching | Low impact for interactive use; would require CORE-COMPONENT-0003 update |

## Implementation Tasks

Tasks are ordered by dependency. REC-3 (bundle analyzer) must come first to establish baseline. React/component optimizations are independent and can be done in parallel. API optimizations are independent.

1. **Task 1:** Add `@next/bundle-analyzer` and capture baseline metrics (REC-3)
2. **Task 2:** Lazy-load FileViewer via `next/dynamic` (REC-1)
3. **Task 3:** Memoize CodeView syntax highlighting and line count (REC-4)
4. **Task 4:** Wrap FileTreeItem in `React.memo` + consolidate icon mapping (REC-5, REC-11)
5. **Task 5:** Debounce ResizeObserver `fitAddon.fit()` (REC-6)
6. **Task 6:** Parallelize `fs.stat()` calls in file tree API (REC-7)
7. **Task 7:** Add Cache-Control headers to API routes (REC-8)
8. **Task 8:** Verify bundle size reduction and run full test suite (final validation)
