# Research Brief: First-Class Harness Smoke and Targeted Test Passthrough

## GitHub Issue
- **Issue:** #90
- **Title:** feat(harness): add first-class smoke and targeted test passthrough

## Scope Classification
- **Scope Type:** core_component

## Problem Statement

DevDeck's repo-local Engineering Harness is the preferred operating surface, but two recurring workflows still force agents and contributors to infer or bypass commands:

1. **Smoke verification is embedded inside `./harness verify`** with a fixed `9999` port, inline process lifecycle logic, limited readiness polling, and no standalone `smoke` verb. The friction log shows repeated degraded verification runs, stale `next-server` listeners, and manual port/PID cleanup caused by this behavior.
2. **Targeted Vitest runs are not supported by `./harness test`**. The current harness always runs the full suite and drops target arguments, so focused regression checks require direct `npm run test -- ...` usage.

Issue #90 asks to make these behaviors first-class harness contracts:

- add `./harness smoke [--port auto|PORT] [--json]` with auto-port default, fixed-port validation, loopback-only binding, bounded readiness polling, sanitized JSON metadata, deterministic cleanup, no port-based killing, and explicit `pass|fail|degraded|unknown` verdict mapping;
- replace `verify`'s inline smoke command with the shared smoke implementation while preserving build-before-smoke sequencing, continue-on-failure, evidence, and verdict aggregation;
- add target passthrough to `./harness test`, preserving harness `--json` before a `--` delimiter and forwarding all args after `--` verbatim to Vitest;
- update harness help/orient, `.harness/contract.yml`, `.harness/README.md`, `LLM.txt`, `CORE-COMPONENT-0009`, and `DECISION-LOG`.

This is a core-component contract change because it changes the cross-cutting Engineering Harness interface and agent-discoverable verification behavior.

## Existing Context

### Research inputs inspected

- Fetched Issue #90 with `gh issue view 90 --json title,body,labels,assignees,milestone`.
- Ran the preferred harness entrypoints:
  - `./harness orient` reported current command mapping without a `smoke` verb.
  - `./harness doctor` passed; prerequisites and `node_modules` are present.
- Read required harness and instruction files: `AGENTS.md`, `LLM.txt`, `harness`, `.harness/README.md`, `.harness/contract.yml`, `.harness/friction.jsonl`, `package.json`, `justfile`, and `.gitignore`.
- Inspected architecture docs: all ADRs, all core-components, and `project/architecture/ADR/DECISION-LOG.md`.
- Inspected project documentation inventory under `docs/` and `project/` (`225` Markdown files total: docs, architecture, issue research/plan/implementation docs, and issue index).
- Inspected relevant application source and tests, including `src/server/start-dev.mts`, `src/server/start-dev.test.ts`, `src/middleware.ts`, `src/lib/auth.ts`, `src/app/page.tsx`, `src/app/layout.tsx`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, and related test inventory.

### Current harness behavior

Relevant files:

| File | Current behavior relevant to #90 |
| --- | --- |
| `harness` | Bash CLI v1.0.0. Supports `help`, `orient`, `doctor`, `lint`, `test`, `build`, `boot`, `verify`, `status`, `clean`, and `friction`; no standalone `smoke`. |
| `.harness/contract.yml` | Defines `verify` steps as lint → format_check → build → test → smoke, but smoke command is documented as `npx next start --port 9999 (poll then kill)`. |
| `.harness/README.md` | Documents current verbs and evidence policy; no smoke examples or targeted test passthrough. |
| `.harness/friction.jsonl` | Contains repeated entries for fixed port `9999`, stale smoke servers, direct PID cleanup, and direct targeted Vitest runs. |
| `.gitignore` | Ignores `.harness/evidence/` only; `.harness/run/` is not ignored today. |
| `package.json` | `start` is `next start`; `test` is `vitest run`; these are the backing commands the harness should wrap. |
| `vitest.config.ts` | Vitest only includes `src/**/*.test.{ts,tsx}`; harness tests should live under `src/` or require an explicit config update. |

