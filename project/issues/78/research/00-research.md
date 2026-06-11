# Research Brief — Issue #78

## Issue

- **Number:** #78
- **Title:** feat(sidebar): replace project letter badge with robot icon when Copilot CLI is active
- **Repository:** jsburckhardt/devdeck

## Scope Classification

- **scope_type:** `issue`
- **Rationale:** This is a targeted UI change in `src/components/project-sidebar.tsx`.
  It reuses the existing `CopilotCliState` pipeline and does not introduce new data
  flow, persistence, or detection behavior.
- **ADR required:** No
- **Core-component update required:** Yes — update existing sidebar/Copilot indicator
  rules in CORE-COMPONENT-0007 and CORE-COMPONENT-0008, plus DECISION-LOG entries.

## Current Behavior

`ProjectSidebar` renders a 24x24 language-color badge containing the first letter of the
project name. When `copilotStatus !== "idle"`, it overlays a small dot via
`CopilotStatusIndicator`.

Relevant source:

- `src/components/project-sidebar.tsx:115-122` — badge wrapper, letter badge, and
  `CopilotStatusIndicator`
- `src/components/project-sidebar.tsx:177-191` — `CopilotStatusIndicator`
- `src/lib/types.ts` — `CopilotCliState = "idle" | "running" | "waiting"`

## Requested Behavior

When `copilotStatus` is `"running"` or `"waiting"`:

- Replace the first-letter badge contents with a visible Copilot-style bot head icon
- Keep the badge dimensions (`h-6 w-6`) unchanged
- Suppress the small overlay dot so the bot badge is the Copilot activity indicator
- Preserve hover project-name discovery using the native `title={project.name}` tooltip
- Preserve accessible status semantics with an `sr-only role="status"` element for active
  states

When `copilotStatus` is `"idle"` or unrecognized:

- Render the existing first-letter badge and no Copilot activity indicator.

## Architecture Findings

- **ADR-0005** already defines the Copilot status detection strategy and state model.
  No detection or server protocol changes are required.
- **CORE-COMPONENT-0007** currently requires expanded and collapsed sidebar tabs to show
  the project badge; it should be amended to allow the active Copilot bot icon
  replacement inside the same badge footprint.
- **CORE-COMPONENT-0008** currently defines the sidebar Copilot status indicator as an
  adjacent/overlay indicator; it should be amended so the status indicator may be the
  Copilot bot badge replacement.
- **Decision #53** requires native `title` attributes for sidebar tooltips and prohibits
  adding tooltip dependencies.
- **Decisions #102, #103, and #132** remain relevant: the Copilot status indicator is
  hidden when idle, must expose non-color semantics, and must remain visible in expanded
  and collapsed sidebar modes.

## Implementation Targets

| File | Required work |
|------|---------------|
| `src/components/project-sidebar.tsx` | Render a Copilot-style bot badge for non-idle Copilot state; keep letter badge for idle/fallback; remove or stop rendering overlay dot for bot states; add `sr-only role="status"` for active states. |
| `src/components/project-sidebar.test.tsx` | Update Copilot indicator tests to assert bot badge behavior, active status semantics, idle fallback, collapsed visibility, tooltip/title, and independent per-project statuses. |
| `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md` | Amend sidebar badge rules for conditional robot replacement. |
| `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` | Amend Copilot sidebar indicator rules for Copilot bot badge replacement. |
| `project/architecture/ADR/DECISION-LOG.md` | Add decisions for conditional Copilot bot badge replacement and accessible status semantics. |

## Constraints

- Do not add tooltip dependencies; use native `title`.
- Do not change the Copilot detection pipeline or WebSocket status protocol.
- Do not change badge dimensions or language-color backgrounds.
- Do not rely on color alone for status communication.
- Preserve the parent project tab accessible name (`Open project ${project.name}`).
- Use `./harness verify` as the primary verification command.

## Testing Focus

- Copilot bot badge appears for `"running"` and `"waiting"`.
- Letter badge appears for `"idle"` and unknown status fallback.
- Running badge has `animate-pulse`.
- Waiting badge has the configured amber ring and no pulse.
- Project name hover tooltip remains available.
- Overlay `CopilotStatusIndicator` dot is not rendered alongside the bot badge.
- `sr-only role="status"` announces active Copilot state.
- Multiple project statuses render independently.
- Collapsed sidebar still shows the bot badge.
