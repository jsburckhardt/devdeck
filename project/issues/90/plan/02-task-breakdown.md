# Task Breakdown: Issue #90 — First-Class Harness Smoke and Targeted Test Passthrough

## Task T1: Redesign harness argument parsing and verb dispatch

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0009; DECISION-LOG decisions #146, #150, #234, #238, #239

### Description
Replace the current global flag sweep that removes `--json` anywhere in the command with delimiter-aware parsing. Harness-owned flags must be parsed before verb passthrough, while verb arguments after `--` remain available to the selected verb unchanged.

### Acceptance Criteria
- `./harness test -- --json src/server/start-dev.test.ts` forwards Vitest's `--json` after the delimiter instead of enabling harness JSON mode.
- `./harness test --json -- src/server/start-dev.test.ts` enables harness JSON mode while preserving the target argument after `--`.
- `./harness smoke --port auto`, `./harness smoke --port 41042`, and `./harness smoke --json --port auto` parse deterministically.
- `./harness smoke` rejects unknown flags, duplicate `--port`, missing `--port` values, and invalid port values with a `fail` verdict plus usage guidance.
- Dispatch preserves existing verbs and exit-code mapping: `pass=0`, `fail=1`, `degraded=2`, `unknown=3`.

### Test Coverage
- Add parser-focused Vitest coverage for harness JSON before the delimiter, Vitest `--json` after the delimiter, missing delimiter behavior, unknown smoke flags, duplicate smoke flags, and invalid smoke ports.
- Include `NO_COLOR=1 ./harness ...` assertions for stable human usage output where supported.

## Task T2: Implement targeted `./harness test` passthrough with safe arrays

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0009; DECISION-LOG decisions #146, #148, #150, #238, #239

### Description
Make `./harness test` wrap the existing `npm run test` command while supporting targeted Vitest arguments after `--`. Remove unsafe `eval` execution from targeted paths and emit sanitized target metadata for JSON output.

### Acceptance Criteria
- `./harness test` still runs the full Vitest suite through the existing npm script.
- `./harness test -- src/server/start-dev.test.ts` runs `npm run test -- src/server/start-dev.test.ts`.
- `./harness test -- --json src/server/start-dev.test.ts` passes Vitest's own `--json` through exactly as a Vitest argument.
- Targeted execution uses command arrays, not shell `eval`, so spaces, quotes, semicolons, and shell metacharacters in target strings are not interpreted by the shell.
- JSON output summarizes target count and sanitized target labels only.
- Sanitization converts repo-absolute paths to repo-relative paths, redacts absolute paths outside the repo, removes credential/query/control characters, caps each target at 200 characters, and marks truncated targets.

### Test Coverage
- Add targeted passthrough tests for one file, multiple files, `--` delimiter preservation, Vitest `--json` passthrough, harness `--json` before delimiter, spaces/metacharacters, and failed targeted tests.
- Add JSON sanitization tests for repo-absolute paths, outside-repo absolute paths, query strings, credential URLs, control characters, and long targets.

## Task T3: Build shared smoke port selection and lifecycle cleanup

- **Status:** Pending
- **Complexity:** High
- **Dependencies:** T1
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0006
- **Related Core-Components:** CORE-COMPONENT-0009; DECISION-LOG decisions #150, #151, #234, #235, #236, #239

### Description
Implement the reusable smoke helper behind `./harness smoke [--port auto|PORT] [--json]`. The helper must start only the built Next.js app, bind to loopback, probe root HTTP readiness, map verdicts explicitly, and clean up only processes started by the current invocation.

