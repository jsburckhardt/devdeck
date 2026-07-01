# Research Brief: Add Browser E2E Verification Gate

## GitHub Issue
- **Issue:** #105
- **Title:** feat(harness): add browser E2E verification gate

## Scope Classification
- **Scope Type:** core_component

## Problem Statement

DevDeck has a repo-local `./harness` that is the preferred command and verification surface, but the current harness contract proves only lint, formatting, build, Vitest, and root HTTP readiness. It does not prove browser-opened user flows through the existing Playwright suite.

Issue #105 asks the Plan stage to define first-class browser E2E support in the harness, make `./harness verify` and CI include that browser gate, keep `./harness smoke` as a fast built-app root HTTP readiness check, extend Playwright coverage for representative DevDeck workflows, and align all command discovery, architecture, documentation, and evidence surfaces.

This is a core-component scope because it changes the cross-cutting Engineering Harness contract, CI source-of-truth behavior, evidence policy, and agent/human command surface. Research does not make the architecture decision; it hands the Plan stage the required surfaces and risks.

## Existing Context

### Inputs inspected

- Fetched Issue #105 with `gh issue view 105 --json title,body,labels,assignees,milestone`.
- Ran harness preflight:
  - `./harness help` lists `help`, `orient`, `doctor`, `install`, `lint`, `test`, `build`, `smoke`, `boot`, `verify`, `status`, `clean`, and `friction`; no `e2e` verb exists.
  - `./harness orient` reports `verify` as `lint → format:check → build → test → smoke`.
  - `./harness doctor` passes local prerequisites.
- Read the documentation inventory under `docs/` and `project/` (240 Markdown files), all ADRs, all core-components, and `project/architecture/ADR/DECISION-LOG.md`.
- Inspected required harness/verification surfaces: `./harness`, `.harness/contract.yml`, `.harness/README.md`, `.harness/friction.jsonl`, `package.json`, `justfile`, `playwright.config.ts`, `e2e/`, `.github/workflows/ci.yml`, `AGENTS.md`, and `LLM.txt`.
- Inspected relevant source code: project list/add/remove flows, token middleware/auth, file APIs, file viewer/editor, workspace layout, terminal panel/server, and harness tests.

### Current harness and CI behavior

| Surface | Current finding |
| --- | --- |
| `./harness help` / `orient` | No `e2e` verb. `verify` is documented as lint, format check, build, Vitest, and smoke only. |
| `./harness verify` | Runs `lint → format_check → build → test → smoke`, continues on failure, writes sanitized evidence. |
| `./harness smoke` | Starts the built production Next app through `npm run start -- --hostname 127.0.0.1 --port <selectedPort>` and probes only `http://127.0.0.1:<port>/`. |
| `.harness/contract.yml` / `.harness/README.md` | Define standard verdicts, smoke metadata, targeted Vitest passthrough, evidence secrecy, and verify steps; no Playwright/E2E contract. |
| `src/harness/harness-cli.test.ts` | Existing Vitest coverage proves smoke/test/verify parser, metadata, cleanup, evidence, and discovery behavior. This is the likely place for E2E harness CLI tests. |
| `package.json` | Has `@playwright/test` as a dev dependency but no `"e2e": "playwright test"` script. |
| `.github/workflows/ci.yml` | Runs `npm ci` then `./harness verify`; no Playwright browser installation/setup step. |

### Current Playwright and browser-test behavior

- `playwright.config.ts` sets `testDir: "./e2e"`, headless mode, `baseURL` from `DEVDECK_E2E_WEB_PORT` defaulting to `8070`, and `DEVDECK_E2E_TERMINAL_PORT` defaulting to `3100`.
- The Playwright config starts two web servers:
  - `npm run terminal` on `E2E_TERMINAL_PORT`.
  - `npx next dev --turbopack --hostname 0.0.0.0 --port ${E2E_WEB_PORT}` on `E2E_WEB_PORT`.
