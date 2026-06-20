# Test Plan: Issue #90 — First-Class Harness Smoke and Targeted Test Passthrough

## Test TP1: Delimiter-aware parser behavior

- **Type:** Automated unit/CLI
- **Task:** T1
- **Priority:** High

### Setup
Use the new harness parser tests plus `NO_COLOR=1` CLI invocations against the repo-local `./harness`.

### Steps
1. Exercise `./harness test --json -- src/server/start-dev.test.ts`.
2. Exercise `./harness test -- --json src/server/start-dev.test.ts`.
3. Exercise smoke flag combinations: `./harness smoke --port auto`, `./harness smoke --json --port auto`, duplicate `--port`, missing `--port`, unknown flags, and invalid ports.

### Expected Result
Harness JSON mode is recognized only before the passthrough delimiter, Vitest `--json` after `--` is preserved for Vitest, and invalid smoke usage returns `fail` with usage guidance.

## Test TP2: Port validation and fixed-port conflict safety

- **Type:** Automated CLI/integration with fake server
- **Task:** T3
- **Priority:** High

### Setup
Start a controlled listener on a known loopback port and record its PID/health before invoking smoke.

### Steps
1. Run `./harness smoke --port <occupied-port> --json`.
2. Verify the existing listener still responds after the harness exits.
3. Run invalid fixed-port cases for non-numeric, out-of-range, empty, and duplicate values.

### Expected Result
Occupied fixed ports return `degraded`, invalid ports return `fail`, and the pre-existing listener is not killed or modified.

## Test TP3: Auto-port allocation, retry, and exhaustion

- **Type:** Automated unit/CLI with controlled fakes
- **Task:** T3
- **Priority:** High

### Setup
Use fake backing commands or controlled listeners to simulate available ports, `EADDRINUSE` races, and exhausted candidate attempts without waiting on real 60-second readiness loops.

### Steps
1. Run `./harness smoke --port auto --json` with an immediately available candidate.
2. Simulate one or more auto-port bind races and confirm retry.
3. Simulate all bounded attempts failing with `EADDRINUSE`.

### Expected Result
Auto mode selects ports only from `41000-41999`, retries bounded races up to the configured attempt limit, passes when a candidate succeeds, and returns `degraded` when bounded allocation is exhausted.

## Test TP4: Smoke lifecycle cleanup and no orphan process

- **Type:** Automated integration
- **Task:** T3
- **Priority:** High

### Setup
Use a fake long-running `next start`/`npm run start` command that records lifecycle events and can simulate pass, fail, timeout, and signal interruption paths.

### Steps
1. Run smoke success, start-failure, readiness-timeout, HTTP-failure, and interrupted-exit scenarios.
2. After each run, check that the harness-owned child process or process group has exited.
3. If `.harness/run/` is used, inspect that owned metadata is removed and stale metadata is cleaned safely.

### Expected Result
All harness-owned children are terminated and waited for, unrelated processes remain untouched, traps run on `EXIT`/`INT`/`TERM`, and runtime metadata does not persist incorrectly.

## Test TP5: Smoke JSON and evidence sanitization

- **Type:** Automated unit/CLI
- **Task:** T4
- **Priority:** High

### Setup
Configure fake smoke outputs and failure reasons containing raw logs, tokens, query strings, credential URLs, redirect locations, response bodies, control characters, environment variable names, home paths, and external absolute paths.

### Steps
1. Run `./harness smoke --json` against each controlled scenario.
2. Run `NO_COLOR=1 ./harness smoke` for human-output checks.
3. Inspect verify evidence after a smoke-containing verify test.

### Expected Result
JSON and evidence remain valid and contain only sanitized metadata; no raw stdout/stderr, tokens, query strings, redirect locations, response bodies, credential URLs, or external absolute paths appear.

## Test TP6: Targeted test passthrough including `--` and Vitest `--json`

- **Type:** Automated CLI
- **Task:** T2
- **Priority:** High

### Setup
Use fake npm/Vitest commands for argument-capture tests and real `./harness test -- <target>` for at least one repository test file.

### Steps
1. Run `./harness test -- src/server/start-dev.test.ts`.
2. Run `./harness test -- --json src/server/start-dev.test.ts`.
3. Run `./harness test --json -- src/server/start-dev.test.ts`.
4. Run targets containing spaces, quotes, semicolons, query strings, credential-like values, and long strings.

