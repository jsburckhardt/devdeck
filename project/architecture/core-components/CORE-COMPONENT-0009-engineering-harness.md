# CORE-COMPONENT-0009: Engineering Harness

## Status

Adopted (updated)

## Purpose

Provide a single, repo-local CLI (`./harness`) as the preferred operating surface for humans and AI agents. The harness wraps existing project commands, standardizes verdict reporting, records inference friction, and produces verification evidence — eliminating the need for agents and contributors to infer which command surface to use. Smoke verification and targeted Vitest execution are first-class harness contracts so agents can validate built runtime health and focused regressions without bypassing the harness.

## Scope

Cross-cutting: affects all pipeline agents (Research, Plan, Implement, Verify), the justdoit orchestrator, CI workflows, and human developer workflows. The harness is the repository verification source of truth and wraps existing project tools such as npm scripts and the justfile. This scope includes harness command parsing, smoke-test lifecycle management, test target passthrough, discovery metadata, local evidence, local runtime metadata, and documentation for supported harness workflows.

## Definition

### Rules

- `./harness` is the preferred entrypoint for orienting, verifying, smoking, testing, linting, building, booting, and cleaning the project.
- Direct project commands are allowed when the harness lacks a verb, explains a degraded path, or deeper diagnosis requires raw output.
- RPIV agents and the JustDoIt orchestrator MUST run `./harness help` at the beginning of their stage when the harness is available, before choosing project commands.
- RPIV agents and the JustDoIt orchestrator MUST answer "What did the agent have to infer that the harness should have proved?" before completing or returning an error.
- Non-empty answers identifying missing harness proof, unclear command mapping, unavailable diagnostics, degraded harness behavior, or raw-command bypasses for supported verbs MUST be recorded as friction via `./harness friction add`.
- Every harness command returns exactly one verdict: `pass` (exit 0), `fail` (exit 1), `degraded` (exit 2), or `unknown` (exit 3).
- `./harness verify` is the primary verification mechanism for the Implement and Verify pipeline stages.
- `./harness smoke [--port auto|PORT] [--json]` MUST be a first-class verb that starts the built Next.js app with `npm run start`/`next start`, probes only the root HTTP surface, and exits with the standard harness verdict codes.
- Smoke defaults to `--port auto`; auto allocation MUST use candidate ports in the documented `41000-41999` range with at most 50 bounded attempts, while fixed-port mode MUST validate a usable TCP port before starting the server.
- Smoke MUST bind the started app to `127.0.0.1`, poll `http://127.0.0.1:<port>/` once per second for at most 60 attempts, avoid following redirects, and treat only `200`, `301`, `302`, `303`, `307`, and `308` as successful readiness responses.
- Smoke MUST map missing build artifacts, start failures, readiness timeout, and HTTP `4xx`/`5xx` responses to `fail`; fixed-port conflicts and exhausted bounded auto-port races to `degraded`; and missing required command/probe capability to `unknown`.
- Smoke lifecycle cleanup MUST terminate only processes started by the current harness invocation, use deterministic traps for `EXIT`, `INT`, and `TERM`, and MUST NOT kill by port or terminate unrelated listeners.
- If smoke uses runtime metadata, it MUST keep checkout/worktree-scoped ownership records under `.harness/run/`, clean up stale or owned records safely, and keep `.harness/run/` out of version control.
- `./harness verify` MUST reuse the shared smoke implementation after the build/test steps while preserving build-before-smoke sequencing, continue-on-failure execution, evidence writing, and aggregate verdict rules.
- `./harness test [--json] -- <vitest args...>` MUST forward every argument after `--` verbatim to Vitest through safe argument arrays; harness-owned `--json` is recognized only before the passthrough delimiter.
- `./harness test --json` metadata MUST identify full-suite runs as `targeted: false` with `targets: []`, `targetCount: 0`, and `truncated: false`; targeted runs MUST report `targeted: true`, sanitized string `targets`, `targetCount`, and whether any target label was truncated via top-level `truncated`.
- `./harness test --json` command summaries MUST report the backing full-suite command as `npm run test` and targeted runs as `npm run test -- <N target(s)>`, never raw forwarded arguments.
- Evidence files are written to `.harness/evidence/` and MUST NOT contain secrets, tokens, or raw logs.
- Harness JSON output and evidence metadata MUST sanitize smoke and test fields by excluding raw stdout/stderr, response bodies, redirect locations, environment variables, tokens, credential-bearing URLs, query strings, and absolute paths outside the repository.
- Friction records are appended atomically to `.harness/friction.jsonl`.

### Interfaces

- `./harness <verb> [--json]` — CLI entrypoint supporting all required verbs.
- `./harness smoke [--port auto|PORT] [--json]` — Standalone built-app smoke verification with loopback-only probing and deterministic cleanup.
- `./harness test [--json] [-- <vitest args...>]` — Vitest wrapper with optional targeted passthrough after `--`.
- `./harness verify [--json]` — Full verification sequence that runs lint, format check, build, test, and the shared smoke implementation.
- `.harness/contract.yml` — Machine-readable command contract.
- `.harness/friction.jsonl` — JSONL friction log.
- `.harness/evidence/` — Verification evidence directory (gitignored).
- `.harness/run/` — Local runtime ownership metadata directory when smoke lifecycle tracking needs durable per-invocation records (gitignored).
- `.harness/README.md` — Human-readable usage guide.

