# DevDeck Engineering Harness

The `./harness` CLI is the preferred operating surface for DevDeck. It wraps existing project commands (npm scripts, justfile recipes) into a unified interface with standardized verdicts, JSON output, and verification evidence.

## Quick Start

```bash
./harness help      # List all verbs
./harness install   # Install dependencies from package-lock.json
./harness doctor    # Check prerequisites
./harness verify    # Run full verification
./harness smoke     # Smoke an existing production build
./harness e2e       # Run Playwright browser E2E workflows
./harness orient    # See project surface map
```

## Verbs

| Verb | Description | Backing Command |
|------|-------------|-----------------|
| `help` | Show available verbs and options | — |
| `orient` | Describe detected project surfaces | — |
| `doctor` | Check prerequisites (node, npm, git, just, tmux) | — |
| `install` | Install dependencies from package-lock.json | `npm ci` |
| `lint` | Run ESLint | `npm run lint` |
| `test` | Run vitest suite; pass targets after `--` | `npm run test [-- <vitest args...>]` |
| `e2e` | Run Playwright browser E2E; pass args after `--` | `npm run e2e [-- <playwright args...>]` |
| `build` | Build Next.js app | `npm run build` |
| `smoke` | Smoke an existing production build on loopback | `npm run start -- --hostname 127.0.0.1 --port <selectedPort>` |
| `boot` | Start dev server | `npx tsx src/server/start-dev.mts` |
| `verify` | Full verification with evidence | lint → format:check → build → test → smoke → e2e |
| `status` | Report harness config and evidence | — |
| `clean` | Remove .next and node_modules | `rm -rf .next node_modules` |
| `friction add` | Record an inference friction entry | — |
| `friction list` | Show friction entries | — |

## Verdicts

Every command returns exactly one verdict:

| Verdict | Exit Code | Meaning |
|---------|-----------|---------|
| `pass` | 0 | All checks passed |
| `fail` | 1 | Backing command found a problem |
| `degraded` | 2 | Optional dependency missing; partial operation |
| `unknown` | 3 | Cannot determine state or backing command |

## JSON Output

Most verbs support `--json` for machine-readable output:

```bash
./harness doctor --json
./harness install --json
./harness test --json -- src/server/start-dev.test.ts
./harness e2e --json
./harness e2e --json -- e2e/terminal.spec.ts --project=chromium
./harness smoke --json
./harness verify --json
./harness status --json
```

JSON schema:
```json
{
  "verb": "string",
  "verdict": "pass|fail|degraded|unknown",
  "command": "string|null",
  "steps": [{"name": "string", "verdict": "string", "exitCode": 0, "durationMs": 0}],
  "evidence": "string|null",
  "message": "string",
  "timestamp": "ISO-8601"
}
```

## Verification & Evidence

`./harness verify` runs the full pipeline: lint → format:check → build → test → smoke → e2e.

- All steps run even if earlier ones fail (continue-on-failure)
- Each step has a 5-minute timeout
- Evidence is written to `.harness/evidence/verify-{timestamp}-{PID}.json`
- Evidence contains only: command name, exit code, duration, verdict, timestamp, summary
- Evidence **never** includes secrets, tokens, env vars, or raw logs
- Verify reuses the same smoke implementation as `./harness smoke` and embeds only the stable smoke evidence metadata: `portMode`, `selectedPort`, `httpStatus`, `timeoutSeconds`, and `pollIntervalMs`.
- Verify reuses the same E2E implementation as `./harness e2e` and embeds only sanitized E2E metadata under `metadata.e2e`: targeting summary, Playwright projects, `testCounts`, selected ports, fixture run ID, duration, and safe repo-relative artifact paths.

## Targeted Tests

Use `--` to separate harness-owned flags from Vitest arguments:

```bash
./harness test                         # npm run test
./harness test -- src/server/start-dev.test.ts
./harness test -- --json src/server/start-dev.test.ts
./harness test --json -- src/server/start-dev.test.ts
```

Harness `--json` is recognized before the passthrough delimiter. Arguments after `--`
are forwarded verbatim through shell arrays, including Vitest's own `--json`.
JSON metadata always reports the targeting state without exposing raw arguments:
full-suite runs emit `command: "npm run test"`, `targeted: false`,
`targets: []`, `targetCount: 0`, and `truncated: false`; targeted runs emit
`command: "npm run test -- <N target(s)>"`, `targeted: true`, `targets` as an
array of sanitized string labels, `targetCount`, and a top-level `truncated`
flag.

## Browser E2E

`./harness e2e [--json] [-- <playwright args...>]` runs Playwright through the repository harness:

```bash
./harness e2e
./harness e2e --json
./harness e2e -- e2e/terminal.spec.ts --project=chromium
./harness e2e --json -- --reporter=json e2e/file-tree-lazy.spec.ts
```

