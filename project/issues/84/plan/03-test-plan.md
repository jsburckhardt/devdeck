# Test Plan: Align Copilot CLI instructions with harness source of truth

## Static Checks

1. Validate APS top-level section order for `AGENTS.md`.
   - Expected: `instructions`, `constants`, `formats`, `runtime`, `triggers`, `processes`, `input`.

2. Validate APS top-level section order for `.github/agents/aps-v1.2.2.agent.md` after stripping YAML frontmatter.
   - Expected: `instructions`, `constants`, `formats`, `runtime`, `triggers`, `processes`, `input`.

3. Validate custom-agent frontmatter.
   - Parse every `.github/agents/*.agent.md`.
   - Confirm every declared tool is one of the current callable tool names.
   - Confirm no duplicate or blank tool entries exist.

4. Search for stale active tool references.
   - No frontmatter entry or active `USE` statement should call `grep`, `create`, `edit`, `github-mcp-server/search_code`, or `github-mcp-server/get_file_contents`.
   - Legacy names may remain only in explicit mapping/prohibition text or shell command strings.

5. Search for removed verification/instruction file references.
   - No active guidance should instruct agents or CI to use `.github/copilot-instructions.md`.
   - No active guidance should instruct agents or CI to use `.github/soft-factory/verification.yml`.

6. Validate executable harness metadata.
   - `test -x harness`
   - `git ls-files -s harness` reports mode `100755`.

## Harness Checks

1. Run `./harness orient --json`.
   - Expected: verdict is `pass`.
   - Expected: JSON includes `surfaces.harness_contract.detected=true`.
   - Expected: JSON includes verify steps `lint`, `format_check`, `build`, `test`, `smoke`.

2. Run `./harness verify`.
   - Expected: exit code `0`.
   - Expected: verdict `PASS`.

## Git/PR Checks

1. Inspect staged files before commit.
   - Expected: issue-scoped changes only.
   - Expected: `.github/rpiv.excalidraw` is not staged.
   - Expected: `image.png` is not staged.

2. Inspect branch before push.
   - Expected: branch is `chore/84-agent-harness-source-of-truth`.
   - Expected: branch is not `main` or `master`.

3. Inspect PR body.
   - Expected: includes `Closes #84`.
   - Expected: summarizes instruction consolidation, harness verification source of truth, and agent tool normalization.

## Out of Scope

- UI accessibility testing is not required unless UI files are touched.
- API route testing is not required because no API endpoints change.
- E2E browser testing beyond the harness smoke step is not required.
