# Implementation Notes: Issue #90

## Task T1: Redesign harness argument parsing and verb dispatch

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`
- **Tests Passed:** 2
- **Tests Failed:** 0

### Changes Summary

- Replaced the global `--json` sweep with delimiter-aware per-verb parsing.
- Added deterministic smoke flag parsing for `--port auto`, `--port=auto`, `--port PORT`, `--port=PORT`, and smoke usage failures.
- Preserved standard verdict exit mapping.

### Test Results

- `./harness test -- src/harness/harness-cli.test.ts` — pass.
- `NO_COLOR=1 ./harness smoke --json --port=bad` — expected `fail` verdict with usage.

### Notes

- Vitest `--json` after `./harness test --` remains a forwarded Vitest argument.

## Task T2: Implement targeted `./harness test` passthrough with safe arrays

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`, `.harness/README.md`, `.harness/contract.yml`
- **Tests Passed:** 4
- **Tests Failed:** 0

### Changes Summary

- `./harness test` now runs `npm run test`; targeted args run as `npm run test -- <args...>` through Bash arrays.
- Harness JSON applies only before the passthrough delimiter.
- JSON output reports sanitized target count/labels only.

### Test Results

- Targeted passthrough tests cover harness JSON, Vitest `--json`, spaces/metacharacters, and sanitization.
- `./harness test -- src/harness/harness-cli.test.ts` — pass.

### Notes

- No `eval` is used in targeted test execution.

## Task T3: Build shared smoke port selection and lifecycle cleanup

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`
- **Tests Passed:** 7
- **Tests Failed:** 0

### Changes Summary

- Added first-class `./harness smoke [--port auto|PORT] [--json]`.
- Default auto mode checks `41000-41999` with at most 50 candidates.
- Starts the built app through `npm run start -- --hostname 127.0.0.1 --port <selectedPort>`.
- Probes root over loopback without following redirects.
- Added cleanup traps for `EXIT`, `INT`, and `TERM`, killing only the harness-owned child/process group.

### Test Results

- Automated tests cover fixed conflicts, auto retry, auto exhaustion, HTTP 4xx, missing capability, and no-orphan cleanup.
- `./harness smoke --json` after `./harness build` — pass.

### Notes

- The harness does not kill by port and does not use port ownership metadata.

## Task T4: Emit sanitized smoke JSON and evidence metadata

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`, `.harness/README.md`, `.harness/contract.yml`
- **Tests Passed:** 4
- **Tests Failed:** 0

### Changes Summary

- Smoke JSON includes sanitized metadata: port mode, selected port, loopback hosts, attempts, status, duration, cleanup, and bounded reason.
- Smoke and verify evidence exclude raw stdout/stderr, response bodies, redirect locations, query strings, credentials, env vars, and external absolute paths.

### Test Results

- Leakage tests use noisy fake backing commands and token-protected smoke.
- `DEVDECK_TOKEN=smoke-test-token ./harness smoke --json` — expected `fail` for unauthenticated `401`, with no token leakage.

### Notes

- Human smoke output reports only sanitized verdict, mode, and reason.

## Task T5: Replace verify inline smoke with the shared smoke implementation

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`
- **Tests Passed:** 4
- **Tests Failed:** 0

### Changes Summary

- Removed verify's fixed-port `9999` inline smoke logic.
- Verify now runs lint → format_check → build → test → shared smoke.
- Continue-on-failure and aggregate verdict behavior are preserved.
- Evidence embeds the shared smoke step and sanitized smoke metadata.

### Test Results

- Fake-backed verify tests cover ordering, continue-on-failure, pass/fail/degraded/unknown smoke aggregation, and evidence shape.
- `./harness verify --json` — pass; final run reported evidence under `.harness/evidence/`.

### Notes

- Evidence inspection found no raw logs, tokens, query strings, credential URLs, response bodies, or external absolute paths.

## Task T6: Update help, orient, contract, docs, and ignore rules

- **Status:** Complete
- **Files Changed:** `harness`, `.harness/README.md`, `.harness/contract.yml`, `.gitignore`, `LLM.txt`, `AGENTS.md`
- **Tests Passed:** 3
- **Tests Failed:** 0

### Changes Summary

- Help and orient now document smoke and targeted test passthrough.
- `orient --json` includes `verbs` plus `commands.smoke` and `commands.test`.
- Contract and README document smoke verdicts, cleanup safety, metadata policy, and passthrough delimiter semantics.
- Added `.harness/run/` to `.gitignore` for local runtime/test scratch metadata.

### Test Results

- Help/orient tests pass in `src/harness/harness-cli.test.ts`.
- `NO_COLOR=1 ./harness orient --json` emits valid discovery JSON.

### Notes

- `AGENTS.md` was updated only to avoid stale harness guidance.

## Task T7: Add automated harness test suite coverage

- **Status:** Complete
- **Files Changed:** `src/harness/harness-cli.test.ts`
- **Tests Passed:** 20
- **Tests Failed:** 0

### Changes Summary

- Added Node-environment Vitest coverage for parser behavior, smoke port validation, conflicts, auto retry/exhaustion, lifecycle cleanup, JSON sanitization, targeted passthrough, verify evidence, and discovery fields.

### Test Results

- `./harness test -- src/harness/harness-cli.test.ts` — 20 tests passed.
- `./harness test` — full Vitest suite passed.

### Notes

- Fake backing commands keep smoke and verify cases deterministic and fast.

## Task T8: Perform final harness validation and evidence review

- **Status:** Complete
- **Files Changed:** `project/issues/90/implementation/README.md`
- **Tests Passed:** 7
- **Tests Failed:** 0

### Changes Summary

- Ran end-to-end harness validation and reviewed generated evidence.

### Test Results

- `./harness doctor` — pass.
- `./harness test -- src/harness/harness-cli.test.ts` — pass.
- `./harness test` — pass.
- `./harness build` — pass.
- `./harness smoke --json` — pass.
- `DEVDECK_TOKEN=smoke-test-token ./harness smoke --json` — expected `fail` with sanitized `401` metadata.
- `./harness verify --json` — pass.

### Notes

- No commits were created in the Implement stage.

## Task T6 Retry: Correct orient JSON discovery shape

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`, `project/issues/90/implementation/README.md`
- **Tests Passed:** 3
- **Tests Failed:** 0

