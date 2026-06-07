# DevDeck Engineering Harness

The `./harness` CLI is the preferred operating surface for DevDeck. It wraps existing project commands (npm scripts, justfile recipes) into a unified interface with standardized verdicts, JSON output, and verification evidence.

## Quick Start

```bash
./harness help      # List all verbs
./harness doctor    # Check prerequisites
./harness verify    # Run full verification
./harness orient    # See project surface map
```

## Verbs

| Verb | Description | Backing Command |
|------|-------------|-----------------|
| `help` | Show available verbs and options | — |
| `orient` | Describe detected project surfaces | — |
| `doctor` | Check prerequisites (node, npm, git, just, tmux) | — |
| `lint` | Run ESLint | `npm run lint` |
| `test` | Run vitest suite | `npm run test` |
| `build` | Build Next.js app | `npm run build` |
| `boot` | Start dev server | `npx tsx src/server/start-dev.mts` |
| `verify` | Full verification with evidence | lint → format:check → build → test → smoke |
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

`./harness verify` runs the full pipeline: lint → format:check → build → test → smoke.

- All steps run even if earlier ones fail (continue-on-failure)
- Each step has a 5-minute timeout
- Evidence is written to `.harness/evidence/verify-{timestamp}-{PID}.json`
- Evidence contains only: command name, exit code, duration, verdict, timestamp, summary
- Evidence **never** includes secrets, tokens, env vars, or raw logs

## Friction

Friction records capture inferences — things the harness should prove but currently requires guessing.

```bash
./harness friction add "boot verb inferred from justfile dev recipe"
./harness friction list
```

Each record answers: **"What did the agent have to infer that the harness should have proved?"**

Records are stored in `.harness/friction.jsonl` as single JSON lines.

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
| `.harness/friction.jsonl` | Inference friction log |
| `.harness/README.md` | This file |
