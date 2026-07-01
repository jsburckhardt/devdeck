# CORE-COMPONENT-0009: Engineering Harness

## Status

Adopted (amended) - 2026-06-30

## Purpose

Provide a single, repo-local CLI (`./harness`) as the preferred operating surface for humans and AI agents. The harness wraps existing project commands, standardizes verdict reporting, records inference friction, and produces verification evidence — eliminating the need for agents and contributors to infer which command surface to use. Dependency installation, smoke verification, targeted Vitest execution, and browser E2E verification are first-class harness contracts so agents can prepare dependencies, validate built runtime health, prove browser-opened user flows, and run focused regressions without bypassing the harness.

## Scope

Cross-cutting: affects all pipeline agents (Research, Plan, Implement, Verify), the justdoit orchestrator, CI workflows, and human developer workflows. The harness is the repository verification source of truth and wraps existing project tools such as npm scripts, Playwright, and the justfile. This scope includes harness command parsing, dependency installation, smoke-test lifecycle management, Vitest and Playwright target passthrough, browser E2E runtime ownership, fixture isolation, discovery metadata, local evidence, local runtime metadata, the CI/local verification split, and documentation for supported harness workflows.

## Definition

### Rules

- `./harness` is the preferred entrypoint for orienting, verifying, smoking, browser E2E testing, testing, linting, building, booting, and cleaning the project.
- `./harness install [--json]` MUST install dependencies with `npm ci` from `package-lock.json` and MUST NOT rewrite the lockfile.
- Direct project commands are allowed when the harness lacks a verb, explains a degraded path, or deeper diagnosis requires raw output.
- RPIV agents and the JustDoIt orchestrator MUST run `./harness help` at the beginning of their stage when the harness is available, before choosing project commands.
- RPIV agents and the JustDoIt orchestrator MUST answer "What did the agent have to infer that the harness should have proved?" before completing or returning an error.
- Non-empty answers identifying missing harness proof, unclear command mapping, unavailable diagnostics, degraded harness behavior, or raw-command bypasses for supported verbs MUST be recorded as friction via `./harness friction add`.
- Every harness command returns exactly one verdict: `pass` (exit 0), `fail` (exit 1), `degraded` (exit 2), or `unknown` (exit 3).
- `./harness verify` is the primary verification mechanism for the Implement and Verify pipeline stages.
- `./harness smoke [--port auto|PORT] [--json]` MUST be a first-class verb that starts the built Next.js app with `npm run start`/`next start`, probes only the root HTTP surface, and exits with the standard harness verdict codes.
- Smoke MUST remain a fast built-app root HTTP readiness check only; it MUST NOT be treated as a browser, Playwright, or user-flow verification gate.
- Smoke defaults to `--port auto`; auto allocation MUST use candidate ports in the documented `41000-41999` range with at most 50 bounded attempts, while fixed-port mode MUST validate a usable TCP port before starting the server.
- Smoke MUST bind the started app to `127.0.0.1`, poll `http://127.0.0.1:<port>/` once per second for at most 60 attempts, avoid following redirects, and treat only `200`, `301`, `302`, `303`, `307`, and `308` as successful readiness responses.
- Smoke MUST map missing build artifacts, start failures, readiness timeout, and HTTP `4xx`/`5xx` responses to `fail`; fixed-port conflicts and exhausted bounded auto-port races to `degraded`; and missing required command/probe capability to `unknown`.
- Smoke lifecycle cleanup MUST terminate only processes started by the current harness invocation, use deterministic traps for `EXIT`, `INT`, and `TERM`, and MUST NOT kill by port or terminate unrelated listeners.
- If smoke uses runtime metadata, it MUST keep checkout/worktree-scoped ownership records under `.harness/run/`, clean up stale or owned records safely, and keep `.harness/run/` out of version control.
- `./harness verify` MUST reuse the shared smoke implementation after the build/test steps and then run the browser E2E gate, preserving build-before-smoke sequencing, smoke-before-E2E sequencing, continue-on-failure execution, evidence writing, and aggregate verdict rules.
- `./harness test [--json] -- <vitest args...>` MUST forward every argument after `--` verbatim to Vitest through safe argument arrays; harness-owned `--json` is recognized only before the passthrough delimiter.
- `./harness test --json` metadata MUST identify full-suite runs as `targeted: false` with `targets: []`, `targetCount: 0`, and `truncated: false`; targeted runs MUST report `targeted: true`, sanitized string `targets`, `targetCount`, and whether any target label was truncated via top-level `truncated`.
- `./harness test --json` command summaries MUST report the backing full-suite command as `npm run test` and targeted runs as `npm run test -- <N target(s)>`, never raw forwarded arguments.
- `./harness e2e [--json] [-- <playwright args...>]` MUST be a first-class verb backed by `npm run e2e` for full-suite browser E2E and `npm run e2e -- <args...>` for targeted Playwright runs.
- `./harness e2e` MUST forward Playwright arguments only after the passthrough delimiter through safe argument arrays; harness-owned `--json` is recognized only before the delimiter; shell `eval`, string-built commands, and raw interpolation are prohibited.
- `./harness e2e --json` metadata MUST include a canonical `metadata.e2e` object. That object MUST identify full-suite runs as `targeted: false` with `targets: []`, `targetCount: 0`, and `truncated: false`; targeted runs MUST report `targeted: true`, sanitized string `targets`, `targetCount`, and whether any target label was truncated via `truncated`.
- `metadata.e2e.testCounts` MUST report sanitized Playwright result counts with exactly the nested fields `passed`, `failed`, `skipped`, `timedOut`, and `interrupted`.
- `./harness e2e --json` command summaries MUST report the backing full-suite command as `npm run e2e` and targeted runs as `npm run e2e -- <N target(s)>`, never raw forwarded arguments.
- Browser E2E runtime MUST bind DevDeck web and terminal servers to `127.0.0.1` by default and MUST allocate harness-owned web ports from `42000-42999` and terminal ports from `43000-43999` with at most 50 bounded paired attempts.
- Browser E2E runtime MUST reject fixed-port conflicts and bounded auto-port exhaustion without killing unrelated listeners or attaching to unrelated servers.
- Harness-managed Playwright runs MUST set `reuseExistingServer: false` or an equivalent no-reuse mode so occupied fixed ports cannot silently attach to unrelated DevDeck or non-DevDeck processes.
- Browser E2E runtime MUST create per-invocation fixture scratch space under `.harness/run/`, copy or synthesize mutable fixture data there, set `DEVDECK_PROJECTS_DIR`, `DEVDECK_DATA_DIR`, `DEVDECK_TOKEN`, and selected port env vars for the run, and preserve checked-in `e2e/fixtures/` as immutable seeds.
- Browser E2E runtime MUST write Playwright reports and artifacts to per-invocation artifact directories, exposed through `DEVDECK_E2E_ARTIFACT_DIR`, so concurrent runs do not share or clobber `test-results` output.
- Browser E2E cleanup MUST terminate only harness-owned child processes, release only harness-owned locks, and remove only harness-owned scratch fixture data on pass, fail, timeout, interrupt, and degraded paths.
- `./harness e2e` MUST map missing `npm`/`e2e` script/Playwright command capability to `unknown`, Playwright test failures and missing browser runtime to `fail`, and safe port/resource exhaustion to `degraded`.
- `./harness format_check [--json]` MUST be a first-class verb backed by `npm run format:check`.
- CI MUST NOT install Playwright browsers or run browser E2E. CI MUST run the non-browser harness gates (`./harness lint`, `./harness format_check`, `./harness build`, `./harness test`, and `./harness smoke`). Browser E2E remains local-only through `./harness e2e` and `./harness verify`.
- Evidence files are written to `.harness/evidence/` and MUST NOT contain secrets, tokens, or raw logs.
- Harness JSON output and evidence metadata MUST sanitize smoke, test, and E2E fields by excluding raw stdout/stderr, response bodies, redirect locations, environment variables, tokens, cookies, credential-bearing URLs, query strings, inline screenshots/traces/videos, and absolute paths outside the repository.
- Browser E2E JSON/evidence metadata MAY include sanitized targeting state, Playwright project names, `metadata.e2e.testCounts`, selected loopback ports, duration, fixture run identifiers, and safe repo-relative artifact paths; it MUST NOT embed raw Playwright reports, browser console logs, network bodies, cookies, tokens, or screenshots/traces/videos.
- Friction records are appended atomically to `.harness/friction.jsonl`.

