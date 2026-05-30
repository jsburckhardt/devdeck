# Task Breakdown — Issue #53

## T1 — Creating the config loader

**References:** ADR-0006, ADR-0004, CORE-COMPONENT-0006

Implement `src/lib/config.ts` with typed config file parsing, validation, precedence resolution,
source metadata, generated-token persistence, POSIX permissions handling, unknown-key warnings,
world-readable warnings, `~` path expansion for project paths, and token masking helpers.

**Acceptance Criteria**

- Missing config files resolve defaults without error.
- Malformed JSON and invalid field values throw path-aware startup errors.
- Env values override config values for every mapped key.
- Whitespace-only config tokens are treated as missing.
- Generated tokens persist to `config.json` using atomic writes and POSIX `0600` where supported.
- Env/config token display values are `[redacted:env]` or `[redacted:config]`; generated tokens can
  be displayed in full.
- `initialProjects` must validate as an array of objects with required non-empty string `path`.
- Non-array `initialProjects`, non-object entries, missing/empty `path`, and non-string
  `name`/`description` values throw path-aware errors.
- Whitespace-only `name` and `description` values are normalized as omitted.
- Leading `~` expansion applies to `entry.path`, not to the whole entry.

**Test Coverage Requirements**

- Add co-located Node-environment Vitest coverage for missing/corrupt config, unknown keys,
  `dataDir` warnings, env precedence, valid/invalid ports, valid/invalid hosts, token source
  resolution, generated-token persistence, permissions, and `initialProjects` validation.
- Cover object entries with `path`, optional metadata trimming/omission, non-array values,
  non-object entries, missing/empty paths, and non-string metadata rejection.

## T2 — Seeding initial projects

**References:** ADR-0003, ADR-0006, CORE-COMPONENT-0006

Add `seedInitialProjects()` to the registry layer accepting normalized initial-project objects. It
should derive slugs from `entry.path` exactly like `POST /api/projects`, skip duplicates by
slug/path/auto-discovery, validate directories, accept symlinked directories through `stat`, persist
trimmed optional `name` and `description` on new manual registry entries, log seeded/skipped
entries, and write the registry at most once per seeding call.

**Acceptance Criteria**

- Seeding is additive only and never mutates existing entries.
- Duplicate slug, duplicate normalized path, auto-discovered project slug, invalid path, file path,
  and empty sanitized slug are skipped with logs.
- Valid entries are added as manual registry entries with trimmed `name` and `description` when
  provided.
- Blank optional metadata is omitted from saved registry entries.
- Repeated startup seeding is idempotent.

**Test Coverage Requirements**

- Add registry tests for valid add, duplicate slug, duplicate path, auto-discovery collision,
  nonexistent path, file path, symlink directory, empty slug, mixed valid/invalid inputs, idempotency,
  and single-write batching.
- Add registry tests proving seeded metadata is persisted after trimming and blank metadata is
  omitted.

## T3 — Wiring startup configuration

**References:** ADR-0006, CORE-COMPONENT-0003

Update `src/server/start-dev.mts` to load config before child processes spawn, seed initial projects,
print the source-aware banner, and forward resolved env values to Next.js and the terminal server.

**Acceptance Criteria**

- Child processes receive resolved `DEVDECK_TOKEN`, `PORT`, `DEVDECK_HOST`,
  `DEVDECK_PROJECTS_DIR`, `DEVDECK_DATA_DIR`, `DEVDECK_WORKSPACE_ROOT`, `TERMINAL_HOST`, and
  `TERMINAL_PORT`.
- Invalid config aborts before child process spawn.
- `initialProjects` seeding runs before child process spawn.
- Generated tokens produce full first-run URLs; env/config tokens are masked.

**Test Coverage Requirements**

- Add startup tests that mock child process spawning and assert env forwarding, banner masking,
  generated-token display behavior, invalid-config abort behavior, and seeding-before-spawn ordering.

## T4 — Preserving auth and terminal behavior

**References:** ADR-0004, CORE-COMPONENT-0003, CORE-COMPONENT-0005

Ensure middleware, auth utilities, and terminal-server token validation continue using env-provided
tokens and constant-time comparison. Do not import the config loader into Edge middleware or
`terminal-server.mts`.

**Acceptance Criteria**

- Existing HTTP and WebSocket auth flows keep working with config-derived tokens forwarded through
  env.
- Token comparison continues to use `crypto.timingSafeEqual`.
- `terminal-server.mts` remains standalone `.mts` compatible.

**Test Coverage Requirements**

- Existing auth and terminal tests must continue passing.
- Add regression coverage only if a wiring gap is found.

## T5 — Updating documentation

**References:** ADR-0006, CORE-COMPONENT-0006

Update README and LLM documentation to describe `config.json`, supported keys, precedence,
generated-token persistence, token masking, `initialProjects`, security notes, and production
limitations.

**Acceptance Criteria**

- README documents the config file path, schema, example config, env precedence, `dataDir`
  env-only behavior, token security, and production `next start` limitation.
- LLM.txt lists the new config module and relevant startup/registry behavior.

**Test Coverage Requirements**

- Documentation-only changes do not need dedicated tests, but format checks must pass.

## T6 — Running verification

**References:** CORE-COMPONENT-0006, `.github/soft-factory/verification.yml`

Run configured verification after implementation.

**Acceptance Criteria**

- `npm run lint`, `npm run format:check`, `npm run build`, `npm run test`, and smoke verification
  pass before commit/PR.

**Test Coverage Requirements**

- All tests from T1-T4 must be included in the full suite.
