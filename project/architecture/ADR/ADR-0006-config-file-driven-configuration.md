# ADR-0006: Config File-Driven Configuration System

## Status

Accepted

## Context

DevDeck currently resolves configuration directly from environment variables at the point of use.
That keeps the first version simple, but it creates several problems:

1. Users cannot persist a stable authentication token unless they manually export
   `DEVDECK_TOKEN`.
2. Users cannot preconfigure projects for first launch without using the UI or registry API.
3. Configuration cannot be copied or versioned as a single file.
4. Startup validation is inconsistent because each runtime context parses its own environment
   values.

The project already stores persistent runtime data in `$DEVDECK_DATA_DIR`, defaulting to
`~/.config/devdeck`, and the registry uses JSON with atomic temp-file writes. The config system
should follow the same local-first, dependency-free model.

## Decision

DevDeck will load `$DEVDECK_DATA_DIR/config.json` at startup. `DEVDECK_DATA_DIR` remains env-only
because it determines the config file location; a `dataDir` key in `config.json` is ignored with a
warning.

Configuration precedence is:

1. Environment variables
2. Config file values
3. Built-in defaults

The supported config keys are:

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

Config loading rules:

- Missing `config.json` is treated as an empty config file.
- Malformed JSON or unreadable config files fail startup with a clear message that includes the
  config path, without exposing file contents.
- Unknown keys warn but do not fail startup.
- Ports must be integers from 1 to 65535.
- Hosts must be non-empty strings after trimming whitespace.
- Whitespace-only tokens are treated as missing.
- Existing world-readable config files warn on POSIX systems.
- Created config files use POSIX mode `0600` where supported.

Token rules:

- If `DEVDECK_TOKEN` is present, it is the auth token and no config token is generated.
- If config `token` is present and no env token is present, the config token is used.
- If neither env nor config provides a token, DevDeck generates a UUID and persists it to
  `config.json`.
- Generated first-run tokens may be printed in full with a clickable URL for usability.
- Env/config tokens must be masked in startup output using `[redacted:<source>]`, where `<source>` is
  `env` or `config`.
- ADR-0004 remains the authentication model; this ADR amends its token lifecycle and startup
  logging behavior.

`initialProjects` are processed additively on each startup:

- Each entry must be an object with required non-empty string `path` and optional string `name` and
  `description`.
- Leading `~` is expanded to `os.homedir()` on `entry.path` before path resolution and validation.
- Optional `name` and `description` are trimmed before use; blank optional metadata is omitted.
- Slugs are derived from `path.basename(path.resolve(entry.path)).replace(/[^a-zA-Z0-9_-]/g, "")`.
- Entries are skipped when the slug is empty, the slug already exists, the normalized path already
  exists, the slug matches an auto-discovered project under the resolved `projectsDir`, or the path
  is not an existing directory.
- Valid new entries are added as manual registry projects, including trimmed `name` and
  `description` when provided.
- Seeding never overwrites or mutates existing registry entries.

Runtime contexts should continue to consume environment variables after config resolution. Startup
code resolves the config once and forwards the resolved values through child-process env. The
standalone terminal server remains env-driven and must not import the config module.

The production `next start` script remains env-driven for this issue; a production wrapper can be
added later if needed.

## Alternatives

| Alternative | Pros | Cons | Why Rejected |
| --- | --- | --- | --- |
| Environment variables only | Existing behavior; simple | No persistent token or reusable config file | Does not solve the issue |
| Read config independently in every server context | Localized changes | Breaks Edge middleware and risks inconsistent precedence | Middleware cannot use `fs`; startup resolution is safer |
| Import config loader into `terminal-server.mts` | Direct access in terminal server | Standalone `.mts` import constraints and path-alias risks | Env forwarding matches existing standalone server design |
| Add a database-backed config store | Stronger schema evolution | Adds dependencies and complexity | JSON is sufficient for local single-user configuration |

## Consequences

### Positive

- Users get a stable generated access token without manual environment setup.
- Configuration becomes shareable and reproducible.
- Startup validation centralizes invalid-value handling.
- Existing env-var deployments remain backward compatible.
- Initial project seeding supports reproducible first-launch workspaces.

### Negative

- `config.json` may contain a bearer token and must be treated as sensitive.
- Production `next start` does not automatically load the config file in this issue.
- Simultaneous first starts may race to persist generated tokens; atomic writes prevent corruption,
  but the last writer wins.

### Neutral

- `DEVDECK_DATA_DIR` remains the only config-location selector.
- Runtime modules continue reading env vars after startup normalization.

## Related Issues

- [#53](https://github.com/jsburckhardt/devdeck/issues/53)

## References

- [ADR-0003: Project Registry & Persistence Strategy](./ADR-0003-project-registry-persistence.md)
- [ADR-0004: Token-Based Authentication](./ADR-0004-token-authentication.md)
- [CORE-COMPONENT-0003: WebSocket Terminal Communication](../core-components/CORE-COMPONENT-0003-websocket-terminal.md)
- [CORE-COMPONENT-0006: Development Standards](../core-components/CORE-COMPONENT-0006-development-standards.md)