### Changes Summary

- Moved discovery verbs from the top level into `surfaces.harness_contract.verbs` with the required first-class friction subcommands.
- Renamed smoke discovery metadata from `commands.smoke.defaultPortMode` to `commands.smoke.portModeDefault`.
- Updated test discovery metadata to use `commands.test.command: "npm run test [-- <targets>]"` and `commands.test.supportsTargets: true`.
- Strengthened the orient JSON test to reject the conflicting top-level `verbs` field and the old smoke field name.

### Test Results

- `./harness test -- src/harness/harness-cli.test.ts` — pass, 20 tests.
- Direct `./harness orient --json` parse/assertion check — pass.
- `./harness verify --json` — pass.

### Notes

- Extra non-conflicting discovery fields such as smoke usage, smoke auto range, and targeted-test examples were preserved.

## Task T3/T7 Follow-up: Add race-safe smoke runtime ownership metadata

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`, `.harness/README.md`, `.harness/contract.yml`, `LLM.txt`, `project/issues/90/implementation/README.md`
- **Tests Passed:** 4
- **Tests Failed:** 0

### Changes Summary

- Added checkout/worktree-scoped smoke lock directories under `.harness/run/smoke-<repo-hash>-<port>.lock`.
- Added secret-free `owner.json` metadata with selected port, parent PID, child PID/process group, safe repo identity, sanitized command summary, and timestamp.
- Added stale metadata validation: dead-process locks are cleaned; proven stale owned processes may be terminated; live unproven processes are never killed.
- Changed auto-port selection to lock candidates before post-lock availability checks and retry bounded races safely.
- Expanded harness tests for concurrent auto smoke runs, sibling repo identity isolation, stale lock cleanup, live unproven metadata safety, interruption/timeout cleanup, and the full invalid port matrix.

### Test Results

- `./harness test -- src/harness/harness-cli.test.ts` — pass, 30 tests.
- `./harness verify --json` — pass.
- `./harness smoke --json --port auto` — pass.
- `git check-ignore -q .harness/run/` — pass; `.harness/run/` remains ignored.

### Notes

- An initial `./harness verify --json` run exposed formatting drift in `src/harness/harness-cli.test.ts`; Prettier was applied and the verification rerun passed.
- No commits or PRs were created.

## Task T2/T8 Follow-up: Add explicit targeted test JSON metadata

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`, `.harness/README.md`, `.harness/contract.yml`, `project/architecture/core-components/CORE-COMPONENT-0009-engineering-harness.md`, `project/issues/90/implementation/README.md`
- **Tests Passed:** 4
- **Tests Failed:** 0

### Changes Summary

- Added explicit `metadata.targeted` and top-level `metadata.truncated` fields to `./harness test --json`.
- Full-suite test JSON now reports `targeted: false`, `targets: []`, `targetCount: 0`, and `truncated: false`.
- Targeted test JSON now reports `targeted: true`, sanitized targets, target count, and whether any target label was truncated.
- Updated README, contract, and engineering-harness component documentation for the test metadata shape.

### Test Results

- `./harness test -- src/harness/harness-cli.test.ts` — pass, 31 tests.
- `./harness test --json` — pass; emitted non-targeted metadata.
- `./harness test --json -- src/harness/harness-cli.test.ts` — pass; emitted targeted metadata.
- `./harness verify --json` — pass.

### Notes

- Targeted run command summaries remain count-based (`npm run test -- <N target(s)>`).
- No commits or PRs were created.

## Task T2/T8 Follow-up: Correct targeted test JSON shape

- **Status:** Complete
- **Files Changed:** `harness`, `src/harness/harness-cli.test.ts`, `.harness/README.md`, `.harness/contract.yml`, `project/architecture/core-components/CORE-COMPONENT-0009-engineering-harness.md`, `project/issues/90/implementation/README.md`
- **Tests Passed:** 4
- **Tests Failed:** 0

### Changes Summary

- Changed targeted test JSON metadata so `metadata.targets` is an array of sanitized strings rather than per-target objects.
- Kept `metadata.truncated` as the top-level summary flag for whether any sanitized target label was capped.
- Added test JSON command summaries: `npm run test` for full-suite runs and `npm run test -- <N target(s)>` for targeted runs.
- Updated tests, contract, README, and engineering-harness component language to match the issue-required shape.

### Test Results

- `./harness test -- src/harness/harness-cli.test.ts` — pass, 31 tests.
- `./harness test --json` — pass; emitted non-targeted metadata and `command: "npm run test"`.
- `./harness test --json -- src/harness/harness-cli.test.ts` — pass; emitted `targets: ["src/harness/harness-cli.test.ts"]` and `command: "npm run test -- <1 target(s)>"`.
- `./harness verify --json` — pass.

### Notes

- No commits or PRs were created.
