# Research Brief — Issue #53

## Problem Statement

DevDeck currently resolves runtime configuration directly from environment variables at the
individual call sites that need them. This works for basic deployments, but it makes
configuration hard to persist, hard to share, and inconsistent across server contexts.

Issue #53 adds a file-backed configuration layer at `$DEVDECK_DATA_DIR/config.json` with:

- environment-over-config-over-default precedence;
- a persistent generated auth token when neither env nor config provides one;
- optional `initialProjects` seeding into the project registry;
- startup validation for malformed config, invalid ports, empty hosts, and invalid project paths;
- safer startup logging that masks env/config tokens while preserving the full URL for generated tokens.

## Scope Classification

- **scope_type:** `issue`
- **issue_number:** `53`

This is an issue-scoped feature. It requires a new ADR for the configuration system, plus updates
to existing token-authentication and terminal-configuration documentation.

## Existing Code Findings

### Startup path — `src/server/start-dev.mts`

Current behavior:

- reads `DEVDECK_TOKEN`, `PORT`, and `DEVDECK_HOST` directly from `process.env`;
- generates a new `randomUUID()` token on every startup when `DEVDECK_TOKEN` is absent;
- always prints the token and clickable URL in full;
- spawns the terminal server and Next.js dev server with a child-process env object.

This is the natural place to load config once, seed initial projects, and forward resolved env vars
before child processes import modules that cache env-derived constants.

### Terminal server — `src/server/terminal-server.mts`

Current behavior:

- reads `DEVDECK_PROJECTS_DIR`, `DEVDECK_DATA_DIR`, `TERMINAL_PORT`, `TERMINAL_HOST`,
  `DEVDECK_WORKSPACE_ROOT`, and `DEVDECK_TOKEN`;
- accepts `TerminalServerOptions` for test-time overrides;
- must remain path-alias-free because standalone `.mts` files cannot safely import modules that use
  `@/` aliases.

The recommended approach is to keep `terminal-server.mts` env-driven and inject resolved config by
forwarding env vars from startup scripts, rather than importing a shared config loader into the
standalone `.mts` file.

### Middleware and auth — `src/middleware.ts`, `src/lib/auth.ts`

Current behavior:

- middleware reads `process.env.DEVDECK_TOKEN`;
- `getToken()` and `validateToken()` read/compare the token from env;
- token comparison already uses `crypto.timingSafeEqual`.

Middleware runs in the Next.js Edge runtime and cannot read `fs`, so it must continue receiving the
token via `process.env.DEVDECK_TOKEN`. Config loading should not be added to middleware.

### Registry — `src/lib/registry.ts`, `src/app/api/projects/route.ts`

Relevant behavior:

- `getDataDir()` resolves `$DEVDECK_DATA_DIR`, defaulting to `~/.config/devdeck`;
- registry writes already use temp-file + rename atomic persistence;
- manual project slug derivation in `POST /api/projects` uses
  `path.basename(normalizedPath).replace(/[^a-zA-Z0-9_-]/g, "")`;
- duplicate detection checks slug, normalized path, and auto-discovered projects.

`config.json` should live beside `registry.json`, and generated-token persistence should reuse the
same atomic write pattern. `initialProjects` seeding should reuse the same slug and duplicate rules
as manual project creation.

## Current Env Var Inventory

| Env var | Current use | Default |
| --- | --- | --- |
| `DEVDECK_TOKEN` | startup, middleware, auth, terminal server | generated UUID |
| `DEVDECK_HOST` | startup HTTP bind host | `0.0.0.0` |
| `PORT` | startup HTTP port | `8070` |
| `DEVDECK_PROJECTS_DIR` | project APIs, registry fallback, terminal server | `/workspaces` |
| `DEVDECK_DATA_DIR` | registry and terminal server data dir | `~/.config/devdeck` |
| `DEVDECK_WORKSPACE_ROOT` | terminal default cwd | `os.homedir()` |
| `TERMINAL_HOST` | terminal WebSocket bind host | `127.0.0.1` |
| `TERMINAL_PORT` | terminal WebSocket port | `3100` |

## Required Architecture Work

### New ADR required

Create **ADR-0006 — Config File-Driven Configuration System**.

It should decide:

- config file location: `$DEVDECK_DATA_DIR/config.json`;
- `dataDir` remains env-only and is ignored with a warning if present in config;
- supported keys: `token`, `projectsDir`, `workspaceRoot`, `host`, `port`,
  `terminalHost`, `terminalPort`, `initialProjects`;
- precedence: environment variables > config file > defaults;
- malformed JSON and invalid config values fail startup with clear path-aware errors;
- missing config file is treated as empty config;
- unknown keys warn but do not fail;
- generated tokens are persisted to config with POSIX `0600` mode;
- env/config tokens are masked in startup output, while generated tokens may be printed in full;
- `initialProjects` seeding is additive and idempotent;
- config contents must not be exposed through API routes.

### Existing ADR/core-component updates required

- **ADR-0004 — Token-Based Authentication:** document persistent generated tokens and masked
  startup logging for env/config tokens.
- **CORE-COMPONENT-0003 — WebSocket Terminal Communication:** document that terminal host, port,
  token, project directory, and workspace root are centrally resolved at startup and forwarded via
  environment variables to the standalone terminal server.