- Both Playwright `webServer` entries use `reuseExistingServer: true`. That conflicts with Issue #105's desired safety model unless Plan changes or wraps it, because a fixed-port collision could silently attach to an unrelated server.
- Existing E2E specs:
  - `e2e/terminal.spec.ts` covers token-authenticated project opening, terminal connected state, command execution, no horizontal overflow, panel toggle containment, touch/tablet font size, mobile keyboard helper, mocked voice input review/send, unauthenticated access denial, and launch-cwd behavior.
  - `e2e/workspace-layout.spec.ts` covers project viewport geometry and terminal-fill layout regressions for Issues #69/#70.
  - `e2e/file-tree-lazy.spec.ts` covers lazy file-tree loading for a large fixture project.
- Current E2E fixture coverage is not broad enough for Issue #105 acceptance criteria. It does not yet cover the full project list/empty-state matrix, add/remove dialogs, file preview/edit/save permission-denied paths, large/binary preview states, startup timeout/disconnect states, or broader accessibility/keyboard reachability.
- Potential stale test risk: `e2e/file-tree-lazy.spec.ts` expects `.git` to appear in root file-tree responses, while `src/app/api/files/route.ts` currently filters `.git` via `EXCLUDED_NAMES = new Set([".git"])`. Plan should reconcile this before making E2E a required gate.

### Relevant application behavior for E2E coverage

- Auth:
  - `src/middleware.ts` accepts a valid `?token=` query, sets `devdeck_token`, and redirects to strip the token.
  - API routes return `401` with `AUTH_REQUIRED` when token auth is configured and missing.
  - `src/server/terminal-server.mts` validates token/cookie before PTY spawn and rejects unsupported project/worktree terminal context with close code `1008`.
- Project list and registry:
  - `src/app/page.tsx` renders project cards, empty state, Add Project, Edit Project, and Remove Project dialogs.
  - `src/app/api/projects/route.ts` handles list and add; `src/app/api/projects/[slug]/route.ts` handles update/delete.
  - Registry data lives under `DEVDECK_DATA_DIR`; Playwright currently points this at `e2e/fixtures/.devdeck-data`.
- Workspace:
  - `src/components/workspace-layout.tsx` owns Explorer/File Preview/Terminal toggles, file-tree sync status, and the visible Close Project action.
  - `src/components/file-tree.tsx` exposes role/label-based tree controls for directories/files.
  - `src/components/file-viewer.tsx` handles text/Markdown preview, DOMPurify sanitization, binary/large-file states, edit/save, dirty state, and conflicts.
  - `src/components/terminal-panel.tsx` provides terminal connected state, keyboard helper, voice review controls, and stable `data-testid` values used by existing E2E tests.

### Existing architecture and decisions to preserve

Relevant ADRs:

- `ADR-0002: Next.js + xterm.js + node-pty Tech Stack` — defines Next.js, TypeScript, npm, Vitest, xterm.js, node-pty, and justfile. Plan should decide whether formal Playwright-as-E2E-runner wording belongs here or in core-components only.
- `ADR-0004: Token-Based Authentication` — E2E must not leak token values, token-bearing URLs, cookies, or credential-bearing data in harness evidence.
- `ADR-0006: Config File-Driven Configuration System` — E2E fixtures should isolate `DEVDECK_DATA_DIR`, `DEVDECK_PROJECTS_DIR`, token, terminal port, and workspace root behavior.
- `ADR-0007: Filesystem Sync Transport Strategy` — file-tree E2E should respect SSE/degraded fallback semantics and path redaction.

Relevant core-components:

- `CORE-COMPONENT-0003: WebSocket Terminal Communication` — terminal E2E must preserve token validation, PTY cleanup, connected/disconnected states, and default host-terminal behavior.
- `CORE-COMPONENT-0005: Error Handling` — E2E should verify user-facing error/degraded states without hidden crashes.
- `CORE-COMPONENT-0006: Development Standards` — currently names Vitest/RTL and `./harness verify`; may need a standards amendment if Playwright becomes required verification.
- `CORE-COMPONENT-0007: Shell Layout` — E2E should protect panel toggle visibility, mounted terminal behavior, and layout containment.
- `CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State` — E2E should protect project tabs, file-tree sync, worktree-aware file APIs, and state preservation.
- `CORE-COMPONENT-0009: Engineering Harness` — owns the harness command contract, standard verdicts, evidence secrecy, friction, smoke/test/verify behavior, and CI source of truth.