### Interfaces

- `./harness <verb> [--json]` — CLI entrypoint supporting all required verbs.
- `./harness install [--json]` — Lockfile-exact dependency installation wrapper.
- `./harness format_check [--json]` — Prettier format check wrapper.
- `./harness smoke [--port auto|PORT] [--json]` — Standalone built-app smoke verification with loopback-only probing and deterministic cleanup.
- `./harness test [--json] [-- <vitest args...>]` — Vitest wrapper with optional targeted passthrough after `--`.
- `./harness e2e [--json] [-- <playwright args...>]` — Playwright browser E2E wrapper with optional targeted passthrough after `--`.
- `./harness verify [--json]` — Full verification sequence that runs lint, format check, build, test, the shared smoke implementation, and browser E2E.
- `package.json` script `e2e` — Backing command `playwright test` used by the harness.
- `playwright.config.ts` — Browser E2E runtime configuration consuming harness-selected loopback hosts, ports, token, projects directory, and data directory without reusing unrelated servers.
- `.harness/contract.yml` — Machine-readable command contract.
- `.harness/friction.jsonl` — JSONL friction log.
- `.harness/evidence/` — Verification evidence directory (gitignored).
- `.harness/run/` — Local runtime ownership metadata, E2E port locks, and E2E scratch fixture data directory (gitignored).
- `.github/workflows/ci.yml` — CI source of truth for non-browser gates; browser E2E remains local-only.
- `.harness/README.md` — Human-readable usage guide.

