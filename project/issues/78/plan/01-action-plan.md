# Action Plan: Replace Project Letter Badge with Active Copilot Bot Icon

## Feature
- **ID:** 78
- **Research Brief:** project/issues/78/research/00-research.md

## ADRs Created
- None. ADR-0005 remains the governing Copilot CLI status detection and state-model decision; this issue does not change detection, transport, persistence, or server protocol behavior.

## Core-Components Created
- None.
- Updated `CORE-COMPONENT-0007: Shell Layout` to allow active Copilot-style bot replacement inside the existing project badge while preserving sidebar badge dimensions.
- Updated `CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State` to define Copilot bot badge status semantics, idle/unknown fallback, overlay-dot suppression, native title preservation, and accessible `sr-only role="status"` text.
- Updated `project/architecture/ADR/DECISION-LOG.md` with decision records #158-#161 for the core-component amendments.

## Implementation Tasks
1. **Implement conditional Copilot bot badge rendering in `ProjectSidebar`.**
   - Render a Copilot-style bot head icon for active Copilot states.
   - Treat only `"running"` and `"waiting"` as active Copilot states.
   - Render the bot icon inside the existing `h-6 w-6` badge footprint for active states.
   - Keep first-letter badge rendering for `"idle"` and unrecognized statuses.
   - Remove or stop rendering the overlay `CopilotStatusIndicator` dot when the bot badge is shown.
   - Preserve the project tab `aria-label`, `aria-current`, and native `title={project.name}` behavior.
   - Add an `sr-only` `role="status"` element for active Copilot states.
   - Apply `animate-pulse` for `"running"` and an amber ring without pulse for `"waiting"`.

2. **Update `ProjectSidebar` unit tests for active Copilot bot badge behavior.**
   - Assert `"running"` and `"waiting"` replace the initial with a Copilot-style bot badge.
   - Assert `"idle"` and unknown statuses render initials with no Copilot status element.
   - Assert active bot badges keep the `h-6 w-6` dimensions, native title, and accessible status text.
   - Assert no overlay dot renders alongside the bot badge.
   - Assert multiple projects render independent statuses.
   - Assert collapsed sidebar mode still shows the bot badge.

3. **Run verification and fix regressions.**
   - Use `./harness verify` as the primary verification command.
   - If the harness is degraded or unavailable, record friction and run the equivalent lint, format check, build, and test commands described by the harness contract.
