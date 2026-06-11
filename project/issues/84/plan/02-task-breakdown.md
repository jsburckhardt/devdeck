# Task Breakdown: Align Copilot CLI instructions with harness source of truth

## Task 84-1: Consolidate project instruction surfaces

**Description:** Remove the deprecated Copilot instructions file and preserve its harness guidance in APS-compliant project and generator surfaces.

**Files:**

- `.github/copilot-instructions.md`
- `AGENTS.md`
- `.github/agents/aps-v1.2.2.agent.md`

**Acceptance Criteria:**

- `.github/copilot-instructions.md` is deleted.
- `AGENTS.md` starts with `<instructions>` as the first non-empty line.
- `AGENTS.md` stores harness prose in `DEVDECK_HARNESS_GUIDANCE` under `<constants>`.
- The APS generator agent states that DevDeck uses `AGENTS.md` and must not recreate `.github/copilot-instructions.md` unless explicitly requested.

**Test Coverage:**

- Static APS section-order check for `AGENTS.md`.
- Static search for active `.github/copilot-instructions.md` references.

## Task 84-2: Centralize verification on the harness

**Description:** Remove the duplicate Soft Factory verification config and make the harness contract the source of truth for CI and agents.

**Files:**

- `.github/soft-factory/verification.yml`
- `.harness/contract.yml`
- `harness`
- `.github/workflows/ci.yml`
- `LLM.txt`
- `project/architecture/core-components/CORE-COMPONENT-0006-development-standards.md`
- `project/architecture/core-components/CORE-COMPONENT-0009-engineering-harness.md`
- `project/architecture/ADR/DECISION-LOG.md`

**Acceptance Criteria:**

- `.github/soft-factory/verification.yml` is deleted.
- `.harness/contract.yml` identifies `.harness/contract.yml` as the verify source.
- `./harness orient --json` reports `surfaces.harness_contract.verify_steps`.
- CI runs `./harness verify` after `npm ci`.
- Decision-log entries #165 and #166 record the harness source-of-truth decisions.

**Test Coverage:**

- `./harness orient --json`
- `./harness verify`
- Static search for active `.github/soft-factory/verification.yml` references.

## Task 84-3: Normalize agent tool names

**Description:** Update all custom agents and the APS generator to use this Copilot CLI's current callable tool names.

**Files:**

- `.github/agents/*.agent.md`
- `AGENTS.md`

**Acceptance Criteria:**

- Frontmatter uses `rg`, not `grep`.
- Frontmatter and active DSL use `apply_patch`, not `create` or `edit`.
- GitHub MCP tools use `github-mcp-server-search_code` and `github-mcp-server-get_file_contents`.
- Legacy names only remain inside explicit mapping/prohibition text.
- Agent frontmatter contains no blank tool entries or duplicate tool names.

**Test Coverage:**

- Static parser for every `.github/agents/*.agent.md` frontmatter `tools:` array.
- Static search for active legacy `USE` statements.
- APS section-order check for `.github/agents/aps-v1.2.2.agent.md`.

## Task 84-4: Document implementation and ship

**Description:** Create issue docs, verify the final change set, commit only issue-scoped files, push the branch, and open the PR.

**Files:**

- `project/issues/84/research/00-research.md`
- `project/issues/84/plan/01-action-plan.md`
- `project/issues/84/plan/02-task-breakdown.md`
- `project/issues/84/plan/03-test-plan.md`
- `project/issues/84/implementation/README.md`

**Acceptance Criteria:**

- RPIV issue docs exist under `project/issues/84/`.
- Final staged file list excludes `.github/rpiv.excalidraw` and `image.png`.
- PR body references `Closes #84`.

**Test Coverage:**

- `git diff --cached --name-only`
- `git status --short`
- PR creation output.
