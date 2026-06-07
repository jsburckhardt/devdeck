# CORE-COMPONENT-0009: Engineering Harness

## Status

Adopted

## Purpose

Provide a single, repo-local CLI (`./harness`) as the preferred operating surface for humans and AI agents. The harness wraps existing project commands, standardizes verdict reporting, records inference friction, and produces verification evidence — eliminating the need for agents and contributors to infer which command surface to use.

## Scope

Cross-cutting: affects all pipeline agents (Research, Plan, Implement, Verify), the justdoit orchestrator, CI workflows, and human developer workflows. The harness does not replace existing tools (npm scripts, justfile, verification.yml) — it wraps them.

## Definition

### Rules

- `./harness` is the preferred entrypoint for orienting, verifying, testing, linting, building, booting, and cleaning the project.
- Direct project commands are allowed when the harness lacks a verb, explains a degraded path, or deeper diagnosis requires raw output.
- When bypassing the harness, the reason SHOULD be recorded as friction via `./harness friction add`.
- Every harness command returns exactly one verdict: `pass` (exit 0), `fail` (exit 1), `degraded` (exit 2), or `unknown` (exit 3).
- `./harness verify` is the primary verification mechanism for the Implement and Verify pipeline stages.
- Evidence files are written to `.harness/evidence/` and MUST NOT contain secrets, tokens, or raw logs.
- Friction records are appended atomically to `.harness/friction.jsonl`.

### Interfaces

- `./harness <verb> [--json]` — CLI entrypoint supporting all required verbs.
- `.harness/contract.yml` — Machine-readable command contract.
- `.harness/friction.jsonl` — JSONL friction log.
- `.harness/evidence/` — Verification evidence directory (gitignored).
- `.harness/README.md` — Human-readable usage guide.

### Expectations

- Pipeline agents MUST use `./harness verify` as the primary verification path when the harness is available.
- Pipeline agents SHOULD use `./harness orient` to understand the project before starting unfamiliar work.
- Pipeline agents SHOULD use `./harness doctor` to check prerequisites.
- The harness MUST wrap existing project commands; it MUST NOT invent a new build system.
- The harness MUST be a dependency-light Bash script using tools already in the devcontainer.

## Rationale

DevDeck has multiple command surfaces (npm scripts, justfile, verification.yml) with no single source of truth. Git history shows 29+ fix commits from agents and reviewers inferring incorrect commands. The harness eliminates this friction by providing a documented, testable, machine-readable command contract.

## Usage Examples

```bash
# Orient in the project
./harness orient

# Check prerequisites
./harness doctor

# Run verification before claiming completion
./harness verify

# Get machine-readable output
./harness verify --json

# Record friction when bypassing the harness
./harness friction add "needed raw vitest output for debugging"

# View recorded friction
./harness friction list
```

## Integration Guidelines

- **Implementer agent:** MUST run `./harness verify` after implementing each task. SHOULD use `./harness lint`, `./harness test`, `./harness build` over direct npm commands.
- **Verifier agent:** MUST use `./harness verify` as the primary verification mechanism. Falls back to `verification.yml` only when the harness is absent.
- **Research agent:** SHOULD use `./harness orient` and `./harness doctor` to understand the project.
- **Planner agent:** SHOULD reference `./harness` verbs in task acceptance criteria.
- **JustDoIt orchestrator:** MUST instruct subagents to use `./harness` verbs.
- **Human developers:** SHOULD use `./harness verify` before pushing.
- **CI:** May continue using `verification.yml` directly; the harness is optimized for local development.

## Exceptions

- Repos without a harness: agents fall back to `verification.yml` or auto-detection.
- Debugging: direct commands are allowed when the harness abstracts away needed diagnostic detail; record as friction.
- CI environments: CI pipelines may use `verification.yml` directly for reproducibility.
- Bootstrap: new projects may not have a harness until the harness-cli-it skill runs.

## Enforcement

- [x] `./harness verify` runs the full verification sequence and writes evidence
- [x] Agent instructions require harness usage (MUST for verifier/implementer, SHOULD for others)
- [x] Friction log tracks every harness bypass
- [ ] Future: CI step to verify `./harness verify --json` produces a `pass` verdict

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md) — Defines the project tools the harness wraps
