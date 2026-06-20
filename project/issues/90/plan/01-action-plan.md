# Action Plan: First-Class Harness Smoke and Targeted Test Passthrough

## Feature
- **ID:** 90
- **Research Brief:** project/issues/90/research/00-research.md

## ADRs Created

- None. Issue #90 stays within the existing Engineering Harness core-component and existing ADR boundaries:
  - `ADR-0002` for npm, Vitest, Next.js, TypeScript, and justfile tooling.
  - `ADR-0004` and `ADR-0006` for token/config runtime behavior that smoke must not leak or bypass.

## Core-Components Created

- None created.
- Updated global artifact: `project/architecture/core-components/CORE-COMPONENT-0009-engineering-harness.md`.
- Updated decision records in `project/architecture/ADR/DECISION-LOG.md`:
  - #234: expose first-class `./harness smoke`.
  - #235: require safe smoke auto/fixed port handling.
  - #236: require cleanup of only harness-owned smoke children.
  - #237: reuse shared smoke inside `./harness verify`.
  - #238: forward `./harness test -- <args>` to Vitest with safe arrays.
  - #239: sanitize smoke/test JSON evidence.

## Implementation Tasks

1. **Redesign harness argument parsing and dispatch.**
   - Make harness-owned `--json` apply only before any verb-level passthrough delimiter.
   - Preserve arguments after `--` for verb-specific handling, especially `./harness test -- --json`.
   - Validate smoke options strictly and return harness verdicts for invalid usage.

2. **Implement targeted `./harness test` passthrough.**
   - Replace unsafe `eval` execution for test targets with array-based command execution.
   - Run full suite by default and run `npm run test -- <targets...>` when passthrough args are present.
   - Emit sanitized command summaries and target metadata without leaking absolute external paths or credentials.

3. **Build the shared smoke implementation.**
   - Add `./harness smoke [--port auto|PORT] [--json]`.
   - Default to auto-port selection over `41000-41999` with bounded retry and fixed-port conflict handling.
   - Bind to `127.0.0.1`, poll root readiness without following redirects, map verdicts explicitly, and clean up only owned child processes.
   - Use `.harness/run/` only if durable ownership metadata is needed; add it to `.gitignore` if introduced.

4. **Sanitize smoke JSON/evidence metadata.**
   - Report selected port mode, sanitized bind/probe host, readiness counts, duration, HTTP status class, and cleanup outcome.
   - Exclude raw logs, response bodies, redirect locations, query strings, tokens, env vars, and credential-bearing URLs.

5. **Replace verify's inline smoke with the shared smoke implementation.**
   - Preserve lint → format_check → build → test → smoke order and continue-on-failure behavior.
   - Preserve evidence writing and aggregate verdict precedence.
   - Include sanitized smoke metadata in verify evidence.

6. **Update harness discovery and documentation surfaces.**
   - Update `./harness help`, `./harness orient`, `./harness orient --json`, `.harness/contract.yml`, `.harness/README.md`, and `LLM.txt`.
   - Update `.gitignore` if `.harness/run/` is introduced.
   - Consider updating `AGENTS.md` harness guidance if the implementer judges it necessary to avoid agent-facing drift.

7. **Add automated harness tests.**
   - Prefer fast Vitest coverage under `src/` using controlled/fake backing commands.
   - Cover parser behavior, smoke option validation, port conflicts, auto-port retry, lifecycle cleanup, JSON sanitization, target passthrough, verify evidence, orient discovery, and harness validation.

8. **Run final validation through supported harness verbs.**
   - Use targeted `./harness test -- <harness test targets>` while iterating once implemented.
   - Run `./harness smoke` after a successful build.
   - Run `./harness verify --json` as the final repository verification path and inspect sanitized evidence shape.
