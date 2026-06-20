# Research Brief: Reduce Terminal Font Size Responsively

## GitHub Issue
- **Issue:** #94
- **Title:** Reduce Terminal Font Size Responsively

## Scope Classification
- **Scope Type:** issue

## Problem Statement

DevDeck's embedded xterm.js terminal currently uses one fixed `fontSize: 13` for every
viewport. On iPad-sized and touch layouts this reduces usable terminal density, causes
earlier wrapping, and makes the browser terminal feel less productive. The requested fix is
an issue-scoped terminal UI/responsiveness change: reduce the terminal font size on
iPad/touch layouts while preserving the current large desktop experience.

The issue defines an explicit policy for the implementation to plan against:

| Context | Detection | Font size |
| --- | --- | --- |
| Phone/narrow viewport | `layoutViewportWidth <= 600` | 11px |
| iPad/tablet touch viewport | primary coarse pointer and `layoutViewportWidth <= 1366` | 12px |
| iPad/tablet fallback | any-coarse pointer or `navigator.maxTouchPoints > 0`, and `layoutViewportWidth <= 1024` | 12px |
| Non-touch smaller desktop/laptop | `layoutViewportWidth <= 1200` and no smaller rule applies | 13px |
| Large non-touch desktop | no smaller rule applies | 13px |

The change must use layout viewport width, not `visualViewport.width`, for tier selection so
browser zoom does not make terminal text smaller. It must refit xterm.js after font-size
changes, preserve accurate PTY dimensions, and avoid WebSocket reconnects solely for font
changes.

## Existing Context

### Research Inputs Read

- Fetched GitHub issue #94 with `gh issue view 94 --json title,body,labels,assignees,milestone`.
  Labels are `bug` and `enhancement`; there is no milestone or assignee.
- Ran `./harness orient` and `./harness doctor`; both reported `PASS`.
- Read repository documentation under `docs/` and `project/`; 225 Markdown files were opened
  for heading/index review, including all existing ADRs, core-components, the decision log,
  and issue artifacts.
- Inspected terminal construction, terminal panel markup, shell layout, viewport metadata,
  terminal unit/component tests, and Playwright terminal coverage.

### Architecture and Documentation Constraints

- `docs/README.md` and `ADR-0002` establish the stack: Next.js App Router, React,
  Tailwind CSS, xterm.js, node-pty, WebSocket, Vitest, and Playwright.
- `project/README.md` and `project/issues/README.md` require per-issue artifacts under
  `project/issues/<issue-number>/`; this brief is under `project/issues/94/`.
- `CORE-COMPONENT-0003: WebSocket Terminal Communication` owns `useTerminal` as the browser
  xterm.js/WebSocket boundary. Relevant constraints:
  - terminal resize events must propagate to node-pty;
  - initial `cols`/`rows` must be sent on the WebSocket URL;
  - `screenReaderMode: true`, ClipboardAddon, binary input, setup/status frames, worktree
    query handling, and 4401 unauthorized handling must remain intact.
- `CORE-COMPONENT-0004: Theming` requires terminal color theme changes to use
  `terminal.options.theme` at runtime without reconnecting; responsive font-size changes
  should follow the same no-reconnect principle where possible.
- `CORE-COMPONENT-0007: Shell Layout` requires resource-owning panels to remain mounted,
  bounded by `min-h-0`, `min-w-0`, and overflow constraints. The terminal panel must not be
  conditionally remounted to change font size.
- `CORE-COMPONENT-0009: Engineering Harness` makes `./harness` the preferred command surface.
  Research did not run full verification; Plan/Implement should use harness verbs.
- Historical issue docs add important guardrails:
  - Issue #54 fixed tmux glyph rendering by requiring `lineHeight: 1.0` and
    `customGlyphs: true`; do not tune density by changing line height.
  - Issue #67 fixed terminal overflow and resize stability; preserve zero-size skip/refit,
    duplicate resize suppression, and initial `cols`/`rows` behavior.
  - Issue #68 added touch/mobile terminal helper UI; keep keyboard helper and voice input
    reachable and do not obscure the prompt more than before.