- Harness-owned `--json` is recognized only before `--`.
- Every Playwright argument after `--` is forwarded verbatim through shell arrays; no `eval` or string-built commands are used.
- Canonical E2E metadata is emitted under `metadata.e2e`; selected fields may also appear directly under `metadata` for compatibility.
- Full-suite `metadata.e2e` uses `targeted: false`, `targets: []`, `targetCount: 0`, and `truncated: false`.
- Targeted `metadata.e2e` reports sanitized target labels without changing the forwarded Playwright arguments.
- `metadata.e2e.testCounts` reports nested `passed`, `failed`, `skipped`, `timedOut`, and `interrupted` counts parsed from the sanitized Playwright JSON reporter output.
- E2E runs allocate loopback-only web ports from `42000-42999` and terminal ports from `43000-43999`.
- Fixed `DEVDECK_E2E_WEB_PORT` / `DEVDECK_E2E_TERMINAL_PORT` conflicts return `degraded`; unrelated listeners are never killed or reused.
- Fixture state is copied or generated under `.harness/run/e2e-<run-id>/`; checked-in `e2e/fixtures/` files are immutable seeds.
- Cleanup releases only harness-owned locks and scratch state on pass, fail, timeout, interrupt, or degraded paths.

Smoke and E2E are intentionally different: `./harness smoke` proves an existing production build answers a root HTTP readiness probe; `./harness e2e` proves representative browser workflows through Playwright.

## Smoke

`./harness smoke [--port auto|PORT] [--json]` starts the already-built production
app through the existing npm start surface:

```bash
./harness build
./harness smoke
./harness smoke --port auto
./harness smoke --port 41042 --json
```

- Default port mode is `auto`.
- Auto mode tries at most 50 candidates in `41000-41999`.
- Fixed ports accept only integers from `1` to `65535`.
- The app binds to `127.0.0.1`; probes use `http://127.0.0.1:<port>/`.
- Probes run once per second for at most 60 attempts and do not follow redirects.
- Accepted readiness statuses are `200`, `301`, `302`, `303`, `307`, and `308`.
- Missing production build, start failure, readiness timeout, and HTTP `4xx`/`5xx` are `fail`.
- Fixed-port conflicts and bounded auto-port exhaustion/races are `degraded`.
- Missing backing command or probe capability is `unknown`.
- Cleanup traps `EXIT`, `INT`, and `TERM`, killing only the harness-owned child/process group; the harness never kills by port.
- Before using a port, smoke acquires a checkout/worktree-scoped atomic lock directory under `.harness/run/` and writes secret-free ownership metadata (`owner.json`) with the selected port, parent harness PID, child PID/process group, safe repo identity, sanitized command summary, and timestamp.
- Stale metadata is validated before reuse. Dead-process records are removed; stale live processes are terminated only when the metadata proves the same checkout/worktree and expected smoke command. Live unproven processes are never killed.
- Auto-port mode locks a candidate before the post-lock availability check, releases and retries on lock races or `EADDRINUSE`, and remains bounded to 50 candidates.

Smoke does not run `build`; use `./harness build` first or `./harness verify` for the full build-before-smoke sequence.

## Metadata Safety

Harness JSON and evidence exclude raw stdout/stderr, response bodies, redirect
locations, tokens, cookies, query strings, environment variables, credential URLs,
browser console logs, inline screenshots/traces/videos, and external absolute paths.
Standalone smoke/E2E JSON may include richer sanitized lifecycle metadata, but
verify evidence is intentionally limited to stable smoke/E2E metadata. Canonical
browser metadata lives at `metadata.e2e`, including nested `testCounts`; Test and
E2E target metadata converts repo-absolute paths to repo-relative paths,
redacts outside-repo absolute paths, strips query/control characters, caps labels
at 200 characters, sets top-level `truncated: true` when any label was capped,
and includes `targeted`/`targetCount` summary fields.

Direct `npx playwright` diagnostics are allowed only when harness E2E output is too
coarse for local debugging; agents must record that bypass as friction.

## Friction

Friction records capture inferences — things the harness should prove but currently requires guessing.

```bash
./harness friction add "boot verb inferred from justfile dev recipe"
./harness friction list
```

Each record answers: **"What did the agent have to infer that the harness should have proved?"**

Records are stored in `.harness/friction.jsonl` as single JSON lines.

## CI Browser Setup

Pull-request CI keeps `./harness verify` as the single verification gate:

1. `npm ci`
2. `npx playwright install --with-deps chromium`
3. `./harness verify`

The Playwright browser setup step is noninteractive and timeout-bounded so CI
cannot hang indefinitely before the harness runs. The current workflow caps
browser provisioning at 10 minutes, verification at 45 minutes, and the whole
job at 60 minutes.

## Clean Command Safety

`./harness clean` is destructive. It:
- Shows what will be deleted before executing
- Requires confirmation (or `--yes` to skip)
- Refuses to run outside the repo root

```bash
./harness clean          # Interactive confirmation
./harness clean --yes    # Skip confirmation (CI/scripts)
```

## Environment

- `NO_COLOR=1` — Suppress colored output
- The harness uses only tools available in the devcontainer: bash, node, npm, git, curl
- `jq` is not required; JSON is produced with shell string construction

## Files

| Path | Purpose |
|------|---------|
| `./harness` | CLI entrypoint |
| `.harness/contract.yml` | Machine-readable contract |
| `.harness/evidence/` | Verification evidence (gitignored) |
| `.harness/run/` | Local smoke/E2E ownership locks and E2E scratch metadata (gitignored) |
| `.harness/friction.jsonl` | Inference friction log |
| `.harness/README.md` | This file |
