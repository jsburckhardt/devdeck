# Action Plan — Issue #53

## Goal

Add file-backed runtime configuration at `$DEVDECK_DATA_DIR/config.json` while preserving existing
environment-variable deployments. The implementation must persist generated tokens, seed initial
projects idempotently, validate startup configuration, and keep all runtime contexts consuming
resolved environment variables.

## Key Decisions

- **ADR-0006** defines the config file schema, precedence, validation, token persistence, and
  `initialProjects` seeding rules.
- **ADR-0004** is amended rather than superseded: token authentication remains the model, but
  generated tokens now persist and env/config tokens are masked in startup output.
- **CORE-COMPONENT-0003** requires the standalone terminal server to remain env-driven; config is
  resolved at startup and forwarded to `terminal-server.mts`.
- Token masking format is `[redacted:env]` or `[redacted:config]`.
- `initialProjects` entries are objects with required non-empty `path` and optional string
  `name`/`description`; leading `~` expansion applies to `entry.path`.
- Registry seeding persists trimmed optional `name` and `description` on new manual entries, and
  omits blank optional metadata.
- A production `next start` wrapper is deferred; production remains env-driven for this issue.

## Implementation Sequence

1. Create `src/lib/config.ts` with typed config loading, validation, source tracking, token
   persistence, permissions checks, object-entry validation for `initialProjects`, and token display
   helpers.
2. Extend `src/lib/registry.ts` with idempotent `seedInitialProjects()` that reuses the same slug
   and duplicate rules as `POST /api/projects` and persists configured metadata for seeded manual
   entries.
3. Wire `src/server/start-dev.mts` to load config before spawning children, seed projects, print a
   source-aware startup banner, and forward resolved values in child-process env.
4. Keep `src/middleware.ts`, `src/lib/auth.ts`, and `src/server/terminal-server.mts` env-driven;
   only update them if tests reveal a wiring gap.
5. Update README and LLM documentation with config file usage, security notes, and production
   limitations.
6. Add focused tests for config loading, registry seeding, and startup wiring.

## Out of Scope

- A UI config editor.
- A production `start-prod.mts` wrapper.
- New external dependencies.
- Exposing config contents through any API endpoint.
