# Research Brief: Align Copilot CLI instructions with harness source of truth

## GitHub Issue

- **Issue:** #84
- **Title:** chore(agents): align Copilot CLI instructions with harness source of truth

## Scope Classification

- **Scope Type:** core_component

## Problem Statement

DevDeck had overlapping instruction and verification sources. `.github/copilot-instructions.md` duplicated harness guidance that should live in the APS-compliant project instruction surface, while `.github/soft-factory/verification.yml` duplicated verification steps that are already represented by `./harness verify` and `.harness/contract.yml`.

The custom agents also referenced tool names that do not match the current Copilot CLI callable tool surface. Active frontmatter and APS process references used legacy names such as `grep`, `create`, `edit`, and slash-separated GitHub MCP names, which can cause generated or dispatched agents to call unavailable tools.

## Existing Context

- `AGENTS.md` is the repository-level Soft Factory pipeline instruction artifact.
- `.github/agents/aps-v1.2.2.agent.md` generates APS agent artifacts and therefore must encode the current DevDeck tool naming rules.
- `.harness/contract.yml` documents the harness command contract, and `./harness verify` runs lint, format check, build, test, and smoke.
- `.github/workflows/ci.yml` previously duplicated verification commands instead of invoking the harness contract.
- `project/architecture/core-components/CORE-COMPONENT-0009-engineering-harness.md` owns the harness as the cross-cutting verification component.
- `project/architecture/core-components/CORE-COMPONENT-0006-development-standards.md` owns development verification expectations.
- `project/architecture/ADR/DECISION-LOG.md` records changes to core-component behavior.
- `LLM.txt` maps active repository surfaces for AI agents.

## Proposed ADRs

No new ADR is required. This work changes repository instruction, agent, CI, and harness conventions within the existing Soft Factory and Engineering Harness architecture.

## Proposed Core-Components

Update existing core-components rather than creating a new one:

- `CORE-COMPONENT-0009: Engineering Harness` should state that `.harness/contract.yml` and `./harness verify` are the verification source of truth and that `.github/soft-factory/verification.yml` is not maintained.
- `CORE-COMPONENT-0006: Development Standards` should tell contributors to run `./harness verify` and state that CI invokes the harness.

## Risks and Open Questions

- CI now runs `./harness verify`, which includes the smoke step. Any smoke degradation or port conflict will block PR checks unless a later policy decision changes CI handling.
- Agent process syntax for `apply_patch` is descriptive APS DSL. It must remain aligned with the actual Copilot CLI callable tool and future APS adapter behavior.
- Static checks must distinguish active tool calls from intentional legacy-name examples in `TOOL_NAME_EQUIVALENTS`.
- The final PR must not include unrelated local changes to `.github/rpiv.excalidraw` or `image.png`.