Important implementation observations:

- Global flag parsing currently removes `--json` anywhere in the argument list before verb dispatch. That conflicts with the required `./harness test -- --json` behavior, where Vitest's `--json` must be forwarded instead of enabling harness JSON mode.
- `cmd_test()` ignores all arguments and delegates to `_run_wrapped "test" "npm run test" ...`; target arguments are currently dropped.
- `_run_wrapped()` invokes backing commands through `eval "$command"`. Target passthrough should avoid `eval` and use array-safe command execution.
- `cmd_verify()` already continues through lint, format_check, build, test, and smoke even when earlier steps fail.
- `cmd_verify()` inline smoke currently:
  - checks fixed port `9999` with `ss`/`lsof`;
  - runs `npx next start --port 9999`;
  - polls `http://localhost:9999/` with an 8-iteration / 2-second loop;
  - accepts only `200`, `307`, and `302`;
  - kills only the recorded child PID and can still leave `next-server` behind;
  - emits no smoke metadata in evidence.
- `./harness orient --json` currently emits `surfaces.harness_contract.verify_steps`, but not the Issue #90-required `verbs` array or `commands.smoke` / `commands.test` discovery fields.
- `./harness help` does not list `smoke` or test target passthrough.
- `./harness status --json` currently reports contract validity and friction count, but no smoke/run metadata.

### Application/runtime context for smoke

- `package.json` exposes `npm run start` as `next start`; Issue #90 should keep using the existing npm script/project command surface.
- `src/server/start-dev.mts` is the development wrapper and starts `next dev` plus the terminal server. It is not the production smoke path.
- ADR-0006 says production `next start` remains env-driven; this matters because smoke should not invent a separate config loader.
- `src/middleware.ts` allows unauthenticated HTTP when `DEVDECK_TOKEN` is not set. If `DEVDECK_TOKEN` is set, unauthenticated `/` returns a `401` page unless a valid token query/cookie is present. Issue #90 requires avoiding credentials/query strings in smoke metadata and treats `4xx` as `fail`, so Plan should explicitly account for token-bearing environments without putting tokens in smoke URLs.
- `next.config.ts` rewrites `/api/terminal` to the terminal server; smoke only needs the root HTTP response and should not start the terminal server.

### Architecture and documentation context

Relevant existing ADRs:

- `ADR-0002: Next.js + xterm.js + node-pty Tech Stack` — defines npm, Vitest, Next.js, TypeScript, and just as the wrapped project tooling.
- `ADR-0004: Token-Based Authentication` and `ADR-0006: Config File-Driven Configuration System` — relevant to production env behavior and avoiding token leakage during smoke.

Relevant existing core-components:

- `CORE-COMPONENT-0009: Engineering Harness` — owns `./harness` as the preferred operating surface, verdict mapping, evidence policy, friction logging, and wrapping existing project commands.
- `CORE-COMPONENT-0006: Development Standards` — references `./harness verify` as the standards/CI verification path.

`DECISION-LOG.md` already records Engineering Harness decisions:

- #146: require `./harness` as preferred operating surface.
- #147: require `./harness verify` as primary verification mechanism.
- #148: allow direct commands only when harness lacks a verb, is degraded, or raw diagnostics are needed.
- #149: record harness bypass as friction.
- #150: require exactly one verdict with `pass=0`, `fail=1`, `degraded=2`, `unknown=3`.
- #151: prohibit secrets, tokens, and raw logs in harness evidence.
- #152: require harness to wrap existing project commands.
- #165/#166: use `./harness verify` and `.harness/contract.yml` as verification source of truth and run it in CI.

Issue #90 should add new or amended decision-log records for first-class smoke, smoke lifecycle/port allocation rules, verify's shared smoke implementation, and targeted test passthrough.

