# Issue #105 Implementation Notes — Browser E2E Verification Gate

## Summary

Implemented all planned tasks T1–T6:

- Added first-class `./harness e2e [--json] [-- <playwright args...>]` backed by `npm run e2e`.
- Added harness-owned E2E loopback port allocation, fixed-port conflict handling, scratch fixture setup under `.harness/run/`, cleanup, sanitized JSON metadata, and verify integration.
- Updated `./harness verify` sequence to `lint → format_check → build → test → smoke → e2e`.
- Updated Playwright config to consume harness env, bind loopback hosts, disable server reuse, and keep artifacts under safe repo-relative paths.
- Expanded Playwright coverage for auth, project registry, file tree, file viewer/edit/save/conflict, terminal, and layout/accessibility-oriented controls.
- Updated CI to run non-browser gates only; Playwright/browser E2E remains local-only.
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
- `./harness format_check` — pass.
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
- `./harness format_check` — pass after the blocker fix.

## Acceptance Schema Blocker Fix

- Updated `./harness e2e --json` and verify E2E step metadata to include the canonical `metadata.e2e` object.
- Added `metadata.e2e.testCounts` with nested `passed`, `failed`, `skipped`, `timedOut`, and `interrupted` counts parsed from Playwright's JSON reporter output without embedding raw report content.
- Preserved selected top-level E2E metadata fields for compatibility while documenting `metadata.e2e` as the canonical shape.
- Updated harness Vitest coverage, `.harness/contract.yml`, `.harness/README.md`, and CORE-COMPONENT-0009 to match the implemented metadata shape.
- `./harness test -- src/harness/harness-cli.test.ts` — pass, 43 tests.
- `./harness e2e --json` — pass with `metadata.e2e.testCounts: { passed: 15, failed: 0, skipped: 0, timedOut: 0, interrupted: 0 }`.
- `./harness verify --json` — pass; verify evidence includes the same canonical `metadata.e2e.testCounts` shape.

## CI Browser E2E Removal Fix

- Removed Playwright browser installation and browser E2E from PR CI because GitHub-hosted runners could not provision Chromium reliably for this repository.
- `.github/workflows/ci.yml` now runs `./harness lint`, `./harness format_check`, `./harness build`, `./harness test`, and `./harness smoke` only.
- Browser E2E remains local-only through `./harness e2e` and `./harness verify`.
- Updated `.harness/contract.yml`, `.harness/README.md`, CORE-COMPONENT-0009, and DECISION-LOG Decision #277 to document the CI/local verification split.

## Harness Format Check Fix

- Added first-class `./harness format_check [--json]`, backed by `npm run format:check`.
- Updated PR CI to use `./harness format_check` instead of raw `npm run format:check`.
- Updated `.harness/contract.yml`, `.harness/README.md`, CORE-COMPONENT-0009, and DECISION-LOG Decision #278 so the command surface and CI contract stay aligned.

## Known Limitations

- The harness writes sanitized evidence but does not yet provide a built-in evidence-policy scanner; evidence policy was manually inspected.

## Friction Answer

What did the agent have to infer that the harness should have proved?

The harness previously lacked a standalone `format_check` verb, so raw Prettier checks were required during earlier implementation passes; that gap is now closed by `./harness format_check`. The harness still lacks a built-in evidence-policy scanner, so evidence inspection remains manual.