### Source Findings

- `src/hooks/use-terminal.ts:252-261` constructs `new Terminal(...)` with fixed
  `fontSize: 13`, `fontFamily`, `lineHeight: 1.0`, `customGlyphs: true`,
  `allowProposedApi: true`, and `screenReaderMode: true`.
- `src/hooks/use-terminal.ts:166-205` centralizes fitting through
  `fitContainerToUsableSize()` and debounced `scheduleFit()`, skipping zero-sized
  containers and suppressing same-size fits.
- `src/hooks/use-terminal.ts:208-220` suppresses duplicate resize messages by caching the
  last sent terminal `cols`/`rows`.
- `src/hooks/use-terminal.ts:298-317` registers `term.onResize` before the initial forced
  fit and wires `ResizeObserver` for container changes.
- `src/hooks/use-terminal.ts:333-352` appends current `term.cols` and `term.rows` to the
  WebSocket URL before connecting and sends an initial resize on open.
- `src/hooks/use-terminal.ts:497-501` already updates terminal theme at runtime without
  reconnecting; there is no equivalent runtime font-size update path yet.
- Repository source search found no existing responsive terminal font-size helper, no
  `matchMedia`/coarse-pointer logic, and no `visualViewport` tiering logic.
- `src/components/terminal-panel.tsx:533-540` renders the bounded xterm host at
  `data-testid="terminal-container"`. Helper and voice panels are docked below/inside the
  same panel and should remain reachable.
- `src/components/workspace-layout.tsx:465-475` keeps `TerminalPanel` inside a collapsible
  mounted `react-resizable-panels` panel with `minSize={15}` and overflow containment.
- `src/app/layout.tsx:17-20` exports `metadata` but no explicit Next.js `viewport` export.
  Plan should verify the rendered DOM before adding anything; avoid duplicate viewport tags
  and never disable browser zoom.
- `src/app/globals.css` defines app/theme and markdown CSS but no terminal font-size custom
  property. xterm CSS is dynamically imported in `use-terminal.ts`, which should remain.
- `next.config.ts:13-16` preserves `serverExternalPackages: ["node-pty"]`; this issue should
  not require build configuration changes.

### Existing Test Coverage

- `src/hooks/use-terminal.test.ts` mocks xterm `Terminal`, `FitAddon`, `ResizeObserver`,
  and `WebSocket`. It already captures constructor options, verifies
  `lineHeight: 1.0`, `customGlyphs: true`, `screenReaderMode: true`, initial `cols`/`rows`
  URL params, duplicate resize suppression, zero-dimension skip/refit behavior, runtime
  theme update without reconnect, 4401 handling, setup/status messages, worktree params,
  and stale WebSocket protection.
- `src/components/terminal-panel.test.tsx` verifies the terminal container is bounded and
  unpadded, helper controls are accessible, opening helpers does not remount the terminal
  host, safe-area bottom padding exists for the keyboard helper, and disconnected helper
  controls no-op safely.
- `e2e/terminal.spec.ts` verifies terminal connection, no horizontal overflow on initial
  load and after layout changes, command execution, mobile keyboard helper behavior at
  390x844, voice input review, and auth rejection. It does not yet assert tablet/touch
  computed xterm font size.

### Handoff Recommendations for Plan

1. Keep the implementation in or near `src/hooks/use-terminal.ts`, preferably with a small
   testable helper such as `getTerminalFontSize(input?)` that is SSR/jsdom-safe and accepts
   explicit test inputs.
2. Apply the computed size in the xterm `Terminal` constructor before initial fit/connect so
   initial `cols`/`rows` reflect the responsive font size.
3. Add per-hook-instance listeners for `window.resize`, `orientationchange`, relevant
   media-query changes, and optionally `visualViewport.resize` for refit only. Clean up
   modern and legacy media-query listener forms.