### Expectations

- Pipeline agents MUST use `./harness verify` as the primary verification path when the harness is available.
- Pipeline agents MUST run `./harness help` before selecting project commands when the harness is available.
- Pipeline agents SHOULD use `./harness orient` to understand the project before starting unfamiliar work.
- Pipeline agents SHOULD use `./harness doctor` to check prerequisites.
- Pipeline agents SHOULD use `./harness install` instead of direct `npm install` or `just install` when dependencies need to be restored.
- Pipeline agents SHOULD use `./harness test -- <targets...>` for focused Vitest regressions instead of direct `npm run test -- <targets...>` when the harness is available.
- Pipeline agents SHOULD use `./harness smoke` for standalone built-app smoke checks instead of copying `next start` lifecycle scripts.
- Pipeline agents SHOULD use `./harness e2e -- <targets...>` for focused browser E2E regressions instead of direct `npx playwright test` when the harness is available.
- `./harness verify` evidence SHOULD prove the exact ordered steps `lint`, `format_check`, `build`, `test`, `smoke`, and `e2e`.
- Browser E2E failures SHOULD be reproducible locally with `./harness e2e --json` or a targeted `./harness e2e -- <playwright args...>` invocation before falling back to raw Playwright diagnostics.
- The harness MUST wrap existing project commands; it MUST NOT invent a new build system.
- The harness MUST be a dependency-light Bash script using tools already in the devcontainer.
- Browser runtime processes, ports, and fixtures MUST be owned, bounded, and cleaned up by the harness/Playwright invocation; unrelated local servers are never attached to or terminated.

## Rationale

DevDeck previously had multiple command surfaces (npm scripts, justfile, and a separate verification.yml) with no single source of truth. Git history shows 29+ fix commits from agents and reviewers inferring incorrect commands. The harness eliminates this friction by providing a documented, testable, machine-readable command contract.

Browser E2E coverage is promoted into the harness because root HTTP readiness and Vitest do not prove that a real browser can authenticate, open projects, use terminal/file workflows, and render accessible states. Keeping Playwright behind `./harness e2e` and local `./harness verify` preserves one command surface for browser validation while CI stays limited to gates that do not require provisioning browser runtimes on GitHub-hosted runners.

## Usage Examples

```bash
# Orient in the project
./harness orient

# Check prerequisites
./harness doctor

# Install dependencies exactly from the lockfile
./harness install

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

# Run the browser E2E gate through the harness
./harness e2e --json

# Run a focused Playwright regression through the harness
./harness e2e -- e2e/terminal.spec.ts --project=chromium

# Forward Playwright's own reporter flag after the delimiter
./harness e2e --json -- --reporter=json e2e/file-tree-lazy.spec.ts

# Get machine-readable output
./harness verify --json

# Record friction when bypassing the harness
./harness friction add "needed raw vitest output for debugging"

# View recorded friction
./harness friction list
```

## Integration Guidelines

