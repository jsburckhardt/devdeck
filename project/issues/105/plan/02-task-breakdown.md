# Task Breakdown: Browser E2E Verification Gate

## Task T1: Add first-class `./harness e2e` verb and package script

- **Status:** Pending
- **Complexity:** L
- **Dependencies:** None
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0006
- **Related Core-Components:** CORE-COMPONENT-0009 (Decisions #263, #266, #267), CORE-COMPONENT-0006 (Decision #273)

### Description
Implement the harness E2E command surface without changing application behavior. Expected files include `package.json`, `harness`, `src/harness/harness-cli.test.ts`, and any small harness helper code if extracted. Add `"e2e": "playwright test"` and implement `./harness e2e [--json] [-- <playwright args...>]` backed by `npm run e2e`.

The parser must mirror the safe targeted Vitest pattern: harness-owned `--json` is recognized before `--`; every argument after `--` is forwarded through arrays exactly as received; non-delimited Playwright targets may be handled only if explicitly documented; no shell `eval` or string-built commands are allowed.

### Acceptance Criteria
- `./harness help` lists `e2e` with a concise browser E2E description.
- `./harness orient --json` includes the `e2e` command mapping, Playwright support, and updated verify sequence.
- `./harness e2e --json` returns harness JSON with `verb`, `verdict`, sanitized `command`, `steps`, `metadata`, `message`, and `timestamp`.
- Full-suite metadata reports `targeted: false`, `targets: []`, `targetCount: 0`, and `truncated: false`.
- Targeted metadata reports `targeted: true`, sanitized `targets`, `targetCount`, and `truncated` without changing forwarded Playwright arguments.
- Missing `npm`, missing `package.json` script, or missing Playwright command capability maps to `unknown`; Playwright test failures map to `fail`.
- No raw Playwright stdout/stderr, tokens, cookies, query strings, environment variables, or external absolute paths appear in JSON or evidence.

### Test Coverage
- Add Vitest coverage in `src/harness/harness-cli.test.ts` for parser behavior, full-suite metadata, targeted metadata, safe passthrough of spaces/metacharacters, Playwright `--reporter` forwarding after `--`, command-label sanitization, and capability/verdict mapping.
- Add assertions that fake npm receives `run e2e` and `run e2e -- <args>` through argv arrays.
- Add negative tests proving JSON/evidence redacts credential URLs, token-like strings, query strings, and outside-repo absolute paths.

## Task T2: Harden Playwright runtime ownership, ports, fixture isolation, and cleanup

- **Status:** Pending
- **Complexity:** L
- **Dependencies:** T1
- **Related ADRs:** ADR-0004, ADR-0006
- **Related Core-Components:** CORE-COMPONENT-0009 (Decisions #268-#271), CORE-COMPONENT-0006 (Decision #273)

### Description
Make harness-managed E2E runs safe and deterministic. Expected files include `harness`, `playwright.config.ts`, `src/harness/harness-cli.test.ts`, and E2E fixture utilities/spec updates under `e2e/`.

`./harness e2e` should allocate a web port from `42000-42999` and a terminal port from `43000-43999`, create per-run scratch state under `.harness/run/e2e-<run-id>/`, set `DEVDECK_PROJECTS_DIR`, `DEVDECK_DATA_DIR`, `DEVDECK_TOKEN`, `DEVDECK_E2E_WEB_HOST`, `DEVDECK_E2E_WEB_PORT`, `DEVDECK_E2E_TERMINAL_HOST`, and `DEVDECK_E2E_TERMINAL_PORT`, and clean up only owned state. `playwright.config.ts` should bind to `127.0.0.1`, use `baseURL` with `127.0.0.1`, and set `reuseExistingServer: false`.

### Acceptance Criteria
- E2E web and terminal servers bind to loopback only for harness runs.
- E2E auto ports are selected from the required ranges and do not overlap smoke ports.
- Fixed-port or auto-port conflicts never kill or attach to unrelated listeners.
- `playwright.config.ts` does not use `0.0.0.0` for harness-managed Next dev and does not reuse existing servers.
- Mutable E2E data is copied or generated into `.harness/run/`; checked-in `e2e/fixtures/` remains unchanged after `./harness e2e`.
- Cleanup traps cover pass, fail, timeout, interrupt, and degraded paths for owned processes, locks, and scratch data.
- E2E metadata reports selected ports, fixture run ID, duration, and safe artifact paths only.

### Test Coverage
- Add harness Vitest tests for port allocation, conflict/degraded behavior, no unowned process termination, concurrent run distinct ports, cleanup on failure/timeout/interrupt, and scratch fixture cleanup.
- Add tests or static assertions proving `playwright.config.ts` uses loopback host and `reuseExistingServer: false`.
- Add a fixture mutation regression proving checked-in `e2e/fixtures/` is unchanged after a harness-managed run.

## Task T3: Add E2E to `verify` and CI browser provisioning

- **Status:** Pending
- **Complexity:** M
- **Dependencies:** T1, T2
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0006
- **Related Core-Components:** CORE-COMPONENT-0009 (Decisions #264, #267, #272), CORE-COMPONENT-0006 (Decision #273)

### Description
Make the browser gate part of the canonical repository verification path and CI setup. Expected files include `harness`, `.harness/contract.yml`, `src/harness/harness-cli.test.ts`, and `.github/workflows/ci.yml`.

`./harness verify` must run `lint → format_check → build → test → smoke → e2e`, continue after earlier failures, aggregate the highest-severity verdict, and write sanitized evidence containing both smoke and E2E metadata. CI should install Playwright Chromium/browser dependencies after `npm ci` and before `./harness verify`.

### Acceptance Criteria
- `./harness verify --json` reports steps in exactly `lint`, `format_check`, `build`, `test`, `smoke`, `e2e` order.
- Verify continues to run E2E even when earlier lint/build/test/smoke steps fail unless a missing prerequisite makes the E2E state `unknown`.
- Verify evidence includes only sanitized E2E metadata and safe repo-relative artifact paths.
- `.harness/contract.yml` declares the `e2e` verb, E2E metadata policy, E2E runtime policy, and verify sequence.
- `.github/workflows/ci.yml` provisions Playwright Chromium/browser dependencies before running `./harness verify`.
- CI keeps `./harness verify` as the single verification source of truth; it does not mirror individual lint/test/e2e commands.

### Test Coverage
- Add harness Vitest tests for verify ordering, continue-on-failure aggregation, E2E metadata in JSON/evidence, and no raw logs/secrets in evidence.
- Add a static CI workflow test or repository assertion that the Playwright install step precedes `./harness verify`.
- Run `./harness test -- src/harness/harness-cli.test.ts` during implementation.

## Task T4: Expand and repair Playwright browser coverage

- **Status:** Pending
- **Complexity:** XL
- **Dependencies:** T2, T3
- **Related ADRs:** ADR-0003, ADR-0004, ADR-0006, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0006 (Decisions #274-#275), CORE-COMPONENT-0007, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Extend the browser suite to prove representative DevDeck workflows before E2E blocks `verify`. Expected files include existing specs in `e2e/`, new focused specs as needed, fixture seed files, and fixture helper utilities.

Coverage should include authentication and invalid-token denial, project list loading/empty state, add/edit/remove dialogs, opening projects, default terminal connected/disconnected/startup states, file-tree lazy loading and `.git` exclusion, file preview states for text/Markdown/binary/large/permission-denied paths, edit/save/conflict behavior, layout toggles, and accessibility-oriented selectors. Repair `e2e/file-tree-lazy.spec.ts` to align with the `.git` filtering contract.

### Acceptance Criteria
- E2E specs read fixture paths from harness/Playwright env and do not hard-code mutable fixture roots.
- Project registry tests cover non-empty list, empty state, add, edit/update, remove/hide, duplicate/path validation, and opening a project.
- Auth tests cover valid token redirect/cookie behavior and invalid/missing token denial without leaking token values.
- Terminal tests preserve current coverage and add at least one startup failure or disconnect/degraded visible-state assertion.
- File-tree tests assert root direct-child lazy loading, `.git` exclusion, child loading, retry/error states where practical, and no stale expectation that `.git` is visible.
- File-viewer tests cover text/Markdown preview, binary/large file states, edit/save success, conflict or permission-denied save failure, and explorer refresh after save.
- Layout/accessibility tests use role/label/stable `data-testid` selectors and protect panel toggle visibility/containment.

### Test Coverage
- Add/repair Playwright specs so targeted commands such as `./harness e2e -- e2e/terminal.spec.ts --project=chromium` and `./harness e2e -- e2e/file-tree-lazy.spec.ts --project=chromium` pass.
- Ensure the full `./harness e2e --json` suite passes locally after browser dependencies are installed.
- Keep existing Vitest coverage intact with `./harness test -- <changed unit test files>` where helper utilities are added.

## Task T5: Align harness, user, and agent documentation

- **Status:** Pending
- **Complexity:** M
- **Dependencies:** T1, T2, T3, T4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0009 (Decisions #263-#275)

### Description
Document the new command surface and verification gate for humans and agents. Expected files include `.harness/README.md`, `.harness/contract.yml`, `LLM.txt`, `AGENTS.md`, `README.md`, `docs/README.md`, and any adjacent contributor documentation that describes verification.

Docs must explain `./harness e2e`, safe passthrough examples, smoke versus E2E distinction, verify ordering, CI browser setup, fixture isolation, cleanup policy, evidence policy, and when direct Playwright diagnostics are allowed.

### Acceptance Criteria
- `.harness/README.md` documents `e2e`, targeted Playwright passthrough, JSON metadata, smoke/E2E distinction, fixture isolation, cleanup, and evidence redaction.
- `.harness/contract.yml` matches implemented commands and verify sequence.
- `LLM.txt` and `AGENTS.md` tell agents to prefer `./harness e2e` for browser regressions and still answer/record friction for bypasses.
- `README.md` and `docs/README.md` list Playwright browser E2E as part of verification and include `./harness verify` as lint + format + build + Vitest + smoke + E2E.
- Documentation never implies `./harness smoke` proves browser workflows.

### Test Coverage
- Add/update documentation consistency tests if the repository has doc-contract checks; otherwise include doc assertions in harness CLI tests where practical.
- Run `./harness lint` and `./harness test -- src/harness/harness-cli.test.ts` after documentation/contract changes.

## Task T6: Run final browser-backed verification and evidence review

- **Status:** Pending
- **Complexity:** M
- **Dependencies:** T1, T2, T3, T4, T5
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0006, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0007, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Validate the final implementation through the harness and inspect evidence for policy compliance. This task is complete only after the browser-backed gate runs through the same surface CI will use.

### Acceptance Criteria
- `./harness help` shows the final command surface.
- `./harness e2e --json` passes and produces sanitized metadata.
- `./harness verify --json` passes with `lint`, `format_check`, `build`, `test`, `smoke`, and `e2e` steps.
- Generated verify evidence includes E2E metadata but no raw logs, tokens, cookies, query strings, env vars, response bodies, screenshots/traces/videos inline, or external absolute paths.
- `.harness/run/` contains no stale owned E2E process locks or scratch directories after successful completion.
- Any raw command bypass used for diagnosis is recorded with `./harness friction add`.

### Test Coverage
- Execute `./harness e2e --json`.
- Execute `./harness verify --json`.
- Inspect the latest `.harness/evidence/verify-*.json` for sanitized E2E and smoke metadata.
- Optionally run targeted diagnostics through `./harness e2e -- <spec>` and `./harness test -- <test-file>` before the full gate.

