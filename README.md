# DevDeck

A web-based development environment that replicates the IDE experience with a real terminal connected to your local machine via xterm.js + node-pty, built with Next.js.

[![APS version](https://img.shields.io/badge/APS-v1.2.2-blue?logo=github)](https://github.com/chris-buckley/agnostic-prompt-standard/releases/tag/v1.2.2)

## Tech Stack

- **Framework:** Next.js (App Router, TypeScript)
- **Terminal:** xterm.js (frontend) + node-pty (backend) via WebSocket
- **UI:** Tailwind CSS v4, shadcn/ui, framer-motion, @phosphor-icons/react
- **Testing:** Vitest + React Testing Library
- **Task Runner:** just (justfile)

## Getting Started

```bash
# Install dependencies
./harness install

# Start development server
just dev

# Run all checks
./harness verify
```

## Development

```bash
./harness help    # Show all supported harness commands
./harness install # Install dependencies from package-lock.json
just dev          # Start dev server with Turbopack
just test         # Run tests
just lint         # Run ESLint
just format       # Format code with Prettier
./harness verify  # Run lint + format:check + build + test + smoke
```

## Configuration

DevDeck can be configured with a JSON file at `$DEVDECK_DATA_DIR/config.json` (default: `~/.config/devdeck/config.json`). Environment variables remain supported and always take precedence over config-file values; omitted config keys fall back to built-in defaults.

Example:

```json
{
  "token": "replace-with-a-long-random-token",
  "projectsDir": "/workspaces",
  "workspaceRoot": "/workspaces",
  "host": "0.0.0.0",
  "port": 8070,
  "terminalHost": "127.0.0.1",
  "terminalPort": 3100,
  "initialProjects": [
    {
      "path": "~/src/devdeck",
      "name": "DevDeck",
      "description": "A web-based development environment"
    },
    {
      "path": "/workspaces/another-project"
    }
  ]
}
```

Supported keys and env overrides:

| Config key | Env override | Default |
| --- | --- | --- |
| `token` | `DEVDECK_TOKEN` | generated UUID persisted to config |
| `projectsDir` | `DEVDECK_PROJECTS_DIR` | `/workspaces` |
| `workspaceRoot` | `DEVDECK_WORKSPACE_ROOT` | user home directory |
| `host` | `DEVDECK_HOST` | `0.0.0.0` |
| `port` | `PORT` | `8070` |
| `terminalHost` | `TERMINAL_HOST` | `127.0.0.1` |
| `terminalPort` | `TERMINAL_PORT` | `3100` |
| `initialProjects` | none | `[]` |

`DEVDECK_DATA_DIR` is env-only because it determines where `config.json` is read from; a `dataDir` key in the config file is ignored with a warning. If neither `DEVDECK_TOKEN` nor a config `token` is provided, DevDeck generates a UUID once and persists it to `config.json` with private POSIX permissions where supported. Generated first-run tokens are printed in full; env/config tokens are masked as `[redacted:env]` or `[redacted:config]` in startup logs.

`initialProjects` seeds manual project registry entries additively and idempotently during `just dev` / `npm run dev:all` startup. Each entry must be an object with a required `path` and optional string `name`/`description`. Paths are resolved server-side, support leading `~`, must point to existing directories, and are skipped when they duplicate an existing slug/path or collide with an auto-discovered project. Optional metadata is trimmed before being saved; blank `name` or `description` values are omitted.

Security note: `config.json` may contain a bearer token and should be treated as sensitive. The config-file loader currently runs through the development startup wrapper (`src/server/start-dev.mts`); production `next start` remains env-driven for this issue, so production deployments should provide the same values with environment variables.

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — pipeline workflow, how to contribute via GitHub Issues, and where artifacts belong
- [`AGENTS.md`](AGENTS.md) — agent definitions, guardrails, and pipeline specification
- [`docs/`](docs/) — application-specific documentation (API docs, user guides, etc.)
- [`project/`](project/) — architecture decisions, core-components, and per-issue pipeline artifacts