### Non-goals for Plan/Implement

- Do not add browser UI, application API endpoints, or terminal-server behavior.
- Do not replace npm, Vitest, Next.js, or the justfile.
- Do not make standalone `./harness smoke` run `build`; `verify` remains responsible for build-before-smoke sequencing.
- Do not kill processes by port or manage processes not started by the current smoke invocation.
- Do not persist raw stdout/stderr, response bodies, redirect locations, tokens, credential-bearing URLs, query strings, env vars, or secrets in JSON/evidence.
- Do not address deferred friction clusters such as contract inference or hidden diagnostics, except where documentation must describe the two requested workflows.

### Recommended Plan inputs and test considerations

Plan should include tasks for:

1. **Argument parsing redesign**
   - Preserve harness-owned `--json` before a verb-level `--` delimiter.
   - For `test`, forward every argument after `--` verbatim to Vitest, including Vitest's own `--json`.
   - For `smoke`, reject unknown flags and invalid/duplicate/missing `--port` values with a `fail` verdict and usage.

2. **Shared smoke implementation**
   - Add a reusable smoke helper used by both `cmd_smoke` and `cmd_verify`.
   - Default to `--port auto` and use the documented `41000-41999` candidate range with at most 50 attempts.
   - Bind `next start` to `127.0.0.1`.
   - Poll `http://127.0.0.1:<selectedPort>/` exactly once per second up to 60 attempts and do not follow redirects.
   - Accept `200`, `301`, `302`, `303`, `307`, and `308`.
   - Map fixed-port conflicts to `degraded`, auto `EADDRINUSE` races to retry/degraded after bounded attempts, command/probe absence to `unknown`, and missing build/start/readiness/HTTP failure paths to `fail`.
   - Use deterministic child process cleanup with ownership metadata and traps for `EXIT`, `INT`, and `TERM`.
   - Never use port-based killing.

3. **Safe runtime metadata**
   - Introduce `.harness/run/` only if needed and add it to `.gitignore`.
   - Keep runtime lock/pid metadata scoped to this checkout/worktree.
   - Ensure evidence/JSON metadata is sanitized and excludes raw paths/logs/tokens/query strings/redirect locations/response bodies.

4. **Targeted test passthrough**
   - Use command arrays, not `eval`, to run `npm run test -- <targets...>`.
   - Emit count-based command summaries and sanitized target metadata.
   - Convert repo-absolute paths to repo-relative, redact absolute paths outside the repo, remove credential/query/control characters, cap each target at 200 characters, and set `truncated` when needed.

5. **Contract/discovery/documentation updates**
   - Update `./harness help`, `./harness orient`, `./harness orient --json`, `.harness/contract.yml`, `.harness/README.md`, `LLM.txt`, `CORE-COMPONENT-0009`, and `DECISION-LOG.md`.
   - Consider whether `AGENTS.md`'s `DEVDECK_HARNESS_GUIDANCE` should mention the new `smoke` and targeted test workflows; Issue #90 explicitly requires `LLM.txt`, but AGENTS is also an agent-facing surface.

6. **Automated coverage**
   - Add tests for parser behavior, port validation, JSON shape, target sanitization, verdict aggregation, fixed-port conflict without killing, auto-port retry/degrade, stale lock handling, child cleanup, interruption/timeout cleanup, and no raw evidence leakage.
   - Add smoke integration coverage after a successful build, plus failure-path coverage using controlled/fake backing commands where possible to avoid slow/flaky 60-second waits.
   - Add concurrent same-checkout and sibling-worktree smoke coverage, or document any manual concurrency checks if full automation is impractical.
   - Add `NO_COLOR=1` human-output checks and JSON validity checks for pass/fail/degraded/unknown paths.

## Proposed ADRs

**ADRs required:** No new ADR is expected from the research findings.

