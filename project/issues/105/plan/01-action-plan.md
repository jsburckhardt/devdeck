# Action Plan: Browser E2E Verification Gate

## Feature
- **ID:** 105
- **Research Brief:** project/issues/105/research/00-research.md

## ADRs Created
- None. The plan keeps the existing architecture decisions and implements the browser gate as amendments to global core-components.

## Core-Components Created
- None created.
- Updated `CORE-COMPONENT-0009: Engineering Harness` with the accepted browser E2E harness contract.
- Updated `CORE-COMPONENT-0006: Development Standards` to make Playwright browser E2E part of required development standards.
- Updated `project/architecture/ADR/DECISION-LOG.md` with Decisions #263-#275.

## Accepted Plan Decisions
- Use `./harness e2e [--json] [-- <playwright args...>]` as the first-class browser gate, backed by `npm run e2e` / `npm run e2e -- <args...>` (Decision #263).
- Run `./harness verify` in this order: `lint → format_check → build → test → smoke → e2e`, preserving continue-on-failure aggregation and evidence writing (Decision #264).
- Keep `./harness smoke` as a fast built-app root HTTP readiness probe only; it must not be represented as browser/user-flow coverage (Decision #265).
- Forward all Playwright passthrough arguments through arrays after `--`; do not use `eval`, string-built commands, or raw interpolation (Decision #266).
- Sanitize E2E JSON/evidence; allowed metadata includes targeting state, sanitized targets, Playwright projects, test counts, selected loopback ports, duration, fixture run ID, and safe repo-relative artifact paths (Decision #267).
- Allocate E2E loopback ports from harness-owned ranges: web `42000-42999`, terminal `43000-43999`, with bounded paired attempts and no overlap with smoke ports (Decision #268).
- Isolate E2E fixture state in per-invocation `.harness/run/` scratch directories and treat `e2e/fixtures/` as immutable seeds (Decision #269).
- Clean up only harness-owned E2E processes, locks, and scratch data on success, failure, timeout, interrupt, and degraded paths (Decision #270).
- Set Playwright server reuse to false for harness runs so occupied ports never attach to unrelated listeners (Decision #271).
- Provision Playwright Chromium/browser dependencies in CI before `./harness verify`; keep `./harness verify` as the CI source of truth (Decision #272).
- Adopt Playwright as DevDeck's browser E2E runner and require representative browser-flow coverage with accessibility-oriented selectors (Decisions #273-#275).

## Implementation Guidance

### Expected command and evidence shape

`./harness e2e --json` should emit a single harness JSON result with a sanitized command label:

```json
{
  "verb": "e2e",
  "verdict": "pass",
  "command": "npm run e2e",
  "steps": [
    {
      "name": "e2e",
      "verdict": "pass",
      "exitCode": 0,
      "durationMs": 12345,
      "metadata": {
        "targeted": false,
        "targets": [],
        "targetCount": 0,
        "truncated": false,
        "playwrightProjects": ["chromium"],
        "testCount": 12,
        "passed": 12,
        "failed": 0,
        "skipped": 0,
        "webPort": 42000,
        "terminalPort": 43000,
        "fixtureRunId": "e2e-<timestamp>-<pid>",
        "artifactPaths": ["test-results/..."]
      }
    }
  ],
  "metadata": { "...": "same sanitized e2e metadata" },
  "evidence": null,
  "message": "E2E pass",
  "timestamp": "ISO-8601"
}
```

Targeted runs should use `command: "npm run e2e -- <N target(s)>"`, sanitized target labels, and unchanged forwarded arguments. Evidence must not include raw stdout/stderr, tokens, cookies, query strings, environment variables, browser console logs, response bodies, screenshots, traces, videos, or absolute paths outside the repository.

### Runtime and fixture strategy

- `./harness e2e` owns port selection, fixture scratch setup, environment variables, and cleanup.
- `playwright.config.ts` should consume harness-selected env vars, bind both servers to `127.0.0.1`, use `baseURL` on `127.0.0.1`, set `reuseExistingServer: false`, and avoid fixed default listeners during harness runs.
- Mutable fixture state should live under `.harness/run/e2e-<run-id>/` with copied/synthesized `projects/` and `.devdeck-data/`; E2E specs should read fixture roots from env instead of hard-coding `e2e/fixtures/projects`.
- Existing `e2e/file-tree-lazy.spec.ts` must be reconciled with Decision #73: `.git` is filtered from file-tree API responses and should not be expected as a visible root node.

## Implementation Tasks
1. **T1 — Add first-class `./harness e2e` verb and package script.**
2. **T2 — Harden Playwright runtime ownership, ports, fixture isolation, and cleanup.**
3. **T3 — Add E2E to `verify` and CI browser provisioning.**
4. **T4 — Expand and repair Playwright browser coverage.**
5. **T5 — Align harness/user/agent documentation.**
6. **T6 — Run final browser-backed verification and evidence review.**