### Expectations

- Pipeline agents MUST use `./harness verify` as the primary verification path when the harness is available.
- Pipeline agents MUST run `./harness help` before selecting project commands when the harness is available.
- Pipeline agents SHOULD use `./harness orient` to understand the project before starting unfamiliar work.
- Pipeline agents SHOULD use `./harness doctor` to check prerequisites.
- Pipeline agents SHOULD use `./harness test -- <targets...>` for focused Vitest regressions instead of direct `npm run test -- <targets...>` when the harness is available.
- Pipeline agents SHOULD use `./harness smoke` for standalone built-app smoke checks instead of copying `next start` lifecycle scripts.
- The harness MUST wrap existing project commands; it MUST NOT invent a new build system.
- The harness MUST be a dependency-light Bash script using tools already in the devcontainer.

## Rationale

DevDeck previously had multiple command surfaces (npm scripts, justfile, and a separate verification.yml) with no single source of truth. Git history shows 29+ fix commits from agents and reviewers inferring incorrect commands. The harness eliminates this friction by providing a documented, testable, machine-readable command contract.

## Usage Examples

```bash
# Orient in the project
./harness orient

# Check prerequisites
./harness doctor

# Run verification before claiming completion
./harness verify

# Smoke the already-built app on an auto-selected loopback port
./harness smoke

# Smoke on a fixed loopback port and return machine-readable metadata
./harness smoke --port 41042 --json

# Run a focused Vitest regression through the harness
./harness test -- src/server/start-dev.test.ts

# Forward Vitest's own --json flag after the passthrough delimiter
./harness test -- --json src/server/start-dev.test.ts

# Request harness JSON while still targeting a single Vitest file
./harness test --json -- src/server/start-dev.test.ts

# Get machine-readable output
./harness verify --json

# Record friction when bypassing the harness
./harness friction add "needed raw vitest output for debugging"

# View recorded friction
./harness friction list
```

## Integration Guidelines

- **All RPIV agents:** MUST run `./harness help` at stage start when the harness is available, then answer the harness friction question before completing or returning an error.
- **`rpiv-implementer` agent:** MUST run `./harness verify` after implementing each task. SHOULD use `./harness lint`, `./harness test -- <targets...>`, `./harness smoke`, and `./harness build` over direct npm commands.
- **`rpiv-verifier` agent:** MUST use `./harness verify` as the primary verification mechanism. SHOULD use `./harness smoke` to isolate built-app smoke failures. Falls back to auto-detection only when the harness is absent.
- **`rpiv-research` agent:** SHOULD use `./harness orient` and `./harness doctor` to understand the project.
- **`rpiv-planner` agent:** SHOULD reference `./harness` verbs in task acceptance criteria.
- **RPIV stage selectors:** MUST use `rpiv-research`, `rpiv-planner`, `rpiv-implementer`, and `rpiv-verifier` for subagent dispatch.
- **JustDoIt orchestrator:** MUST run `./harness help`, instruct subagents to use `./harness` verbs, inject the harness friction ritual into every stage prompt, and answer the harness friction question before completing.
- **Human developers:** SHOULD use `./harness verify` before pushing.
- **CI:** SHOULD use `./harness verify` so pull-request checks exercise the same verification contract as local agents.
- **Harness maintainers:** MUST update `./harness help`, `./harness orient --json`, `.harness/contract.yml`, `.harness/README.md`, `LLM.txt`, and agent-facing guidance when harness verbs or passthrough contracts change.

## Exceptions

- Repos without a harness: agents fall back to auto-detecting applicable verification commands from project files.
- Debugging: direct commands are allowed when the harness abstracts away needed diagnostic detail; record as friction.
- CI environments: CI pipelines should run `./harness verify`; direct commands require updating `.harness/contract.yml` to avoid drift.
- Bootstrap: new projects may not have a harness until the harness-cli-it skill runs.
- Smoke does not build the application; callers MUST run `./harness build` first or use `./harness verify` for build-before-smoke sequencing.
- Token-protected HTTP environments may cause unauthenticated smoke to fail; smoke MUST NOT add tokens, cookies, or query strings to make the probe pass.
- Port conflicts are reported through verdicts and metadata; the harness MUST NOT kill unrelated processes to free a port.

## Enforcement

- [x] `./harness verify` runs the full verification sequence and writes evidence
- [x] Agent instructions require `./harness help` preflight and harness usage (MUST for `rpiv-verifier`/`rpiv-implementer`, SHOULD for others)
- [x] Agent instructions require end-of-stage friction reflection and non-empty friction recording
- [x] Friction log tracks every harness bypass
- [x] `./harness smoke` has automated parser, port, lifecycle, cleanup, JSON, and evidence tests
- [x] `./harness test -- <targets...>` has automated passthrough, quoting, sanitization, and Vitest `--json` forwarding tests
- [x] `./harness verify` evidence proves it uses the shared smoke implementation and preserves aggregate verdict behavior
- [ ] Future: CI step to verify `./harness verify --json` produces a `pass` verdict

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md) — Defines the project tools the harness wraps
- [ADR-0004-token-authentication](../ADR/ADR-0004-token-authentication.md) — Defines token behavior that smoke must not leak or bypass
- [ADR-0006-config-file-driven-configuration-system](../ADR/ADR-0006-config-file-driven-configuration-system.md) — Defines env/config production runtime behavior used by `next start`