- **All RPIV agents:** MUST run `./harness help` at stage start when the harness is available, then answer the harness friction question before completing or returning an error.
- **`rpiv-implementer` agent:** MUST run `./harness verify` after implementing each task. SHOULD use `./harness install`, `./harness lint`, `./harness test -- <targets...>`, `./harness e2e -- <targets...>`, `./harness smoke`, and `./harness build` over direct npm or Playwright commands.
- **`rpiv-verifier` agent:** MUST use `./harness verify` as the primary verification mechanism. SHOULD use `./harness smoke` to isolate built-app smoke failures and `./harness e2e -- <targets...>` to isolate browser/user-flow failures. Falls back to auto-detection only when the harness is absent.
- **`rpiv-research` agent:** SHOULD use `./harness orient` and `./harness doctor` to understand the project.
- **`rpiv-planner` agent:** SHOULD reference `./harness` verbs in task acceptance criteria.
- **RPIV stage selectors:** MUST use `rpiv-research`, `rpiv-planner`, `rpiv-implementer`, and `rpiv-verifier` for subagent dispatch.
- **JustDoIt orchestrator:** MUST run `./harness help`, instruct subagents to use `./harness` verbs, inject the harness friction ritual into every stage prompt, and answer the harness friction question before completing.
- **Human developers:** SHOULD use `./harness verify` before pushing and `./harness e2e -- <targets...>` for focused browser regressions.
- **CI:** MUST run non-browser harness gates only: `./harness lint`, `./harness format_check`, `./harness build`, `./harness test`, and `./harness smoke`. CI MUST NOT install Playwright browsers or run browser E2E.
- **Harness maintainers:** MUST update `./harness help`, `./harness orient --json`, `./harness status`, `.harness/contract.yml`, `.harness/README.md`, `LLM.txt`, and agent-facing guidance when harness verbs or passthrough contracts change.
- **Playwright maintainers:** MUST keep `playwright.config.ts` aligned with harness-owned loopback hosts, non-reuse server policy, fixture isolation env vars, and safe artifact locations.

## Exceptions

- Repos without a harness: agents fall back to auto-detecting applicable verification commands from project files.
- Debugging: direct commands are allowed when the harness abstracts away needed diagnostic detail; record as friction.
- Dependency maintenance: direct `npm install` or `npm install --package-lock-only` is allowed when intentionally changing dependency constraints or regenerating `package-lock.json`; normal dependency restoration should use `./harness install`.
- CI environments: CI pipelines run non-browser gates only because browser provisioning is unreliable on the GitHub-hosted runner. Browser E2E remains local-only through `./harness e2e` and `./harness verify`.
- Bootstrap: new projects may not have a harness until the harness-cli-it skill runs.
- Smoke does not build the application; callers MUST run `./harness build` first or use `./harness verify` for build-before-smoke sequencing.
- Token-protected HTTP environments may cause unauthenticated smoke to fail; smoke MUST NOT add tokens, cookies, or query strings to make the probe pass.
- E2E may start token-protected DevDeck servers with harness-owned fixture tokens; those tokens MUST NOT appear in JSON, evidence, logs, URLs, artifact path names, or decision records.
- Playwright UI/debug modes may be run directly only for local diagnosis after a harness E2E failure; they are not substitutes for `./harness e2e` or `./harness verify`, and the bypass MUST be recorded as friction when used by agents.
- Port conflicts are reported through verdicts and metadata; the harness MUST NOT kill unrelated processes to free a smoke or E2E port.

## Enforcement

- [ ] Automated checks: `./harness verify` runs lint, format, build, Vitest, smoke, E2E, and writes evidence
- [x] Agent instructions require `./harness help` preflight and harness usage (MUST for `rpiv-verifier`/`rpiv-implementer`, SHOULD for others)
- [x] Agent instructions require end-of-stage friction reflection and non-empty friction recording
- [x] Friction log tracks every harness bypass
- [x] `./harness install` provides deterministic lockfile-based dependency installation
- [x] `./harness smoke` has automated parser, port, lifecycle, cleanup, JSON, and evidence tests
- [x] `./harness test -- <targets...>` has automated passthrough, quoting, sanitization, and Vitest `--json` forwarding tests
- [x] `./harness verify` evidence proves it uses the shared smoke implementation and preserves aggregate verdict behavior
- [ ] Automated checks: `./harness e2e` parser, passthrough, JSON, evidence, port ownership, fixture isolation, cleanup, and sanitization tests
- [ ] Automated checks: `./harness verify` evidence proves E2E runs after smoke with continue-on-failure aggregation
- [ ] Automated checks: Playwright config rejects unrelated fixed-port reuse and binds harness servers to loopback
- [ ] Automated checks: CI runs non-browser gates only and omits Playwright browser installation/E2E
- [ ] Test coverage requirements: Representative Playwright flows cover auth, project registry, terminal, file tree, file preview/edit/save, layout toggles, and accessibility selectors
- [ ] Verification: Local handoff uses `./harness verify --json` to produce a browser-backed verdict and sanitized evidence; CI uses non-browser gates only

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md) — Defines the project tools the harness wraps
- [ADR-0004-token-authentication](../ADR/ADR-0004-token-authentication.md) — Defines token behavior that smoke must not leak or bypass
- [ADR-0006-config-file-driven-configuration](../ADR/ADR-0006-config-file-driven-configuration.md) — Defines env/config runtime behavior used by DevDeck web and terminal servers