4. On runtime tier changes, update `term.options.fontSize`, force a fit even if container
   dimensions are unchanged, and rely on existing `term.onResize` and duplicate suppression
   for PTY resize messages.
5. Add unit coverage for the exact policy and hook lifecycle, then add at least one
   browser-level tablet/touch check that verifies computed/rendered xterm font size is 12px,
   connection remains active, and no horizontal overflow appears.
6. If no `TerminalPanel` markup/CSS changes are made, note in Plan/implementation that
   component tests remain unchanged because the change is hook-only plus E2E/browser-level UI
   coverage.

## Proposed ADRs

**ADRs are NOT required for this issue.**

- **ADRs required:** No.
- **Proposed ADR titles:** None.

This work stays within ADR-0002's selected terminal stack and existing terminal/shell layout
contracts. It does not introduce a new transport, backend capability, framework choice, or
architectural trade-off. If Plan discovers a need to change terminal technology, viewport
policy beyond the issue-defined contract, or global layout strategy, it should return to
architecture planning rather than decide that in implementation.

## Proposed Core-Components

**Core-component documentation is required as an amendment to an existing component; no new
core-component file is proposed.**

- **Core-components required:** Yes, update an existing adopted core-component and
  `project/architecture/ADR/DECISION-LOG.md`.
- **Proposed core-component title:** `CORE-COMPONENT-0003: WebSocket Terminal Communication —
  Responsive Terminal Font Size Contract` (amendment).
- **Optional Plan consideration:** If Plan determines the policy is layout-owned rather than
  terminal-owned, it may instead or additionally propose an amendment under
  `CORE-COMPONENT-0007: Shell Layout — Responsive Terminal Density`, but that decision should
  be made in Plan, not Research.

The amendment should record that `useTerminal` computes xterm `fontSize` from layout viewport
width and touch capability, preserves desktop 13px behavior, refits without WebSocket
reconnects when tiers change, and keeps the existing terminal resize/initial-dimension
contract intact.

## Risks and Open Questions

### Risks

- Updating `term.options.fontSize` without a forced fit could leave stale xterm cell
  measurements and stale PTY dimensions; the existing same-container-size suppression must
  have an explicit force path for font changes.
- Resize/orientation/media-query events can be noisy. New listeners must reuse the existing
  debounce and duplicate resize-message suppression to avoid `fitAddon.fit()` floods.
- Multiple hook instances, Strict Mode remounts, project/worktree switches, reconnect races,
  and late async imports could leak listeners or update a stale terminal if listener state is
  not instance-local and generation-guarded.
- Browser zoom/pinch can shrink `visualViewport.width`; using that for tiering would make text
  smaller when users zoom in. Use layout viewport width for tiers and preserve zoom.
- iPad desktop-mode detection via coarse-pointer media queries can be hard to reproduce in
  jsdom/Playwright. Tests will need explicit mocks or a touch-capable browser context.
- Phone 11px sizing may be dense; verify readability, helper reachability, and no zoom-disable
  viewport directives.
- Adding viewport metadata without DOM verification could create duplicate or conflicting
  `meta[name="viewport"]` tags in Next.js App Router.

### Open Questions

1. Should the core-component amendment live solely in CORE-COMPONENT-0003, or should
   CORE-COMPONENT-0007 also record a shell-layout density constraint?
2. What exact browser-level mechanism should expose the rendered/computed font size in E2E:
   `.xterm` computed style, `.xterm-rows`, or a host data attribute/CSS custom property that
   mirrors the xterm option?
3. Should `getTerminalFontSize` be exported from `use-terminal.ts` for tests or placed in a
   small adjacent helper file? If a new file is added, update `LLM.txt`.
4. How should Playwright simulate primary `(pointer: coarse)` up to 1366px versus fallback
   `(any-pointer: coarse)`/`maxTouchPoints` up to 1024px reliably?
5. Is a `visualViewport.resize` listener needed only to schedule refits during zoom/keyboard
   changes, or can existing container `ResizeObserver` coverage handle all practical cases?