### Acceptance Criteria
- `./harness smoke` defaults to `--port auto`.
- Auto-port selection uses candidates in `41000-41999` with no more than 50 bounded attempts.
- Fixed-port mode validates usable TCP port input before starting `next start`.
- Fixed-port conflicts return `degraded` and do not terminate the existing listener.
- Auto-port `EADDRINUSE` races retry within the bounded attempt limit and return `degraded` after exhaustion.
- Smoke starts the built app through the existing `npm run start`/`next start` surface, bound to `127.0.0.1`.
- Readiness probes `http://127.0.0.1:<port>/` once per second for at most 60 attempts, without following redirects.
- HTTP `200`, `301`, `302`, `303`, `307`, and `308` map to `pass`; missing build/start/readiness and HTTP `4xx`/`5xx` map to `fail`; missing required command/probe capability maps to `unknown`.
- Cleanup traps `EXIT`, `INT`, and `TERM`, terminates only harness-owned child processes/process groups, waits for shutdown, and never kills by port.
- If `.harness/run/` ownership metadata is introduced, records are checkout/worktree-scoped, stale records are cleaned without killing unrelated processes, and `.harness/run/` is added to `.gitignore`.
- Smoke never uses tokens, cookies, or query strings to pass token-protected root requests; token-protected `401` responses remain `fail`.

### Test Coverage
- Add tests for valid/invalid fixed ports, duplicate/missing port values, fixed-port conflict without killing, auto-port allocation, auto-port retry on race, auto-port exhaustion/degraded, missing build/start failures, redirect status success, `4xx` failure, and missing probe/command `unknown`.
- Add lifecycle tests proving no harness-started child process remains after pass, fail, timeout, interrupt, and readiness failure paths.
- Add metadata tests for `.harness/run/` creation/removal/stale-record cleanup if that directory is used.

## Task T4: Emit sanitized smoke JSON and evidence metadata

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** T3
- **Related ADRs:** ADR-0004, ADR-0006
- **Related Core-Components:** CORE-COMPONENT-0009; DECISION-LOG decisions #151, #234, #235, #236, #239

### Description
Define and implement the safe metadata shape for standalone smoke JSON output and verify-embedded smoke evidence. Metadata should help agents diagnose verdicts without exposing raw logs, credentials, host secrets, or sensitive paths.

### Acceptance Criteria
- `./harness smoke --json` emits valid JSON with the standard harness fields and sanitized smoke metadata.
- Smoke metadata may include port mode, selected port, bind host, probe host, attempt count, readiness attempts, accepted status class/code, duration, cleanup outcome, and bounded failure reason.
- Smoke JSON and evidence exclude raw stdout/stderr, response bodies, redirect locations, tokens, cookies, query strings, env vars, credential-bearing URLs, absolute home paths, and absolute paths outside the repository.
- Human smoke output reports the verdict, selected mode/port, and sanitized failure reason without raw server logs.
- `NO_COLOR=1 ./harness smoke ...` produces stable non-colored human output.

### Test Coverage
- Add JSON validity and schema tests for `pass`, `fail`, `degraded`, and `unknown` smoke outcomes using controlled fake backing commands where possible.
- Add leakage tests with fake output containing tokens, credential URLs, query strings, redirect locations, response bodies, env names, control characters, and external absolute paths.
- Add human-output tests for sanitized `NO_COLOR=1` output.

## Task T5: Replace verify inline smoke with the shared smoke implementation

- **Status:** Pending
- **Complexity:** High
- **Dependencies:** T3, T4
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0006
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0009; DECISION-LOG decisions #147, #150, #151, #165, #166, #237, #239

### Description
Remove `cmd_verify()`'s fixed-port inline smoke script and call the shared smoke helper for the smoke step. Preserve verify's role as the full repository verification contract and evidence source of truth.

### Acceptance Criteria
- `./harness verify` runs lint → format_check → build → test → shared smoke in that order.
- Verify continues running later steps even when earlier steps fail.
- Verify no longer hard-codes port `9999`.
- Verify preserves aggregate verdict precedence across `fail`, `degraded`, `unknown`, and `pass`.
- Verify evidence includes the smoke step and sanitized smoke metadata in the same evidence file.
- Verify does not duplicate smoke lifecycle logic outside the shared smoke implementation.
- Verify never kills unrelated listeners when smoke encounters a port conflict.

### Test Coverage
- Add verify tests using fake backing commands to prove ordering, continue-on-failure, aggregate verdict precedence, shared smoke invocation, and sanitized evidence shape.
- Add regression coverage for degraded fixed-port conflict and failed smoke readiness inside verify.
- Run `./harness verify --json` during final validation and confirm the JSON/evidence shape includes the shared smoke step.

## Task T6: Update help, orient, contract, docs, and ignore rules

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** T1, T2, T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0009; DECISION-LOG decisions #146, #147, #152, #165, #166, #234, #238