### Expected Result
Arguments after `--` are forwarded verbatim to Vitest through safe arrays, harness JSON remains distinct from Vitest JSON, target metadata is sanitized, and shell metacharacters are never evaluated.

## Test TP7: Verify shared smoke evidence shape and verdict aggregation

- **Type:** Automated CLI/integration
- **Task:** T5
- **Priority:** High

### Setup
Use fake backing commands to control lint, format_check, build, test, and smoke verdicts without requiring slow full repository runs for every case.

### Steps
1. Run verify scenarios where earlier steps fail but smoke still executes.
2. Run smoke `pass`, `fail`, `degraded`, and `unknown` scenarios inside verify.
3. Inspect the emitted verify JSON and evidence file.

### Expected Result
Verify uses the shared smoke implementation after build/test, continues through later steps, aggregates verdicts correctly, writes evidence once, and includes sanitized smoke metadata.

## Test TP8: Help, orient, and contract discovery fields

- **Type:** Automated CLI/documentation
- **Task:** T6
- **Priority:** Medium

### Setup
Use CLI output checks and JSON parsing for harness discovery surfaces.

### Steps
1. Run `./harness help`.
2. Run `./harness orient`.
3. Run `./harness orient --json` and parse the JSON.
4. Inspect `.harness/contract.yml`, `.harness/README.md`, `LLM.txt`, and `.gitignore` when `.harness/run/` is introduced.

### Expected Result
Help and orient document `smoke` and targeted `test -- <args>` workflows; orient JSON includes `verbs` and `commands.smoke` / `commands.test`; docs and contract match CORE-COMPONENT-0009.

## Test TP9: Token-protected smoke failure without token leakage

- **Type:** Automated integration
- **Task:** T3, T4
- **Priority:** Medium

### Setup
Run smoke against a built app or fake probe scenario where `DEVDECK_TOKEN` is set and unauthenticated root requests return `401`.

### Steps
1. Run `DEVDECK_TOKEN=<test-token> ./harness smoke --json`.
2. Inspect JSON/human output and any verify evidence.
3. Confirm no token, cookie, or query-string probe was used or persisted.

### Expected Result
Smoke returns `fail` for the unauthenticated `401`, does not attempt token-bearing URLs, and does not leak the token or credential-bearing metadata.

## Test TP10: Built-app smoke success path

- **Type:** Integration
- **Task:** T7, T8
- **Priority:** High

### Setup
Run a successful production build first.

### Steps
1. Run `./harness build`.
2. Run `./harness smoke --json`.
3. Confirm cleanup after the smoke command exits.

### Expected Result
The built app starts on loopback using an auto-selected port, readiness succeeds with an accepted HTTP status, JSON metadata is sanitized, and no harness-owned server process remains.

## Test TP11: Full harness verification

- **Type:** End-to-end verification
- **Task:** T8
- **Priority:** High

### Setup
Complete implementation tasks and ensure dependencies are installed.

### Steps
1. Run `./harness doctor`.
2. Run `./harness test -- <new harness test target>`.
3. Run `./harness test`.
4. Run `./harness verify --json`.
5. Inspect the latest `.harness/evidence/verify-*.json`.

### Expected Result
Supported harness validation passes or reports a clearly understood verdict, verify writes sanitized evidence with the shared smoke step, and no direct commands are needed except documented degraded diagnostics.

## Test TP12: Documentation and contract drift review

- **Type:** Manual review with automated spot checks
- **Task:** T6, T8
- **Priority:** Medium

### Setup
Review the final diff for all required documentation and architecture artifacts.

### Steps
1. Compare `CORE-COMPONENT-0009`, `DECISION-LOG.md`, `.harness/contract.yml`, `.harness/README.md`, `LLM.txt`, `./harness help`, and `./harness orient --json`.
2. Confirm `.gitignore` includes `.harness/run/` only if runtime metadata was introduced.
3. Confirm no new ADR or core-component file was created for Issue #90.

### Expected Result
All global and issue-scoped documentation surfaces describe the same smoke/test contracts, decision records remain concrete and actionable, and no unnecessary architecture artifact was added.
