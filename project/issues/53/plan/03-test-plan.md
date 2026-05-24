# Test Plan — Issue #53

## Config loader unit tests

Create `src/lib/config.test.ts` with `// @vitest-environment node`.

Cover:

- missing config file resolves defaults;
- malformed JSON throws a clear path-aware error;
- unreadable config throws a clear path-aware error;
- unknown keys warn without failing;
- `dataDir` in config warns and is ignored;
- env vars override config values for all mapped keys;
- partial config uses defaults for omitted values;
- `port` and `terminalPort` accept integer values from config and env;
- invalid ports (`0`, `65536`, fractional, non-numeric, empty) throw;
- empty/whitespace `host` and `terminalHost` throw;
- whitespace-only token is treated as missing;
- token source is `env`, `config`, or `generated` as appropriate;
- generated token is persisted to `config.json`;
- generated token writes use atomic temp + rename and POSIX `0600` where supported;
- world-readable existing config warns on POSIX and does not warn on Windows;
- `initialProjects` defaults to `[]`;
- `initialProjects` accepts object entries with required `path`;
- leading `~` in `entry.path` expands to `os.homedir()`;
- non-array `initialProjects` throws;
- non-object entries throw;
- missing, empty, or whitespace-only `path` throws;
- non-string `name` and `description` throw;
- whitespace-only `name` and `description` are omitted;
- valid `name` and `description` are trimmed;
- token display helper returns `[redacted:env]`, `[redacted:config]`, or the generated token.

## Registry seeding unit tests

Extend `src/lib/registry.test.ts`.

Cover:

- empty `initialProjects` is a no-op;
- valid object entry path adds a manual registry entry;
- valid object entry with `name` and `description` persists trimmed metadata;
- blank `name` and `description` are omitted from saved registry entries;
- duplicate slug is skipped;
- duplicate normalized path is skipped;
- slug matching an auto-discovered project directory is skipped;
- nonexistent path is skipped;
- file path is skipped;
- symlink to a directory is accepted;
- sanitized empty slug is skipped;
- mixed valid and invalid entries seed only valid entries;
- repeated seeding is idempotent;
- batch seeding writes the registry once;
- logs distinguish seeded and skipped reasons.

## Startup integration tests

Add focused tests for `src/server/start-dev.mts` behavior using mocks/stubs for process spawning.

Cover:

- no env/config token generates a token and prints a full first-run URL;
- env token is forwarded and displayed as `[redacted:env]`;
- config token is forwarded and displayed as `[redacted:config]`;
- resolved host/port/project/workspace/terminal values are forwarded to both child processes;
- invalid config aborts before child processes are spawned;
- `seedInitialProjects()` runs before child processes are spawned;
- startup banner shows source information for token, projects dir, HTTP bind, and terminal bind.

## Regression tests

Run the existing auth, middleware, terminal-server, API project, and E2E-adjacent unit coverage.
Add targeted regression tests only if implementation changes those files.

## Full verification

Run the configured Soft Factory verification steps:

1. `npm run lint`
2. `npm run format:check`
3. `npm run build`
4. `npm run test`
5. smoke command from `.github/soft-factory/verification.yml`