### Description
Update all agent- and human-facing harness discovery surfaces so the new smoke and targeted test workflows are discoverable without reading implementation code.

### Acceptance Criteria
- `./harness help` lists `smoke`, `smoke --port auto|PORT`, and `test -- <vitest args...>` examples.
- Human `./harness orient` lists smoke and targeted test command mappings.
- `./harness orient --json` emits valid JSON containing a `verbs` array and `commands.smoke` / `commands.test` discovery fields.
- `.harness/contract.yml` documents the `smoke` verb, test passthrough delimiter semantics, shared verify smoke step, smoke verdict mapping, safe metadata policy, and runtime directory if used.
- `.harness/README.md` documents smoke usage, port modes, lifecycle cleanup safety, targeted test passthrough, JSON/evidence sanitization, and validation examples.
- `LLM.txt` lists the new harness capabilities and any new `.harness/run/` directory.
- `.gitignore` includes `.harness/run/` if runtime metadata is introduced.
- `AGENTS.md` is reviewed and updated only if needed to avoid conflicting or stale harness guidance.

### Test Coverage
- Add tests or validation scripts that parse `./harness orient --json` and assert required discovery fields.
- Add help-output checks for the new smoke and targeted test strings.
- Add contract/doc validation checks where practical, plus final manual review against CORE-COMPONENT-0009.

## Task T7: Add automated harness test suite coverage

- **Status:** Pending
- **Complexity:** High
- **Dependencies:** T1, T2, T3, T4, T5, T6
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0009; DECISION-LOG decisions #150, #151, #234, #235, #236, #237, #238, #239

### Description
Add a maintainable automated test suite for the Bash harness under the existing Vitest configuration. Use controlled fake backing commands and repo-local isolated fixtures to keep tests deterministic and fast.

### Acceptance Criteria
- Harness tests are discoverable by the existing Vitest include pattern (`src/**/*.test.{ts,tsx}`) or the Vitest config is intentionally updated.
- Tests spawn the root `./harness` with controlled environment variables and fake backing commands where needed.
- Tests avoid slow 60-second waits by overriding or simulating bounded readiness behavior where practical.
- The suite covers parser behavior, port validation, fixed-port conflict, auto-port allocation/retry, cleanup/no orphan process, JSON sanitization, targeted test passthrough including `--` and Vitest `--json`, verify evidence shape, orient discovery fields, and harness verification.
- Any real smoke integration test runs only after a successful build and has bounded cleanup.

### Test Coverage
- Run targeted harness tests with `./harness test -- <new harness test target>`.
- Run the full suite with `./harness test` after targeted coverage passes.
- Include at least one integration-oriented smoke success path after `./harness build`, unless documented as impractical with an explicit substitute fake-backed test.

## Task T8: Perform final harness validation and evidence review

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** T7
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0006
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0009; DECISION-LOG decisions #147, #150, #151, #165, #166, #234, #235, #236, #237, #238, #239

### Description
Validate the completed implementation end-to-end through the repo-local harness, inspect generated metadata for safety, and ensure the workspace is left clean.

### Acceptance Criteria
- `./harness doctor` reports required prerequisites available or an understood non-blocking degraded state.
- `./harness test -- <new harness test target>` passes for targeted harness tests.
- `./harness test` passes for the full Vitest suite.
- `./harness build` succeeds before standalone smoke validation.
- `./harness smoke --json` returns a valid verdict and sanitized metadata, with no harness-owned server process left running afterward.
- `./harness verify --json` completes with expected aggregate verdict semantics and writes sanitized evidence.
- Evidence contains no raw stdout/stderr, tokens, query strings, redirect locations, response bodies, credential URLs, or external absolute paths.
- If final validation requires a direct command because the harness is degraded or lacks diagnostic detail, record the reason with `./harness friction add`.

### Test Coverage
- Capture final validation results from `./harness doctor`, targeted `./harness test -- ...`, full `./harness test`, `./harness build`, `./harness smoke --json`, and `./harness verify --json`.
- Inspect the latest verify evidence for the shared smoke step, sanitized smoke metadata, targeted test metadata when applicable, and no sensitive leakage.
