# Implementation Notes: Issue #84

## Summary

Implemented the issue #84 cleanup that aligns DevDeck's active agent instructions, verification source of truth, CI workflow, and custom-agent tool names with the current Copilot CLI surface.

## Changes Made

### Instruction surfaces

- Deleted `.github/copilot-instructions.md`.
- Moved DevDeck harness guidance into `AGENTS.md` as `DEVDECK_HARNESS_GUIDANCE`.
- Kept `AGENTS.md` APS-compliant by ensuring the first top-level section is `<instructions>`.
- Updated `.github/agents/aps-v1.2.2.agent.md` so generated DevDeck agents use `AGENTS.md` and do not recreate `.github/copilot-instructions.md` by default.

### Harness verification source of truth

- Deleted `.github/soft-factory/verification.yml`.
- Updated `.harness/contract.yml` so the `verify` verb names `.harness/contract.yml` as its source.
- Updated `harness orient` text and JSON output to report `harness_contract` and its five verify steps.
- Updated `.github/workflows/ci.yml` to run `./harness verify` after `npm ci`.
- Updated `LLM.txt`, CORE-COMPONENT-0006, CORE-COMPONENT-0009, and `DECISION-LOG.md` to reflect the harness source-of-truth model.

### Agent tool normalization

- Updated `.github/agents/*.agent.md` frontmatter and active process tool calls:
  - `grep` -> `rg`
  - `create` / `edit` -> `apply_patch`
  - `github-mcp-server/search_code` -> `github-mcp-server-search_code`
  - `github-mcp-server/get_file_contents` -> `github-mcp-server-get_file_contents`
- Added `CURRENT_COPILOT_CLI_TOOLS` and `TOOL_NAME_EQUIVALENTS` to the APS generator agent.
- Updated `AGENTS.md` tool descriptions to use `rg`, `glob`, `view`, and `apply_patch`.

## Verification

- Static validation confirmed `AGENTS.md` and `.github/agents/aps-v1.2.2.agent.md` have the expected APS section order.
- Static validation confirmed all `.github/agents/*.agent.md` frontmatter tools are current callable names.
- `./harness orient --json` reports `surfaces.harness_contract.verify_steps` with `lint`, `format_check`, `build`, `test`, and `smoke`.
- `./harness orient` reports the harness contract in the human-readable project surface map.
- `./harness verify` completed with a PASS verdict across lint, format check, build, test, and smoke.

## Excluded Local Changes

The unrelated local `.github/rpiv.excalidraw` modification and untracked `image.png` file are excluded from this issue and must not be staged in the PR.