- **DECISION-LOG.md:** add records for the new ADR and any modified core-component/ADR decisions.

No new standalone core-component is required.

## Implementation Considerations

### Config loader

Add a Node-only config module, likely `src/lib/config.ts`, with named exports for:

- resolving `dataDir`;
- reading `config.json`;
- warning on unknown keys;
- validating fields;
- resolving source metadata for each field;
- generating and persisting a token when neither env nor config provides one;
- masking token values for startup display.

The resolved config should be typed and frozen. Tests that use `fs`, `path`, or `os` should include
`// @vitest-environment node`.

### Config schema and precedence

| Config key | Env override | Default |
| --- | --- | --- |
| `token` | `DEVDECK_TOKEN` | generated UUID persisted to config |
| `projectsDir` | `DEVDECK_PROJECTS_DIR` | `/workspaces` |
| `workspaceRoot` | `DEVDECK_WORKSPACE_ROOT` | `os.homedir()` |
| `host` | `DEVDECK_HOST` | `0.0.0.0` |
| `port` | `PORT` | `8070` |
| `terminalHost` | `TERMINAL_HOST` | `127.0.0.1` |
| `terminalPort` | `TERMINAL_PORT` | `3100` |
| `initialProjects` | none | `[]` |

`dataDir` is intentionally env-only because it determines where the config file is located.

### Initial project seeding

Add a registry helper, likely `seedInitialProjects(initialProjects)`, that:

1. resolves each configured path server-side;
2. derives the slug with the same sanitization as `POST /api/projects`;
3. skips empty slugs;
4. skips duplicate slugs in registry;
5. skips duplicate normalized paths in registry;
6. skips slugs that match auto-discovered project directories;
7. validates the path exists and is a directory, allowing symlinked directories through `stat`;
8. appends only new manual entries and writes the registry once;
9. logs seeded and skipped entries without mutating existing entries.

### Startup wiring

`start-dev.mts` should:

1. load config before spawning child processes;
2. seed `initialProjects`;
3. print a source-aware startup banner;
4. set `DEVDECK_TOKEN`, `PORT`, `DEVDECK_HOST`, `DEVDECK_PROJECTS_DIR`,
   `DEVDECK_WORKSPACE_ROOT`, `TERMINAL_HOST`, and `TERMINAL_PORT` in the child env;
5. spawn terminal and Next.js processes with that env.

Production `next start` does not currently go through `start-dev.mts`. The planner should decide
whether to add a production wrapper or document that raw env vars remain required for production
starts.

## Risks and Pitfalls

- **Standalone `.mts` imports:** do not import a config module that uses `@/` aliases into
  `terminal-server.mts`; use env forwarding instead.
- **Edge middleware:** do not read config files in middleware; it cannot use `fs`.
- **Module-scope env constants:** config-derived env vars must be set before child processes import
  registry/API/terminal modules.
- **Token logging:** avoid printing env/config tokens in full; only generated tokens may be printed
  for first-run usability.
- **Config permissions:** warn on world-readable config files on POSIX; use `0600` for created files.
- **`dataDir` circularity:** ignore and warn on `dataDir` in config.
- **Tilde expansion:** Node `path.resolve("~/x")` does not expand `~`; the ADR should decide whether
  to support explicit tilde expansion or require absolute/relative paths.

## Recommended Test Handoff

### Config loader tests

- missing config file returns defaults;
- corrupt JSON throws an error containing the config path and parse details;
- unknown keys warn without failing;
- `dataDir` in config warns and is ignored;
- env vars override config values for all mapped keys;
- config values override defaults when env vars are absent;
- invalid ports (`0`, `65536`, non-integer, non-numeric) throw;
- empty/whitespace hosts throw;
- whitespace-only config token is treated as missing;
- env token yields source `env`;
- config token yields source `config`;
- absent token generates a UUID and persists it;
- generated config writes use POSIX `0600` permissions where applicable;
- world-readable existing config warns on POSIX and does not warn on Windows;
- `initialProjects` omitted resolves to `[]`;
- invalid `initialProjects` type throws.

### Registry seeding tests

- empty `initialProjects` is a no-op;
- valid new project path adds one manual registry entry;
- duplicate slug is skipped;
- duplicate normalized path is skipped;
- slug matching an auto-discovered project is skipped;
- nonexistent path is skipped;
- file path is skipped;
- symlink to directory is accepted;
- slug sanitization matches `POST /api/projects`;
- multiple seed calls are idempotent;
- mixed valid/invalid entries seed only valid entries and write once.

### Startup integration tests

- no env/config token generates and prints a full first-run URL;
- env/config tokens are masked in the banner;
- resolved config values are forwarded to child process env;
- invalid config prevents child processes from starting;
- `initialProjects` are seeded before child process spawn.

## Handoff Summary

The implementation should introduce a central config loader, update startup wiring to forward
resolved env vars, seed initial projects via registry helpers, add tests for validation and
idempotency, and update README/LLM plus architecture docs. The primary architectural decision is the
new config system ADR; the primary integration constraint is that runtime server contexts should
continue consuming env vars after startup resolution rather than reading config files independently.