Rationale: the requested work stays within the existing Engineering Harness core-component and existing tech-stack/auth/config ADR boundaries. It changes the harness contract and its lifecycle rules, but does not appear to introduce a new application architecture decision.

No ADR title is proposed as required work. If Plan discovers that smoke port locking/process ownership creates a broader architecture decision outside `CORE-COMPONENT-0009`, a contingency ADR title could be proposed then, such as **"ADR-0008: Engineering Harness Smoke Lifecycle and Port Allocation"**. Research does not recommend creating that ADR by default.

## Proposed Core-Components

**Core-components required:** Yes — update the existing Engineering Harness core-component and the Decision Log.

Proposed core-component title/update:

- **CORE-COMPONENT-0009: Engineering Harness — amendment for first-class smoke and targeted test passthrough**

Expected Plan-stage documentation updates:

- Amend `CORE-COMPONENT-0009` to define:
  - `./harness smoke [--port auto|PORT] [--json]`;
  - smoke port selection, loopback bind, readiness polling, lifecycle cleanup, no port-based killing, evidence/metadata sanitization, and verdict mapping;
  - `./harness verify` using the shared smoke implementation after build while preserving continue-on-failure and aggregation;
  - `./harness test` target passthrough and `--` delimiter semantics;
  - JSON/evidence content policy for smoke metadata and test targets.
- Update `project/architecture/ADR/DECISION-LOG.md` with concrete decision records for:
  - first-class smoke as a harness verb;
  - smoke auto/fixed port lifecycle and cleanup safety;
  - shared smoke implementation in `verify`;
  - targeted Vitest passthrough for `./harness test`.

No new core-component file is expected; this is an amendment to the existing `CORE-COMPONENT-0009`.

## Risks and Open Questions

### Risks and pitfalls

- **Parser ambiguity:** Current global `--json` parsing cannot distinguish harness JSON from Vitest JSON after `--`.
- **Command injection/quoting:** Current `eval` command execution is incompatible with safe target passthrough.
- **Smoke cleanup:** Bash process groups, traps, `timeout`, and child process cleanup can interact in subtle ways; tests must prove no harness-started `next-server` remains.
- **Port concurrency:** Auto-port locks must be atomic and scoped per checkout/worktree; stale metadata cleanup must not kill unrelated processes.
- **Tool availability:** `curl` is optional in `doctor`; missing probe tooling should map to `unknown` unless implementation uses a built-in Node probe.
- **Auth-sensitive smoke:** If `DEVDECK_TOKEN` is set, unauthenticated `/` may return `401`. Issue #90 says `4xx` is `fail` and forbids credential-bearing smoke URLs/metadata, so Plan should explicitly define the expected env handling.
- **Evidence leakage:** Next.js output can contain paths and environment-derived context. Raw child output must not be persisted; JSON metadata must stay sanitized.
- **CI impact:** CI runs `./harness verify`, so flaky smoke lifecycle or port behavior will block PRs.
- **Test flakiness:** Real readiness polling/concurrency tests can be slow; prefer deterministic fake backing commands for unit paths and a bounded built-app integration test for success.
- **Documentation drift:** `harness`, `.harness/contract.yml`, `.harness/README.md`, `LLM.txt`, `CORE-COMPONENT-0009`, and `DECISION-LOG.md` must change together.

### Open questions for Plan

1. Should smoke use `curl` or a Node-based HTTP probe to avoid depending on optional curl availability?
2. How should smoke behave in an environment where `DEVDECK_TOKEN` is set and root returns `401` without a token, given the no-token/no-query metadata requirement?
3. Should harness tests be added as Vitest tests under `src/` that spawn the root `harness`, or should Plan introduce a dedicated shell-test approach?
4. Is `.harness/run/` the right runtime metadata location, and what exact ownership fields are necessary to prove safe cleanup without leaking evidence?
5. Should `AGENTS.md` be updated alongside `LLM.txt` to expose the new smoke/test guidance to future agents?