Decision log entries especially relevant to #105:

- #146-#152: `./harness` as preferred surface, `verify` as primary mechanism, direct commands only for gaps/diagnostics, friction logging, standard verdicts, no secrets/raw logs in evidence, and wrapping existing project commands.
- #165-#166: `./harness verify` and `.harness/contract.yml` are the verification source of truth and CI runs `./harness verify`.
- #240-#245: first-class smoke, safe smoke ports/cleanup, smoke inside verify, targeted Vitest passthrough, and sanitized smoke/test evidence.
- Existing friction lines #36/#37 already state the current gap: harness does not prove browser E2E coverage and readiness currently means build + Vitest + HTTP smoke.

### Impacted surfaces for Plan

- `harness`: add `e2e` parser/dispatch, safe passthrough, verdict mapping, evidence metadata, verify integration, help/orient/orient-json/status behavior as needed.
- `src/harness/harness-cli.test.ts`: add CLI tests for E2E parser, JSON schema, safe args, evidence sanitization, verify ordering/aggregation, port conflict/cleanup/concurrency behavior.
- `package.json` / `package-lock.json`: add `"e2e": "playwright test"` unless Plan records a different backing command.
- `playwright.config.ts`: align host binding, `reuseExistingServer`, port env handling, timeout, reporter/artifact behavior, fixture env, and server ownership with the harness contract.
- `e2e/` and fixtures: expand coverage and isolate/reset mutable fixture data.
- `.github/workflows/ci.yml`: provision Playwright browser prerequisites before `./harness verify`, unless Plan moves that setup into `./harness install`.
- `.harness/contract.yml`, `.harness/README.md`, `LLM.txt`, and likely `AGENTS.md`: document the `e2e` verb, smoke/E2E difference, verify sequence, CI/browser setup, evidence policy, and passthrough examples.
- `project/architecture/core-components/CORE-COMPONENT-0009-engineering-harness.md` and `project/architecture/ADR/DECISION-LOG.md`: record the new harness contract and decisions.
- Potential documentation updates to `README.md`, `docs/README.md`, and/or `CORE-COMPONENT-0006` if Plan formalizes Playwright in development/testing standards.

### Acceptance criteria summary

Issue #105 acceptance criteria can be summarized as:

1. Add `./harness e2e [--json] [-- <playwright args...>]`, backed by `npm run e2e -- <args...>` using safe arrays.
2. Emit sanitized E2E JSON/evidence metadata: targeting state, sanitized targets, Playwright projects, test counts, selected ports, duration, and safe artifact paths.
3. Make `./harness verify` run `lint → format_check → build → test → smoke → e2e` and keep continue-on-failure aggregation.
4. Keep `./harness smoke` as the fast built-app root HTTP readiness check, explicitly distinct from browser E2E.
5. Define E2E port, host, fixture isolation/reset, cleanup, timeout, concurrency, and artifact behavior.
6. Update CI so `./harness verify` is the browser-backed gate, with documented Playwright/browser prerequisites.
7. Extend Playwright coverage for auth, project list, opening projects, terminal states, file tree, preview/edit/save, add/remove dialogs, layout toggles, invalid-token access, and accessibility-oriented selectors.
8. Update harness help/orient/contract/docs, `LLM.txt`, relevant agent guidance, `CORE-COMPONENT-0009`, and the decision log.

### Suggested verification approach for Plan/Implement

- Add fast Vitest coverage for harness E2E parser, passthrough safety, JSON/evidence sanitization, verdict mapping, verify sequencing, timeout/cleanup, port conflicts, and concurrent evidence writes.
- Add/repair Playwright specs in small targeted files so at least `./harness e2e -- e2e/terminal.spec.ts` works before running the full suite.
- Validate full browser gate with `./harness e2e --json`.
- Validate final repository gate with `./harness verify --json` and inspect generated evidence for sanitized E2E metadata and no forbidden data.
- Ensure CI runs the same `./harness verify` gate after bounded Playwright Chromium/browser dependency setup.

## Proposed ADRs

**ADRs required:** No new ADR is required by this research finding.

