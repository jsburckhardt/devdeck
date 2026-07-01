# Issue #105 Implementation Notes — Browser E2E Verification Gate

## Summary

Implemented all planned tasks T1–T6:

- Added first-class `./harness e2e [--json] [-- <playwright args...>]` backed by `npm run e2e`.
- Added harness-owned E2E loopback port allocation, fixed-port conflict handling, scratch fixture setup under `.harness/run/`, cleanup, sanitized JSON metadata, and verify integration.
- Updated `./harness verify` sequence to `lint → format_check → build → test → smoke → e2e`.
- Updated Playwright config to consume harness env, bind loopback hosts, disable server reuse, and keep artifacts under safe repo-relative paths.
- Expanded Playwright coverage for auth, project registry, file tree, file viewer/edit/save/conflict, terminal, and layout/accessibility-oriented controls.
- Updated CI to install Playwright Chromium dependencies before `./harness verify`.
- Updated harness/user/agent documentation and `.harness/contract.yml`.

## Files Changed

- `harness`
- `package.json`
- `playwright.config.ts`
- `src/harness/harness-cli.test.ts`
- `.github/workflows/ci.yml`
- `.harness/README.md`
- `.harness/contract.yml`
- `README.md`
- `docs/README.md`
- `AGENTS.md`
- `LLM.txt`
- `e2e/helpers.ts`
- `e2e/auth-projects.spec.ts`
- `e2e/file-viewer.spec.ts`
- `e2e/file-tree-lazy.spec.ts`
- `e2e/terminal.spec.ts`
- `e2e/workspace-layout.spec.ts`
- `e2e/fixtures/projects/immutable-seed/README.md`

## Verification Results

- `./harness test -- src/harness/harness-cli.test.ts` — pass, 43 tests.
- `./harness lint` — pass with pre-existing warnings only.
- `npm run format:check` — pass; used because there is no standalone `./harness format_check` verb.
- `./harness e2e -- e2e/file-tree-lazy.spec.ts --project=chromium` — pass.
- `./harness e2e -- e2e/terminal.spec.ts --project=chromium` — pass, 7 tests.
- `./harness e2e -- e2e/file-viewer.spec.ts --project=chromium` — pass.
- `./harness e2e --json` — pass; metadata included sanitized target state, loopback ports, fixture run ID, duration, and safe artifact path only.
- `./harness verify --json` — pass with steps `lint`, `format_check`, `build`, `test`, `smoke`, `e2e`.
- Latest verify evidence inspected: `.harness/evidence/verify-20260701T010528Z-1869597.json`; no raw logs, tokens, cookies, query strings, response bodies, inline screenshots/traces/videos, or outside-repo absolute paths observed.
- `.harness/run/` inspected after verification; no stale owned `e2e-*` or `smoke-*` locks/scratch directories remained.

## Verify-Stage Blocker Fix

- Fixed `e2e/terminal.spec.ts` terminal row assertion for the mobile keyboard helper flow. The helper now checks both row-preserving xterm text and a compact row join so narrow/mobile wrapping between marker characters does not fail the test while still proving the `Up` helper sends the expected escape sequence and the terminal stays connected.
- `./harness e2e -- e2e/terminal.spec.ts --project=chromium` — pass, 7 tests.
- `./harness e2e --json` — pass; metadata remained sanitized with loopback ports and safe artifact paths.
- `npm run format:check` — pass after the blocker fix; used because there is no standalone `./harness format_check` verb.

## Acceptance Schema Blocker Fix

- Updated `./harness e2e --json` and verify E2E step metadata to include the canonical `metadata.e2e` object.
- Added `metadata.e2e.testCounts` with nested `passed`, `failed`, `skipped`, `timedOut`, and `interrupted` counts parsed from Playwright's JSON reporter output without embedding raw report content.
- Preserved selected top-level E2E metadata fields for compatibility while documenting `metadata.e2e` as the canonical shape.
- Updated harness Vitest coverage, `.harness/contract.yml`, `.harness/README.md`, and CORE-COMPONENT-0009 to match the implemented metadata shape.
- `./harness test -- src/harness/harness-cli.test.ts` — pass, 43 tests.
- `./harness e2e --json` — pass with `metadata.e2e.testCounts: { passed: 15, failed: 0, skipped: 0, timedOut: 0, interrupted: 0 }`.
- `./harness verify --json` — pass; verify evidence includes the same canonical `metadata.e2e.testCounts` shape.

## CI Browser Provisioning Fix

- Fixed the PR CI workflow hang by bounding Playwright browser provisioning.
- `.github/workflows/ci.yml` now runs browser setup with `DEBIAN_FRONTEND=noninteractive`, a 10-minute step timeout, a 45-minute verify timeout, and a 60-minute job timeout.
- Updated `.harness/contract.yml`, `.harness/README.md`, CORE-COMPONENT-0009, and DECISION-LOG Decision #276 to document the noninteractive timeout-bounded CI browser setup contract.

## Known Limitations

- The harness still does not expose a standalone `format_check` verb, so formatting diagnostics required a raw command.
- The harness writes sanitized evidence but does not yet provide a built-in evidence-policy scanner; evidence policy was manually inspected.

## Friction Answer

What did the agent have to infer that the harness should have proved?

The harness lacks a standalone `format_check` verb and a built-in evidence-policy scanner, so raw Prettier checks and manual evidence inspection were required. Recorded with `./harness friction add`; blocker-fix follow-up friction entries were also recorded for raw format checks.
