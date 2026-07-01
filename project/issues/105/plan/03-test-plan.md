# Test Plan: Browser E2E Verification Gate

## Test TP1: Harness E2E parser and safe passthrough

- **Type:** Unit/Vitest
- **Task:** T1
- **Priority:** Critical

### Setup
- Use `src/harness/harness-cli.test.ts` with the existing fake npm harness test utilities.

### Steps
- Run `./harness test -- src/harness/harness-cli.test.ts`.
- Exercise `./harness e2e --json`, `./harness e2e --json -- e2e/terminal.spec.ts --project=chromium`, and arguments containing spaces/metacharacters.

### Expected Result
- The fake npm process receives argv arrays for `run e2e` and `run e2e -- <args>`.
- Harness JSON uses sanitized command labels and never exposes raw shell-expanded arguments.

## Test TP2: E2E metadata and evidence sanitization

- **Type:** Unit/Vitest
- **Task:** T1, T3
- **Priority:** Critical

### Setup
- Configure fake Playwright/npm output or fake reporter artifacts containing token-like strings, query strings, credential URLs, outside-repo absolute paths, and raw log markers.

### Steps
- Run harness E2E and verify JSON paths through tests.
- Parse generated JSON/evidence.

### Expected Result
- Metadata contains only allowed targeting, counts, ports, duration, fixture run ID, and safe artifact paths.
- Evidence excludes raw stdout/stderr, tokens, cookies, query strings, env vars, response bodies, screenshots/traces/videos inline, and external absolute paths.

## Test TP3: Verify ordering and aggregation includes E2E

- **Type:** Unit/Vitest
- **Task:** T3
- **Priority:** Critical

### Setup
- Use fake npm exit controls for lint, format, build, test, smoke, and e2e.

### Steps
- Run `./harness verify --json` through tests with passing and failing earlier steps.
- Parse `json.steps` and evidence.

### Expected Result
- Steps are exactly `lint`, `format_check`, `build`, `test`, `smoke`, `e2e`.
- E2E still runs after earlier failures, and overall verdict reflects the highest-severity step.

## Test TP4: E2E port ownership, no reuse, and cleanup

- **Type:** Unit/Integration
- **Task:** T2
- **Priority:** Critical

### Setup
- Start test-owned listeners on candidate web/terminal ports.
- Use harness test helpers to simulate pass, failure, timeout, and interrupt paths.

### Steps
- Run `./harness e2e --json` with occupied fixed and auto candidates.
- Run concurrent E2E invocations.
- Inspect `.harness/run/` after each path.

### Expected Result
- Harness selects distinct available port pairs or returns `degraded` without killing unrelated listeners.
- No run attaches to an existing listener.
- Owned locks, child processes, and scratch data are cleaned up.

## Test TP5: Playwright config loopback and fixture env

- **Type:** Static/Unit
- **Task:** T2
- **Priority:** High

### Setup
- Read `playwright.config.ts` in a Vitest or static assertion.

### Steps
- Assert web and terminal hosts resolve to `127.0.0.1` for harness runs.
- Assert `reuseExistingServer: false`.
- Assert fixture directories and ports are read from harness-provided env vars.

### Expected Result
- Playwright config cannot bind to `0.0.0.0` or reuse unrelated fixed-port servers in harness-managed runs.

## Test TP6: CI provisions Playwright browsers before verify

- **Type:** Static/CI configuration
- **Task:** T3
- **Priority:** High

### Setup
- Read `.github/workflows/ci.yml`.

### Steps
- Verify the workflow runs dependency installation, then Playwright Chromium/browser setup, then `./harness verify`.

### Expected Result
- CI uses `./harness verify` as the only verification gate after provisioning Playwright browser dependencies.

## Test TP7: Auth and project registry browser flows

- **Type:** Playwright E2E
- **Task:** T4
- **Priority:** Critical

### Setup
- Use isolated harness fixture projects and data directory.

### Steps
- Run `./harness e2e -- e2e/<project-registry-spec>.ts --project=chromium`.
- Cover valid token redirect/cookie setup, missing/invalid token denial, project list non-empty state, empty state, add project, edit/update project, remove/hide project, duplicate/path validation, and opening a project.

### Expected Result
- Browser-visible states match the registry/auth contracts and no token value appears in test artifacts or harness evidence.

## Test TP8: Terminal browser flows

- **Type:** Playwright E2E
- **Task:** T4
- **Priority:** Critical

### Setup
- Use isolated fixture env and selected terminal/web ports.

### Steps
- Run `./harness e2e -- e2e/terminal.spec.ts --project=chromium`.
- Preserve existing command execution, keyboard helper, voice review, invalid auth, default cwd, and responsive font-size coverage.
- Add startup failure or disconnect/degraded visible-state coverage.

### Expected Result
- Terminal flows pass with accessible visible states and no horizontal overflow.

## Test TP9: File tree and file viewer browser flows

- **Type:** Playwright E2E
- **Task:** T4
- **Priority:** Critical

### Setup
- Seed isolated projects with text, Markdown, binary, large, and permission-denied or conflict fixtures.

### Steps
- Run targeted file-tree/file-viewer specs through `./harness e2e -- <spec> --project=chromium`.
- Verify lazy root loading, `.git` exclusion, child loading, text/Markdown preview, binary/large states, edit/save success, conflict or permission-denied save failure, and explorer refresh after save.

### Expected Result
- Browser flows prove file APIs and UI states without mutating checked-in fixtures.

## Test TP10: Layout and accessibility browser flows

- **Type:** Playwright E2E
- **Task:** T4
- **Priority:** High

### Setup
- Use existing layout fixture plus any added accessibility fixtures.

### Steps
- Run `./harness e2e -- e2e/workspace-layout.spec.ts --project=chromium` and additional accessibility specs.
- Use role/label/stable `data-testid` selectors to exercise panel toggles, close project controls, keyboard reachability, and visible status text.

### Expected Result
- Layout remains contained and accessible controls expose expected roles, labels, and pressed/disabled states.

## Test TP11: Full E2E harness gate

- **Type:** Harness/Playwright
- **Task:** T6
- **Priority:** Critical

### Setup
- Ensure Playwright browser dependencies are installed locally or in CI.

### Steps
- Run `./harness e2e --json`.
- Parse the JSON result and inspect any referenced artifacts.

### Expected Result
- The full browser suite passes with sanitized metadata, safe artifact paths, and no stale `.harness/run/` scratch state.

## Test TP12: Full repository verification gate

- **Type:** Harness/CI parity
- **Task:** T6
- **Priority:** Critical

### Setup
- Start from a clean working tree with dependencies and Playwright browser setup complete.

### Steps
- Run `./harness verify --json`.
- Inspect the latest `.harness/evidence/verify-*.json`.

### Expected Result
- Verification passes with `lint`, `format_check`, `build`, `test`, `smoke`, and `e2e` steps.
- Evidence contains sanitized smoke and E2E metadata only.