No required ADR title is proposed. The requested work can be handled as an amendment to existing core-components, especially `CORE-COMPONENT-0009`, plus decision-log records.

Plan should revisit this only if it chooses an architecture exception or broader tech-stack change, such as excluding E2E from `verify`/CI, keeping a non-loopback bind for E2E servers, moving browser installation into `./harness install`, or formally amending the tech-stack ADR to name Playwright as the required browser E2E runner.

## Proposed Core-Components

**Core-components required:** Yes.

Required core-component update:

- **CORE-COMPONENT-0009: Engineering Harness — Browser E2E Verification Gate Amendment**

The Plan stage should update `CORE-COMPONENT-0009` and `DECISION-LOG.md` for:

- first-class `./harness e2e`;
- `verify`/CI including E2E after smoke;
- E2E port/runtime ownership, host binding, fixture isolation, cleanup, timeout, and concurrency behavior;
- E2E evidence and artifact metadata policy;
- smoke remaining a root HTTP readiness check, not a browser/user-flow check;
- safe targeted Playwright passthrough and sanitized target metadata.

Plan-confirmed supporting update:

- **CORE-COMPONENT-0006: Development Standards — Browser E2E Testing Expectations Amendment** if Plan determines development/testing standards must explicitly list Playwright/browser E2E alongside Vitest and RTL.

No new core-component file is expected unless the Plan stage finds the browser E2E runtime contract too broad for the existing Engineering Harness component. Research recommends amending existing core-components first.

## Risks and Open Questions

### Risks

- **Current E2E suite may already be stale.** `e2e/file-tree-lazy.spec.ts` expects `.git` to be visible, but the current file API filters `.git`. This must be resolved before E2E can block `verify`.
- **`reuseExistingServer: true` safety risk.** Current Playwright config may attach to unrelated processes on occupied ports; Issue #105 requires not attaching to or killing unowned listeners.
- **Host binding ambiguity.** Current Playwright web server binds Next dev to `0.0.0.0`; Issue #105 prefers `127.0.0.1` unless Plan records a documented exception.
- **Browser dependency setup.** CI currently has no `npx playwright install --with-deps chromium` or equivalent; missing browser/system dependencies must fail clearly and not hang.
- **Fixture isolation.** Add/edit/remove/file-save tests can mutate registry and fixture files; the harness must isolate or reset `DEVDECK_DATA_DIR` and fixture project content per run, including concurrent runs.
- **Runtime cleanup.** E2E starts Next dev, terminal server, and browser processes. Pass, fail, timeout, interrupt, and degraded paths must leave no owned processes, locks, or scratch data behind.
- **Evidence leakage.** Tokens, query strings, cookies, raw logs, response bodies, absolute external paths, screenshots/traces, and Playwright stdout/stderr must not be embedded in harness JSON/evidence.
- **Runtime cost/flakiness.** Adding browser E2E to every `verify` and CI run increases time and failure modes. Any exception to the default gate must be explicit in architecture/docs.

### Open questions for Plan

1. Should Playwright server lifecycle remain inside `playwright.config.ts`, or should `./harness e2e` own server startup directly? Either way, the contract must prove port ownership, cleanup, and no unowned reuse.
2. Should `playwright.config.ts` change `reuseExistingServer` to `false` for harness-managed runs, or should the harness set an environment switch that enforces no reuse?
3. Where should Playwright browser installation live: CI only, `./harness install`, or a documented prerequisite checked by `doctor`/`e2e`?
4. What exact E2E evidence metadata can be extracted reliably from Playwright without persisting raw logs?
5. How should full E2E fixture reset/isolation work for concurrent `./harness e2e` and `./harness verify` invocations?
6. Should `ADR-0002` or `CORE-COMPONENT-0006` be amended to formally name Playwright as the required browser E2E runner?
7. Which browser/user-flow coverage is required for the first gate versus deferred follow-up, if the full Issue #105 list is too large for one implementation pass?

### Harness friction reflection

What did the agent have to infer that the harness should have proved?

The harness does not expose an `e2e` verb or prove whether Playwright browser E2E runs in `verify`/CI; this had to be inferred from help/orient, `.harness/contract.yml`, `package.json`, `playwright.config.ts`, `e2e/`, and CI.
