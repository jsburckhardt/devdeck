# Action Plan: Align Copilot CLI instructions with harness source of truth

## Objective

Make DevDeck's active instruction, verification, CI, and custom-agent tool surfaces consistent with the current Copilot CLI environment and the repository harness.

## Scope

This issue covers documentation, custom agent definitions, harness metadata, and CI workflow wiring. It does not change application runtime behavior, API endpoints, or UI components.

## Plan

1. Consolidate instruction guidance.
   - Delete `.github/copilot-instructions.md`.
   - Keep DevDeck project instructions in `AGENTS.md`.
   - Preserve the harness guidance as `DEVDECK_HARNESS_GUIDANCE` in APS-compliant constants.
   - Update `.github/agents/aps-v1.2.2.agent.md` so generated DevDeck agents do not recreate `.github/copilot-instructions.md`.

2. Make the harness the verification source of truth.
   - Delete `.github/soft-factory/verification.yml`.
   - Update `.harness/contract.yml` and `harness orient` output to reference `harness_contract`.
   - Update CI to run `./harness verify` after dependency installation.
   - Update `LLM.txt`, CORE-COMPONENT-0006, CORE-COMPONENT-0009, and `DECISION-LOG.md`.

3. Normalize custom-agent tools.
   - Update all `.github/agents/*.agent.md` frontmatter tool lists.
   - Replace active APS DSL tool calls from `grep`, `create`, and `edit` to `rg` and `apply_patch`.
   - Replace slash-separated GitHub MCP tool names with callable hyphenated names.
   - Update the APS generator's lint and tool-selection guidance.

4. Verify the change set and ship.
   - Run static checks for stale active references.
   - Run APS section-order checks for `AGENTS.md` and the APS generator agent.
   - Run `./harness orient --json` and `./harness verify`.
   - Commit only issue #84 files, excluding unrelated `.github/rpiv.excalidraw` and `image.png`.
   - Open a PR that closes #84.

## Architecture References

- `CORE-COMPONENT-0006: Development Standards`
- `CORE-COMPONENT-0009: Engineering Harness`
- `project/architecture/ADR/DECISION-LOG.md`

## Non-Goals

- Do not change application source code.
- Do not add API endpoints.
- Do not change UI behavior.
- Do not reintroduce `.github/copilot-instructions.md` or `.github/soft-factory/verification.yml`.
- Do not include unrelated local files in the PR.
